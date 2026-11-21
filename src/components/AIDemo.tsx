import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RotateCcw, Send, Sparkles } from 'lucide-react';
import AIReplyTools from './AIReplyTools';
import { readActivitySessions, saveActivitySessions } from '../lib/aiSessions';
import './ai-demo.css';

const modes = [
  { id: 'chat', title: 'Chat', hint: 'Make room for curiosity.', prompt: 'Help me plan a productive afternoon.', sample: 'A productive afternoon can start with one small win:\n\n1. Pick the one task that matters most.\n2. Work on it for 25 minutes, then take a short break.\n3. Leave a little room for something you enjoy.\n\nWhat would you put first on your list?' },
  { id: 'writing', title: 'Writing', hint: 'Find the words. Make them yours.', prompt: 'Draft a friendly invitation to a study group.', sample: 'Hey everyone! Want to study together this week? Bring one topic you want to practice and one question to share. We can review the tricky parts, take a short break, and quiz each other at the end. Let me know what time works for you!' },
  { id: 'studying', title: 'Studying', hint: 'Turn a big topic into a small next step.', prompt: 'Give me a practice quiz about the water cycle.', sample: 'Water cycle practice\n\n1. What turns liquid water into water vapor?\n2. What happens when water vapor cools into droplets?\n3. What is rain or snow falling from clouds called?\n\nTry first, then check: 1. Evaporation. 2. Condensation. 3. Precipitation.' },
  { id: 'coding', title: 'Coding', hint: 'Think it through, one line at a time.', prompt: 'Show a JavaScript function that adds two numbers.', sample: 'function add(a, b) {\n  return a + b;\n}\n\nadd(2, 3); // 5\n\nThe function receives two numbers and returns their sum. Try a negative number next: add(-2, 3) returns 1.' },
  { id: 'brainstorming', title: 'Brainstorming', hint: 'Give your next idea somewhere to start.', prompt: 'Help me brainstorm names for a space club.', sample: 'Space club name ideas\n\n• Orbit Crew\n• The Curiosity Constellation\n• Beyond the Blue\n• Starlight Society\n• Mission: What If?\n\nPick a mood first: playful, adventurous, or thoughtful. Then try your favorite name out loud.' },
] as const;

type ModeId = typeof modes[number]['id'];
type Message = { id: number; role: 'user' | 'sample'; content: string };
const SESSION_KEY = 'turbo-sample-ai-sessions';

export default function AIDemo({ active = true }: { active?: boolean }) {
  const [sessions] = useState(() => readActivitySessions(SESSION_KEY, ['user', 'sample'] as const));
  const saved = sessions.get('chat');
  const [modeId, setModeId] = useState<ModeId>('chat');
  const [prompt, setPrompt] = useState(() => saved?.prompt || '');
  const [messages, setMessages] = useState<Message[]>(() => saved?.messages || []);
  const [following, setFollowing] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const nextId = useRef(1 + Math.max(-1, ...[...sessions.values()].flatMap(session => session.messages.map(message => message.id))));
  const mode = modes.find(item => item.id === modeId)!;
  useEffect(() => {
    sessions.set(modeId, { messages, prompt });
    const timer = window.setTimeout(() => saveActivitySessions(SESSION_KEY, sessions), 250);
    return () => window.clearTimeout(timer);
  }, [modeId, messages, prompt]);
  useEffect(() => {
    const save = () => saveActivitySessions(SESSION_KEY, sessions);
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('pagehide', save); save(); };
  }, []);
  useEffect(() => {
    if (active && following && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages, following, active]);

  function chooseMode(id: ModeId) {
    if (id === modeId) return;
    sessions.set(modeId, { messages, prompt });
    const previous = sessions.get(id);
    setModeId(id);
    setMessages(previous?.messages || []);
    setPrompt(previous?.prompt || '');
    setFollowing(true);
  }

  function send(text: string) {
    const question = text.trim();
    if (!question) return;
    const reply = question === mode.prompt ? mode.sample
      : `This demo cannot generate a custom answer. Here is a prewritten ${mode.title.toLowerCase()} example you can explore instead:\n\n${mode.sample}`;
    const userId = nextId.current++;
    const sampleId = nextId.current++;
    setMessages(current => [...current, { id: userId, role: 'user', content: question }, { id: sampleId, role: 'sample', content: reply }]);
    setPrompt('');
    setFollowing(true);
    input.current?.focus();
  }

  return <section className="ai-section content-section" aria-labelledby="ai-title">
    <div className="section-kicker"><span className="short-line" /> A LITTLE SPARK FOR YOUR NEXT IDEA</div>
    <div className="ai-heading"><div><h1 id="ai-title">Big questions.<br /><span>Start here.</span></h1><p>Chat, write, study, code, or brainstorm. Take the demo for a spin.</p></div><span className="ai-demo-badge"><Sparkles size={15} /> AI DEMO</span></div>
    <div className="ai-notice" id="ai-demo-notice"><strong>Demo · prewritten sample replies</strong><p>This preview does not generate AI answers or search the web. No API key needed. Your prompts are not sent to a model. Recent chats and drafts recover in this tab.</p></div>
    <div className="ai-workspace">
      <aside className="ai-sidebar" aria-label="Choose a demo activity"><span className="eyebrow">MAKE SPACE FOR</span><div className="ai-modes">{modes.map(item => <button key={item.id} aria-pressed={item.id === modeId} onClick={() => chooseMode(item.id)}>{item.title}<ArrowUpRight size={15} /></button>)}</div><p>Choose an activity, then try a starter prompt or type your own.</p></aside>
      <div className="ai-chat">
        <div className="ai-chat-top"><div><h2>{mode.title}</h2><p>{mode.hint}</p></div><button className="text-button" disabled={!messages.length && !prompt} onClick={() => { setMessages([]); setPrompt(''); input.current?.focus(); }}><RotateCcw size={14} />Clear chat</button></div>
        <div className="ai-messages" ref={conversation} role="log" aria-label="Demo conversation" aria-live="polite" aria-relevant="additions" onScroll={event => { const element = event.currentTarget; setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 60); }}>
          {!messages.length && <div className="ai-welcome"><Sparkles size={27} /><h3>What are you curious about?</h3><p>Try the starter below to see a sample response.</p></div>}
          {messages.map(message => <article className={`ai-message ai-message-${message.role}`} key={message.id}><strong>{message.role === 'user' ? 'You' : 'Demo · sample reply'}</strong><p>{message.content}</p>{message.role === 'sample' && <AIReplyTools text={message.content} label={`sample reply ${message.id + 1}`} />}</article>)}
        </div>
        {!following && !!messages.length && <button className="ai-scroll-latest" onClick={() => setFollowing(true)}>Jump to latest reply</button>}
        <div className="ai-starters" aria-label="Starter prompts"><button onClick={() => send(mode.prompt)}>{mode.prompt}<ArrowUpRight size={14} /></button></div>
        <form className="ai-composer" aria-describedby="ai-demo-notice" onSubmit={event => { event.preventDefault(); send(prompt); }}><label htmlFor="ai-prompt">Your prompt</label><textarea id="ai-prompt" ref={input} value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); send(prompt); } }} aria-describedby="ai-demo-shortcut" placeholder={`Try a ${mode.title.toLowerCase()} prompt…`} rows={3} maxLength={2000} /><span className="ai-keyboard-hint" id="ai-demo-shortcut">Ctrl or ⌘ + Enter to send · Enter for a new line</span><div><span>{prompt.length} / 2,000</span><button className="primary-button" type="submit" disabled={!prompt.trim()}>Try demo <Send size={15} /></button></div></form>
      </div>
    </div>
  </section>;
}
