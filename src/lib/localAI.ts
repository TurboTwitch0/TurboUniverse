import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';

export const LOCAL_AI_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const FLOAT32_MODEL = 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC';
const LOAD_TIMEOUT_MS = 5 * 60 * 1000;
const REPLY_TIMEOUT_MS = 90 * 1000;

export type LocalMessage = { role: 'user' | 'assistant'; content: string };
type ProgressCallback = (progress: number, text: string) => void;
type GPUAccess = { requestAdapter(): Promise<{ features: { has(feature: string): boolean } } | null> };
type Loading = {
  id: number;
  promise: Promise<void>;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type Generation = {
  stopped: boolean;
  text: string;
  cancel: (error: Error) => void;
  stop: () => void;
};

let lifecycle = 0;
let worker: Worker | null = null;
let engine: WebWorkerMLCEngine | null = null;
let loading: Loading | null = null;
let generation: Generation | null = null;

function cancelled() {
  return new DOMException('Local AI was cancelled.', 'AbortError');
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function release(error: Error) {
  lifecycle += 1;
  if (loading) {
    clearTimeout(loading.timer);
    loading.reject(error);
    loading = null;
  }
  if (generation) {
    generation.stopped = true;
    generation.cancel(error);
    generation = null;
  }
  engine = null;
  worker?.terminate();
  worker = null;
}

/** Starts the public model download only when the UI explicitly calls this. */
export function loadLocalAI(onProgress: ProgressCallback): Promise<void> {
  if (engine) {
    onProgress(1, 'Local AI is ready.');
    return Promise.resolve();
  }
  if (loading) return loading.promise;

  const id = ++lifecycle;
  let resolveLoad!: () => void;
  let rejectLoad!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveLoad = resolve;
    rejectLoad = reject;
  });
  const timer = setTimeout(() => {
    if (loading?.id === id) {
      release(new Error('The local AI download took too long. Check your connection and try again.'));
    }
  }, LOAD_TIMEOUT_MS);
  const operation: Loading = { id, promise, reject: rejectLoad, timer };
  loading = operation;

  void (async () => {
    try {
      onProgress(0, 'Checking your browser for local AI support…');
      if (!window.isSecureContext) {
        throw new Error('Local AI requires a secure connection. Open this site with HTTPS.');
      }
      const gpu = (navigator as Navigator & { gpu?: GPUAccess }).gpu;
      if (!gpu) {
        throw new Error('This browser does not support WebGPU. Use a current version of Chrome or Edge with hardware acceleration enabled.');
      }
      const adapter = await gpu.requestAdapter();
      if (id !== lifecycle) return;
      if (!adapter) {
        throw new Error('Your browser could not access a compatible graphics device. Enable hardware acceleration in Chrome or Edge, then try again.');
      }
      const model = adapter.features.has('shader-f16') ? LOCAL_AI_MODEL : FLOAT32_MODEL;
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      if (id !== lifecycle) return;

      const modelWorker = new Worker(new URL('./local-ai.worker.ts', import.meta.url), { type: 'module' });
      worker = modelWorker;
      modelWorker.addEventListener('error', () => {
        if (id === lifecycle) {
          release(new Error('Local AI stopped unexpectedly. Reload the model and try again.'));
        }
      });
      const loaded = await CreateWebWorkerMLCEngine(modelWorker, model, {
        initProgressCallback: report => {
          if (id === lifecycle) onProgress(Math.min(1, Math.max(0, report.progress)), report.text);
        },
      }, { context_window_size: 2048 });
      if (id !== lifecycle) {
        modelWorker.terminate();
        return;
      }
      engine = loaded;
      onProgress(1, 'Local AI is ready.');
      resolveLoad();
    } catch (error) {
      if (id === lifecycle) release(asError(error));
    } finally {
      clearTimeout(timer);
      if (loading === operation) loading = null;
    }
  })();
  return promise;
}

// A byte limit also bounds byte-level tokenization for emoji and other scripts.
function boundedText(value: string, maxCharacters: number, maxBytes: number): string {
  const encoder = new TextEncoder();
  let text = '';
  let bytes = 0;
  for (const character of value.slice(0, maxCharacters)) {
    const size = encoder.encode(character).length;
    if (bytes + size > maxBytes) break;
    text += character;
    bytes += size;
  }
  return text;
}

function recentMessages(messages: LocalMessage[]): LocalMessage[] {
  const recent: LocalMessage[] = [];
  let characters = 2400;
  let bytes = 1200;
  for (const message of messages.slice(-6).reverse()) {
    const content = boundedText(message.content.trim(), characters, bytes);
    if (!content) continue;
    recent.unshift({ role: message.role, content });
    characters -= content.length;
    bytes -= new TextEncoder().encode(content).length;
    if (characters <= 0 || bytes <= 0) break;
  }
  // A truncated conversation must still begin with a user turn.
  while (recent[0]?.role === 'assistant') recent.shift();
  return recent;
}

/** onText receives the accumulated reply, allowing the UI to replace its text. */
export async function generateLocalReply(
  messages: LocalMessage[],
  activity: string,
  onText: (text: string) => void,
): Promise<string> {
  const currentEngine = engine;
  if (!currentEngine) throw new Error('Download and load local AI before starting a conversation.');
  if (generation) throw new Error('Local AI is already replying. Stop the current reply first.');
  const history = recentMessages(messages);
  if (history.at(-1)?.role !== 'user') throw new Error('Enter a message before asking local AI to reply.');

  const id = lifecycle;
  let resolveStop!: (text: string) => void;
  let rejectCancelled!: (error: Error) => void;
  const interruption = new Promise<string>((resolve, reject) => {
    resolveStop = resolve;
    rejectCancelled = reject;
  });
  const operation: Generation = {
    stopped: false,
    text: '',
    cancel: rejectCancelled,
    stop: () => resolveStop(operation.text),
  };
  generation = operation;
  const timer = setTimeout(() => {
    if (generation !== operation) return;
    currentEngine.interruptGenerate();
    release(new Error('Local AI took too long to reply. Reload the model and try a shorter message.'));
  }, REPLY_TIMEOUT_MS);

  const reply = (async () => {
    const context = boundedText(activity.trim(), 160, 160);
    const chunks = await currentEngine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are Turbo, a friendly assistant in Turbo Universe. Give brief, helpful, honest answers. You run locally and cannot browse or take actions.'
            + (context ? ` The user is viewing: ${context}.` : ''),
        },
        ...history,
      ],
      max_tokens: 192,
      temperature: 0.7,
      stream: true,
    });
    for await (const chunk of chunks) {
      if (operation.stopped || id !== lifecycle) return operation.text;
      operation.text += chunk.choices[0]?.delta.content ?? '';
      onText(operation.text);
    }
    if (!operation.stopped && !operation.text.trim()) {
      throw new Error('Local AI returned an empty reply. Try asking a shorter question.');
    }
    return operation.text;
  })();

  try {
    return await Promise.race([reply, interruption]);
  } finally {
    clearTimeout(timer);
    if (generation === operation) generation = null;
  }
}

export function stopLocalReply(): void {
  const operation = generation;
  if (!operation) return;
  operation.stopped = true;
  engine?.interruptGenerate();
  operation.stop();
}

/** Worker termination cancels loading/generation and releases graphics memory. */
export function unloadLocalAI(): void {
  release(cancelled());
}
