import { useEffect, useRef, useState } from 'react';
import AIDemo from './AIDemo';
import LocalAIChat from './LocalAIChat';

export default function AIStudio({ initialPrompt = '', active = true, starterRequest = 0 }: { initialPrompt?: string; active?: boolean; starterRequest?: number }) {
  const [source, setSource] = useState<'local' | 'sample'>('local');
  const [sampleOpened, setSampleOpened] = useState(false);
  const sampleTrigger = useRef<HTMLButtonElement>(null);
  const previousStarter = useRef({ prompt: initialPrompt, request: starterRequest });
  useEffect(() => {
    if (initialPrompt && (initialPrompt !== previousStarter.current.prompt || starterRequest !== previousStarter.current.request)) setSource('local');
    previousStarter.current = { prompt: initialPrompt, request: starterRequest };
  }, [initialPrompt, starterRequest]);
  function openSamples(moveFocus = false) {
    setSampleOpened(true);
    setSource('sample');
    if (moveFocus) window.requestAnimationFrame(() => {
      sampleTrigger.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
      sampleTrigger.current?.focus({ preventScroll: true });
    });
  }
  return <>
    <div className="ai-source-switch content-section" role="group" aria-label="Choose AI experience">
      <button aria-pressed={source === 'local'} onClick={() => setSource('local')}>Free local AI</button>
      <button ref={sampleTrigger} aria-pressed={source === 'sample'} onClick={() => openSamples()}>Sample tour</button>
    </div>
    <div hidden={source !== 'local'}><LocalAIChat initialPrompt={initialPrompt} starterRequest={starterRequest} active={active && source === 'local'} onSampleTour={() => openSamples(true)} /></div>
    {sampleOpened && <div hidden={source !== 'sample'}><AIDemo active={active && source === 'sample'} /></div>}
  </>;
}
