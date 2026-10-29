import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, ChevronDown, Cpu, Laptop, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import LocalAIChat from './LocalAIChat';
import './chromebook-ai.css';

type BrowserStatus = 'unchecked' | 'checking' | 'available' | 'insecure' | 'unsupported' | 'unavailable';
type GPUAccess = { requestAdapter: () => Promise<unknown | null> };

const browserCopy: Record<BrowserStatus, { title: string; description: string }> = {
  unchecked: { title: 'Start with a quick browser check.', description: 'See whether this browser can access WebGPU. This check does not download a model.' },
  checking: { title: 'Checking graphics access…', description: 'Asking this browser for a WebGPU adapter. No model is being downloaded.' },
  available: { title: 'WebGPU is available here.', description: 'This browser provided a graphics adapter. You can choose to download the model below. Memory and device settings still affect whether it can load.' },
  insecure: { title: 'A secure connection is needed.', description: 'Open TurboUniverse over HTTPS to use local AI. No model has been downloaded by this check.' },
  unsupported: { title: 'WebGPU is not available in this browser.', description: 'Local AI needs a compatible current Chrome browser with WebGPU access. This device or its management settings may not provide it.' },
  unavailable: { title: 'Graphics access could not be confirmed.', description: 'The browser did not provide a WebGPU adapter in time. Local AI may be unavailable on this device. You can repeat the check, or explore the prewritten example.' },
};

export default function ChromebookAI({ initialPrompt = '' }: { initialPrompt?: string }) {
  const [browserStatus, setBrowserStatus] = useState<BrowserStatus>('unchecked');
  const checkRun = useRef(0);
  const checkTimer = useRef<number | undefined>(undefined);
  const workspace = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    return () => {
      checkRun.current += 1;
      window.clearTimeout(checkTimer.current);
    };
  }, []);

  async function checkBrowser() {
    if (browserStatus === 'checking') return;
    const current = ++checkRun.current;
    if (!window.isSecureContext) { setBrowserStatus('insecure'); return; }
    const gpu = (navigator as Navigator & { gpu?: GPUAccess }).gpu;
    if (!gpu) { setBrowserStatus('unsupported'); return; }
    setBrowserStatus('checking');
    try {
      const adapter = await Promise.race([
        gpu.requestAdapter(),
        new Promise<null>(resolve => { checkTimer.current = window.setTimeout(() => resolve(null), 8000); }),
      ]);
      if (checkRun.current === current) setBrowserStatus(adapter ? 'available' : 'unavailable');
    } catch {
      if (checkRun.current === current) setBrowserStatus('unavailable');
    } finally {
      window.clearTimeout(checkTimer.current);
    }
  }

  const feedback = browserCopy[browserStatus];
  const checked = browserStatus !== 'unchecked' && browserStatus !== 'checking';

  function focusWorkspace() {
    const reducedMotion = document.documentElement.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    workspace.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    workspace.current?.focus({ preventScroll: true });
  }

  return <section className="chromebook-ai content-section" aria-labelledby="chromebook-ai-title">
    <header className="cbai-hero">
      <div className="cbai-hero-copy">
        <div className="section-kicker"><span className="short-line" /> A LITTLE MORE POSSIBLE</div>
        <span className="cbai-product-label"><Laptop size={15} aria-hidden="true" /> YOUR BROWSER. YOUR IDEAS.</span>
        <h1 id="chromebook-ai-title" ref={title} tabIndex={-1}>AI <span>(Chromebooks)</span></h1>
        <p className="cbai-hero-description">Real AI replies, powered by your device. Start a draft, untangle a topic, or give your next idea a little momentum.</p>
        <button className="primary-button cbai-workspace-link" type="button" onClick={focusWorkspace}>Find your starting point<ArrowDown size={17} aria-hidden="true" /></button>
        <ul className="cbai-promises" aria-label="Local AI essentials"><li><Check size={14} aria-hidden="true" />No account</li><li><Check size={14} aria-hidden="true" />No API key</li><li><Check size={14} aria-hidden="true" />Your choice to download</li></ul>
      </div>
      <aside className="cbai-engine-card" aria-label="On-device model requirements">
        <div className="cbai-engine-top"><span><span className="cbai-status-dot" />ON-DEVICE AI</span><ShieldCheck size={18} aria-hidden="true" /></div>
        <div className="cbai-engine-visual" aria-hidden="true"><span><Cpu size={37} strokeWidth={1.3} /></span><b>SMALL MODEL. BIG POSSIBILITIES.</b></div>
        <div className="cbai-engine-name"><span>THE LOCAL ENGINE</span><strong>Qwen2.5 <small>0.5B</small></strong><p>Generated in your browser with WebLLM.</p></div>
        <dl className="cbai-specs"><div><dt>Optional download</dt><dd>~300 MB</dd></div><div><dt>Working memory</dt><dd>~1 GB</dd></div></dl>
      </aside>
    </header>

    <div className="cbai-preflight">
      <section className="cbai-browser-check" aria-labelledby="cbai-check-title">
        <div className="cbai-check-heading"><span className="cbai-check-icon"><Laptop size={23} aria-hidden="true" /></span><div><span className="eyebrow">OPTIONAL / NO DOWNLOAD</span><h2 id="cbai-check-title">Meet your browser.</h2></div></div>
        <p id="cbai-check-scope">Compatible Chromebooks need current Chrome and WebGPU access. This check looks at the secure connection and graphics adapter only.</p>
        <button className="secondary-button cbai-check-button" type="button" onClick={() => void checkBrowser()} disabled={browserStatus === 'checking'} aria-describedby="cbai-check-scope">{browserStatus === 'checking' ? <span className="cbai-check-spinner"><LoaderCircle size={16} aria-hidden="true" /></span> : <ShieldCheck size={16} aria-hidden="true" />}{browserStatus === 'checking' ? 'Checking browser…' : checked ? 'Check this browser again' : 'Check this browser'}</button>
        <div className="cbai-check-result" data-status={browserStatus} role="status" aria-live="polite" aria-atomic="true"><strong>{feedback.title}</strong><p>{feedback.description}</p></div>
        <p className="cbai-compatibility-note">Availability depends on your device, browser, and organization’s settings. Check this browser before choosing the model download. <a href="https://developer.chrome.com/docs/web-platform/webgpu/overview/" target="_blank" rel="noopener noreferrer">About WebGPU<ArrowUpRight size={12} aria-hidden="true" /><span className="cbai-sr-only"> (opens in a new tab)</span></a></p>
      </section>
      <aside className="cbai-getting-started" aria-labelledby="cbai-start-title">
        <span className="cbai-start-icon"><Sparkles size={22} aria-hidden="true" /></span>
        <h2 id="cbai-start-title">Start small.<br /> See where it goes.</h2>
        <p>Pick an activity below. When you choose <strong>Download free model</strong>, the real local model downloads before chat becomes available.</p>
        <p>It can make mistakes. It cannot browse the web or access your accounts.</p>
        <details className="cbai-sample-tour"><summary>Sample tour · prewritten example<ChevronDown size={15} aria-hidden="true" /></summary><div><strong>Example prompt</strong><p>Help me make a simple study plan.</p><strong>Prewritten example reply</strong><p>Pick one topic. Spend 20 minutes reviewing it, then try a practice question without your notes. Take a short break and choose the next small step.</p><span>This sample is here to preview the experience. It is not generated by AI.</span></div></details>
      </aside>
    </div>

    <div className="cbai-workspace" id="chromebook-ai-workspace" ref={workspace} tabIndex={-1} role="group" aria-labelledby="local-ai-title">
      <LocalAIChat initialPrompt={initialPrompt} embedded errorHelp="You can retry when you have a stable connection and enough free memory. The browser check confirms graphics access only; it cannot guarantee that a model will load." />
    </div>
  </section>;
}
