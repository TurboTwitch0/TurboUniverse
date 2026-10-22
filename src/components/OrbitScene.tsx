import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Globe2, Shuffle, Smartphone, Sparkles } from 'lucide-react';

type World = { id: string; title: string; type: 'website' | 'app' };

export default function OrbitScene<T extends World>({ projects, onSelect }: { projects: T[]; onSelect: (project: T) => void }) {
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const satellites = projects.filter(project => project.type === 'app').slice(0, 1);
  satellites.unshift(...projects.filter(project => project.type === 'website').slice(0, 2));

  function discover() {
    if (!projects.length) return;
    setSpinning(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSpinning(false);
      onSelect(projects[Math.floor(Math.random() * projects.length)]);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off' ? 0 : 480);
  }

  return <div className={`orbit-scene neptune-orbit-scene ${spinning ? 'is-spinning' : ''}`}>
    <div className="orbit-system-label"><span className="status-dot" /> NEPTUNE / DISCOVERY SYSTEM</div>
    <div className="neptune-starfield" aria-hidden="true" />
    <div className="turbo-orbit-halo" aria-hidden="true" />
    <div className="turbo-orbit-track track-back" aria-hidden="true"><i /></div>
    <div className="turbo-orbit-track track-cross" aria-hidden="true" />
    <span className="orbit-star orbit-star-one" aria-hidden="true">✦</span><span className="orbit-star orbit-star-two" aria-hidden="true">+</span>
    <button className="turbo-orbit-core" onClick={discover} disabled={!projects.length} aria-label="Discover a random world" title="Discover a random world"><span className="neptune-clouds" aria-hidden="true" /><span className="neptune-storm" aria-hidden="true" /><span className="neptune-cloud-streak" aria-hidden="true" /><span className="core-grain" aria-hidden="true" /><span className="core-letter" aria-hidden="true">T</span><span className="core-glint" aria-hidden="true" /></button>
    <div className="turbo-orbit-track track-front" aria-hidden="true" />
    {satellites.slice(0, 3).map((project, index) => <button className={`orbit-world orbit-world-${index + 1}`} key={project.id} onClick={() => onSelect(project)} aria-label={`Open orbit world ${project.title}`}>
      <span className="orbit-world-icon">{project.type === 'app' ? <Smartphone size={16} /> : <Globe2 size={16} />}</span><span><small>{project.type === 'app' ? 'AN APP IN ORBIT' : 'A WORLD TO EXPLORE'}</small><strong>{project.title}</strong></span><ArrowUpRight size={13} />
    </button>)}
    <div className="orbit-bottom-label"><Sparkles size={12} /><span>{projects.length} WORLDS. ENDLESS DISCOVERY.</span></div>
    <button className="orbit-discover" onClick={discover} disabled={!projects.length}><Shuffle size={12} /> Spin the universe <ArrowUpRight size={12} /></button>
  </div>;
}
