import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the real lifecycle with a small controllable stream instead of downloading model weights.
registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@mlc-ai/web-llm'
      ? { url: 'local-ai:fixture', shortCircuit: true }
      : next(specifier, context);
  },
  load(url, context, next) {
    return url === 'local-ai:fixture'
      ? { format: 'module', source: 'export const CreateWebWorkerMLCEngine = (...args) => globalThis.localAITestFactory(...args);', shortCircuit: true }
      : next(url, context);
  },
});

let fixtureId = 0;
const chunk = content => ({ choices: [{ delta: { content } }] });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t, stream) {
  const previous = new Map(['window', 'navigator', 'Worker', 'localAITestFactory'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const workers = [];
  let interrupts = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { gpu: { requestAdapter: async () => ({ features: { has: () => true } }) } } });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class {
    terminated = false;
    constructor() { workers.push(this); }
    addEventListener() {}
    terminate() { this.terminated = true; }
  } });
  globalThis.localAITestFactory = async (_, __, options) => {
    options.initProgressCallback({ progress: .6, text: 'Loading fixture' });
    return { chat: { completions: { create: stream } }, interruptGenerate() { interrupts++; } };
  };
  const local = await import(`../src/lib/localAI.ts?fixture=${fixtureId++}`);
  t.after(() => {
    local.unloadLocalAI();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await local.loadLocalAI(() => {});
  return { local, workers, interrupts: () => interrupts };
}

test('Stop waits for the old stream to settle before another reply can begin', async t => {
  const gate = deferred();
  let replies = 0;
  const { local, interrupts } = await fixture(t, async function* () {
    replies++;
    yield chunk(replies === 1 ? 'Partial reply' : 'Fresh reply');
    if (replies === 1) { await gate.promise; yield chunk(' ignored after stop'); }
  });
  let finished = false;
  const first = local.generateLocalReply([{ role: 'user', content: 'Hello' }], 'Chat', () => {}).then(value => { finished = true; return value; });
  await tick();
  local.stopLocalReply();
  await tick();
  assert.equal(interrupts(), 1);
  assert.equal(finished, false, 'Stop must not advertise a free engine while its previous stream is active');
  assert.equal(local.getLocalAIState().busy, true, 'Other workspaces must wait for the old stream');
  await assert.rejects(local.generateLocalReply([{ role: 'user', content: 'Next' }], 'Chat', () => {}), /already replying/);
  gate.resolve();
  assert.equal(await first, 'Partial reply');
  assert.equal(local.getLocalAIState().busy, false);
  assert.equal(await local.generateLocalReply([{ role: 'user', content: 'Next' }], 'Chat', () => {}), 'Fresh reply');
});

test('A stalled Stop releases the worker and asks for a model reload', async t => {
  const gate = deferred();
  const { local, workers } = await fixture(t, async function* () { yield chunk('Partial'); await gate.promise; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = local.generateLocalReply([{ role: 'user', content: 'Hello' }], 'Chat', () => {});
  await tick();
  local.stopLocalReply();
  const rejection = assert.rejects(pending, /could not stop cleanly/);
  t.mock.timers.tick(3000);
  await rejection;
  assert.equal(workers[0].terminated, true);
  assert.equal(local.getLocalAIState().status, 'idle');
  gate.resolve();
});

test('Shared workspaces keep a loaded model until the last workspace leaves', async t => {
  const { local, workers } = await fixture(t, async function* () { yield chunk('Reply'); });
  const states = [];
  const first = local.subscribeLocalAI(state => states.push(state.status));
  const second = local.subscribeLocalAI(() => {});
  assert.equal(states.at(-1), 'ready');
  first();
  assert.equal(workers[0].terminated, false, 'Leaving one workspace must preserve the other workspace model');
  second();
  assert.equal(workers[0].terminated, true);
  assert.equal(local.getLocalAIState().status, 'idle');
});

test('The latest prompt is passed in full or rejected before generation, including multibyte text', async t => {
  const requests = [];
  const { local } = await fixture(t, async function* (request) { requests.push(request); yield chunk('Reply'); });
  const fullPrompt = 'A'.repeat(local.LOCAL_AI_INPUT_MAX_BYTES - 18) + ' Critical question';
  await local.generateLocalReply([{ role: 'user', content: fullPrompt }], 'Chat', () => {});
  assert.equal(requests.at(-1).messages.at(-1).content, fullPrompt);
  const emoji = '🚀'.repeat(local.LOCAL_AI_INPUT_MAX_BYTES / 4);
  await local.generateLocalReply([{ role: 'user', content: emoji }], 'Chat', () => {});
  assert.equal(requests.at(-1).messages.at(-1).content, emoji);
  await assert.rejects(local.generateLocalReply([{ role: 'user', content: emoji + '🚀' }], 'Chat', () => {}), /Shorten it/);
  await assert.rejects(local.generateLocalReply([{ role: 'user', content: 'A'.repeat(2000) }], 'Chat', () => {}), /Shorten it/);
  assert.equal(requests.length, 2, 'Oversized prompts must not start inference with silently shortened content');
});
