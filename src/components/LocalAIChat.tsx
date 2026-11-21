import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Check, Download, RotateCcw, Send, ShieldCheck, Sparkles, Square, X } from 'lucide-react';
import { generateLocalReply, getLocalAIState, getLocalPromptError, loadLocalAI, stopLocalReply, subscribeLocalAI, unloadLocalAI, type LocalMessage } from '../lib/localAI';
import AIReplyTools from './AIReplyTools';
import { readActivitySessions, saveActivitySessions } from '../lib/aiSessions';
import './ai-demo.css';

const activities = [
  { title: 'Chat', hint: 'Make room for curiosity.', prompt: 'Explain why the sky is blue in three simple sentences.' },
  { title: 'Writing', hint: 'Find the words. Make them yours.', prompt: 'Write a friendly invitation to a weekend study group.' },
  { title: 'Studying', hint: 'A small step toward understanding.', prompt: 'Explain evaporation, then ask me one practice question.' },
  { title: 'Coding', hint: 'Build your understanding, one line at a time.', prompt: 'Show a short JavaScript function that adds two numbers, and explain it.' },
  { title: 'Brainstorming', hint: 'Give your next idea somewhere to start.', prompt: 'Suggest five fun names for a space club.' },
];
type Message = LocalMessage & { id: number };
type Props = { initialPrompt?: string; embedded?: boolean; errorHelp?: string; active?: boolean; onSampleTour?: () => void; starterRequest?: number };

export default function LocalAIChat({ initialPrompt = '', embedded = false, errorHelp = 'You can retry, or choose Sample tour to explore prewritten examples.', active = true, onSampleTour, starterRequest = 0 }: Props) {
  const id = useId();
  const titleId = `${id}-title`;
  const noticeId = `${id}-notice`;
  const promptId = `${id}-prompt`;
  const progressId = `${id}-download`;
  const shortcutId = `${id}-shortcut`;
  const limitId = `${id}-limit`;
  const sessionKey = embedded ? 'turbo-chromebook-ai-sessions' : 'turbo-local-ai-sessions';
  const [sessions] = useState(() => readActivitySessions(sessionKey, ['user', 'assistant'] as const));
  const saved = sessions.get(activities[0].title);
  const [activity, setActivity] = useState(activities[0]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>(() => getLocalAIState().status);
  const [progress, setProgress] = useState(() => getLocalAIState().progress);
  const [engineBusy, setEngineBusy] = useState(() => getLocalAIState().busy);
  const [messages, setMessages] = useState<Message[]>(() => saved?.messages || []);
  const [prompt, setPrompt] = useState(() => initialPrompt || saved?.prompt || '');
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [focusTarget, setFocusTarget] = useState<'reply' | 'load' | null>(null);
  const [following, setFollowing] = useState(true);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const attempt = useRef(0);
  const generating = useRef(false);
  const nextId = useRef(1 + Math.max(-1, ...[...sessions.values()].flatMap(session => session.messages.map(message => message.id))));
  const visible = useRef(active);
  const previousStarter = useRef({ prompt: initialPrompt, request: starterRequest });
  const promptError = getLocalPromptError(prompt);

  useEffect(() => {
    sessions.set(activity.title, { messages, prompt });
    const timer = window.setTimeout(() => saveActivitySessions(sessionKey, sessions), 250);
    return () => window.clearTimeout(timer);
  }, [activity.title, messages, prompt, sessionKey]);
  useEffect(() => {
    const save = () => saveActivitySessions(sessionKey, sessions);
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('pagehide', save); save(); };
  }, [sessionKey]);

  useEffect(() => {
    const unsubscribe = subscribeLocalAI(state => { setStatus(state.status); setProgress(state.progress); setEngineBusy(state.busy); });
    return () => {
      attempt.current += 1;
      if (generating.current) stopLocalReply();
      generating.current = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    visible.current = active;
    if (!active && generating.current) { setStopping(true); stopLocalReply(); }
  }, [active]);
  useEffect(() => {
    if (initialPrompt && (initialPrompt !== previousStarter.current.prompt || starterRequest !== previousStarter.current.request)) setPrompt(initialPrompt);
    previousStarter.current = { prompt: initialPrompt, request: starterRequest };
  }, [initialPrompt, starterRequest]);
  useEffect(() => {
    if (active && following && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages, following, active]);
  useEffect(() => {
    if (!focusTarget || busy) return;
    setFocusTarget(null);
    const focused = document.activeElement;
    const ownsFocus = focused === document.body || focused === input.current || !!focused?.closest('.ai-composer')
      || (focusTarget === 'load' && !!focused?.closest('.ai-model-panel'));
    if (active && input.current?.getClientRects().length && ownsFocus && !document.querySelector('[aria-modal="true"]')) {
      input.current.focus({ preventScroll: true });
    }
  }, [focusTarget, busy, active]);

  function chooseActivity(item: typeof activities[number]) {
    if (item.title === activity.title) return;
    sessions.set(activity.title, { messages, prompt });
    const previous = sessions.get(item.title);
    setActivity(item);
    setMessages(previous?.messages || []);
    setPrompt(previous?.prompt || '');
    setFollowing(true);
    setError('');
  }

  function unload() {
    attempt.current += 1;
    generating.current = false;
    unloadLocalAI();
    setBusy(false); setStopping(false); setFocusTarget(null); setStatus('idle'); setError(''); setProgress(0);
  }

  async function download() {
    const current = ++attempt.current;
    setStatus('loading'); setError(''); setProgress(0);
    try {
      await loadLocalAI(value => { if (attempt.current === current) setProgress(Math.max(0, Math.min(1, value))); });
      if (attempt.current === current) { setStatus('ready'); setFocusTarget('load'); }
    } catch (cause) {
      if (attempt.current !== current) return;
      setStatus('idle');
      setError(cause instanceof Error ? cause.message : 'The model could not load. Check your connection and try again.');
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || status !== 'ready' || generating.current || engineBusy) return;
    if (getLocalPromptError(question)) { input.current?.focus(); return; }
    generating.current = true;
    const current = ++attempt.current;
    const user: Message = { id: nextId.current++, role: 'user', content: question };
    const answerId = nextId.current++;
    const history = [...messages, user];
    setMessages([...history, { id: answerId, role: 'assistant', content: '' }]);
    setPrompt(''); setError(''); setBusy(true); setStopping(false); setFollowing(true);
    try {
      const reply = await generateLocalReply(history.map(({ role, content }) => ({ role, content })), activity.title, content => {
        if (attempt.current === current) setMessages(items => items.map(item => item.id === answerId ? { ...item, content } : item));
      });
      if (attempt.current === current && !reply.trim()) setMessages(items => items.filter(item => item.id !== answerId));
    } catch (cause) {
      if (attempt.current !== current) return;
      setPrompt(question);
      setMessages(items => items.filter(item => item.id !== answerId || item.content.trim()));
      unloadLocalAI(); setStatus('idle');
      setError(cause instanceof Error ? cause.message : 'The model could not finish. Try a shorter prompt.');
    } finally {
      if (attempt.current === current) { generating.current = false; setBusy(false); setStopping(false); if (visible.current) setFocusTarget('reply'); }
    }
  }

  return <section className={`ai-section ai-local-section content-section${embedded ? ' ai-local-embedded' : ''}`} aria-labelledby={titleId}>
    {!embedded && <div className="section-kicker"><span className="short-line" /> YOUR IDEAS. YOUR DEVICE.</div>}
    <div className="ai-heading"><div>{embedded ? <h2 id={titleId}>Your on-device workspace.</h2> : <h1 id={titleId}>A little intelligence.<br /><span>Zero API bills.</span></h1>}<p>Real replies for everyday questions, drafts, studying, and ideas.</p></div><span className="ai-demo-badge"><ShieldCheck size={16} /> ON-DEVICE AI</span></div>
    <div className="ai-notice ai-local-notice" id={noticeId}><strong>Free local model · no key or paid credits</strong><p>Qwen2.5 runs in your browser. Your prompts stay on your device; recent chats and drafts recover in this tab. This small model can make mistakes and cannot browse the web or access your accounts.</p></div>
    <div className="ai-model-panel">
      <div><span className="ai-model-icon">{status === 'ready' ? <Check size={23} /> : <Download size={23} />}</span><div><strong>{status === 'ready' ? 'Ready on this device' : status === 'loading' ? 'Getting your model ready…' : 'A small model. A fresh start.'}</strong><p>{status === 'ready' ? 'Qwen2.5 0.5B · replies are generated locally' : 'About 300 MB to download, plus roughly 1 GB of working memory. A compatible WebGPU browser is required. Model files are cached when your browser allows it.'}</p></div></div>
      {status === 'loading' ? <button className="secondary-button" onClick={unload}><X size={15} />Cancel download</button> : status === 'ready' ? <button className="text-button" disabled={busy} onClick={unload}>Unload model</button> : <button className="primary-button" onClick={() => void download()}><Download size={16} />Download free model</button>}
      {status === 'loading' && <div className="ai-download-progress" role="status"><label htmlFor={progressId}>Loading model · {Math.round(progress * 100)}%</label><progress id={progressId} value={progress} max={1} /></div>}
    </div>
    {error && <div className="ai-local-error" role="alert"><strong>We couldn’t finish that.</strong><p>{error}</p><p>{errorHelp}</p>{onSampleTour && <button className="secondary-button" onClick={onSampleTour}>Open sample tour</button>}</div>}
    <div className="ai-workspace">
      <aside className="ai-sidebar" aria-label="Choose an AI activity"><span className="eyebrow">MAKE SPACE FOR</span><div className="ai-modes">{activities.map(item => <button key={item.title} aria-pressed={activity.title === item.title} disabled={busy} onClick={() => chooseActivity(item)}>{item.title}<ArrowUpRight size={15} /></button>)}</div><p>No sign-in, subscription, or hosted AI service. Generation uses your device’s graphics hardware.</p></aside>
      <div className="ai-chat">
        <div className="ai-chat-top"><div><h2>{activity.title}</h2><p>{activity.hint}</p></div><button className="text-button" disabled={busy || (!messages.length && !prompt)} onClick={() => { setMessages([]); setPrompt(''); setError(''); input.current?.focus(); }}><RotateCcw size={14} />Clear chat</button></div>
        <div className="ai-messages" ref={conversation} role="log" aria-label="Local AI conversation" aria-live="polite" aria-relevant="additions text" aria-busy={busy} onScroll={event => { const element = event.currentTarget; setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 60); }}>
          {!messages.length && <div className="ai-welcome"><Sparkles size={27} /><h3>{status === 'ready' ? 'What are you curious about?' : 'Your next idea is waiting.'}</h3><p>{status === 'ready' ? 'Try a starter, or ask something in your own words.' : 'Download the free model above when you’re ready.'}</p></div>}
          {messages.map(message => <article className={`ai-message ai-message-${message.role}`} key={message.id}><strong>{message.role === 'user' ? 'You' : 'On-device AI · Qwen2.5'}</strong><p>{message.content || (busy ? 'Thinking…' : 'Generation stopped.')}</p>{message.role === 'assistant' && message.content.trim() && <AIReplyTools text={message.content} label={`AI reply ${message.id + 1}`} disabled={busy && message.id === messages.at(-1)?.id} />}</article>)}
        </div>
        {!following && !!messages.length && <button className="ai-scroll-latest" onClick={() => setFollowing(true)}>Jump to latest reply</button>}
        <div className="ai-starters" aria-label="AI starter prompts"><button disabled={busy || engineBusy || status !== 'ready'} onClick={() => void send(activity.prompt)}>{activity.prompt}<ArrowUpRight size={14} /></button></div>
        <form className="ai-composer" aria-describedby={noticeId} onSubmit={event => { event.preventDefault(); void send(prompt); }}><label htmlFor={promptId}>Your prompt</label><textarea id={promptId} ref={input} value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void send(prompt); } }} aria-describedby={`${shortcutId}${promptError ? ` ${limitId}` : ''}`} aria-invalid={!!promptError} placeholder={`Ask a ${activity.title.toLowerCase()} question…`} rows={3} maxLength={2000} disabled={busy} /><span className="ai-keyboard-hint" id={shortcutId}>Ctrl or ⌘ + Enter to send · Enter for a new line</span>{promptError && <p className="ai-prompt-limit" id={limitId} role="status">{promptError}</p>}<div><span>{prompt.length} / 2,000</span>{busy ? <button className="secondary-button" type="button" disabled={stopping} onClick={() => { setStopping(true); stopLocalReply(); }}><Square size={13} />{stopping ? 'Stopping reply…' : 'Stop reply'}</button> : <button className="primary-button" type="submit" disabled={!prompt.trim() || !!promptError || engineBusy || status !== 'ready'}><Send size={15} />Send prompt</button>}</div></form>
      </div>
    </div>
  </section>;
}
