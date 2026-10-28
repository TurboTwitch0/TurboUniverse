import { useState } from 'react';
import AIDemo from './AIDemo';
import LocalAIChat from './LocalAIChat';

export default function AIStudio() {
  const [source, setSource] = useState<'local' | 'sample'>('local');
  return <>
    <div className="ai-source-switch content-section" role="group" aria-label="Choose AI experience">
      <button aria-pressed={source === 'local'} onClick={() => setSource('local')}>Free local AI</button>
      <button aria-pressed={source === 'sample'} onClick={() => setSource('sample')}>Sample tour</button>
    </div>
    {source === 'local' ? <LocalAIChat /> : <AIDemo />}
  </>;
}
