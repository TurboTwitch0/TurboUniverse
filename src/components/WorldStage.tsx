import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Compass, MoveHorizontal, Star } from 'lucide-react';
import { getWorldPresentation, POPULAR_WORLDS } from '../popularWorlds';
import WorldImage from './WorldImage';
import './world-stage.css';

type World = { id: string; title: string; url: string; category: string; description: string; coverUrl?: string; status?: 'setup-pending' };
const scenes = ['cinematic-nebula', 'space-01', 'space-04', 'cinematic-horizon', 'space-03', 'space-06'];

export default function WorldStage<T extends World>({ projects, savedIds, mode, onSelect, onSave, onCategory, onLaunch }: {
  projects: T[]; savedIds: string[]; mode: 'earth' | 'space'; onSelect: (world: T) => void;
  onSave: (world: T) => void; onCategory: (category: string) => void; onLaunch: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const surface = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntil = useRef(0);
  const lightPosition = useRef<{ x: number; y: number } | null>(null);
  const lightFrame = useRef<number | undefined>(undefined);
  useEffect(() => () => { if (lightFrame.current !== undefined) cancelAnimationFrame(lightFrame.current); }, []);
  const featured = POPULAR_WORLDS.flatMap(item => {
    const world = projects.find(project => !project.status && getWorldPresentation(project)?.id === item.id);
    return world ? [world] : [];
  });
  const extras = projects.filter(world => !world.status && /^(TurboBrowser|EVOVO)$/i.test(world.title));
  const worlds = [...featured, ...extras].filter((world, position, list) => list.findIndex(item => item.id === world.id) === position).slice(0, 7);
  if (!worlds.length) return null;
  const current = ((index % worlds.length) + worlds.length) % worlds.length;
  const active = worlds[current];
  const offsets = worlds.length >= 5 ? [-2, -1, 0, 1, 2] : worlds.length >= 3 ? [-1, 0, 1] : worlds.length === 2 ? [0, 1] : [0];
  const step = (amount: number) => setIndex((current + amount + worlds.length) % worlds.length);

  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const destination = event.key === 'ArrowLeft' ? current - 1 : event.key === 'ArrowRight' ? current + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? worlds.length - 1 : null;
    if (destination === null) return;
    event.preventDefault();
    setIndex((destination + worlds.length) % worlds.length);
    if ((event.target as HTMLElement).closest('.world-stage-card')) requestAnimationFrame(() => surface.current?.querySelector<HTMLButtonElement>('.world-stage-card[data-active="true"]')?.focus({ preventScroll: true }));
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.isPrimary && event.pointerType !== 'mouse') touch.current = { x: event.clientX, y: event.clientY };
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    ignoreClickUntil.current = performance.now() + 350;
    step(dx < 0 ? 1 : -1);
  }
  function light(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    lightPosition.current = { x: event.clientX, y: event.clientY };
    if (lightFrame.current !== undefined) return;
    lightFrame.current = requestAnimationFrame(() => {
      lightFrame.current = undefined;
      const node = surface.current, point = lightPosition.current;
      if (!node || !point || document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      node.style.setProperty('--stage-light-x', `${Math.max(0, Math.min(100, (point.x - rect.left) / rect.width * 100))}%`);
      node.style.setProperty('--stage-light-y', `${Math.max(0, Math.min(100, (point.y - rect.top) / rect.height * 100))}%`);
    });
  }
  function resetLight() {
    if (lightFrame.current !== undefined) cancelAnimationFrame(lightFrame.current);
    lightFrame.current = undefined;
    lightPosition.current = null;
    surface.current?.style.removeProperty('--stage-light-x');
    surface.current?.style.removeProperty('--stage-light-y');
  }

  return <section className="world-stage content-section" aria-labelledby="world-stage-title" aria-roledescription="carousel" onKeyDown={keyboard}>
    <div className="world-stage-heading"><div><span className="eyebrow">A CURATED ORBIT / THE TURBO ECOSYSTEM</span><h2 id="world-stage-title">Pick a world.<br /><em>Make it yours.</em></h2></div><div className="world-stage-heading-note"><Compass size={21} strokeWidth={1.4} /><p>A different corner of your universe.<br />One good click away.</p></div></div>
    <div className="world-stage-frame">
      <div ref={surface} className="world-stage-viewport" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { touch.current = null; resetLight(); }} onPointerMove={light} onPointerLeave={resetLight}>
        <div className="world-stage-light" aria-hidden="true" /><div className="world-stage-floor" aria-hidden="true"><i /><i /><i /></div>
        <span className="world-stage-coordinate" aria-hidden="true">DISCOVERY SYSTEM / 01</span><span className="world-stage-corner" aria-hidden="true">+</span>
        <div className="world-stage-cards">
          {offsets.map(offset => {
            const position = (current + offset + worlds.length) % worlds.length;
            const world = worlds[position];
            const image = world.coverUrl || (mode === 'earth' ? `/images/${['earth-spring', 'earth-hero', 'earth-detail', 'earth-winter'][position % 4]}.webp` : getWorldPresentation(world)?.image || `/images/${scenes[position % scenes.length]}.webp`);
            return <button key={world.id} className="world-stage-card" data-offset={offset} data-active={offset === 0} aria-current={offset === 0 ? 'true' : undefined} aria-label={offset === 0 ? `View ${world.title} in orbital stage` : `Focus ${world.title} in orbital stage`} onClick={() => { if (performance.now() < ignoreClickUntil.current) return; if (offset === 0) onSelect(world); else setIndex(position); }}>
              <WorldImage src={image} fallbackSrc={mode === 'earth' ? '/images/earth-spring.webp' : '/images/cinematic-horizon.webp'} alt="" width="600" height="800" draggable={false} loading="lazy" />
              <span className="world-stage-card-glass" aria-hidden="true" /><span className="world-stage-card-category">{world.category}</span><span className="world-stage-card-name"><span>A TURBO WORLD</span><strong>{world.title}</strong><small>{getWorldPresentation(world)?.tagline || 'Another possibility, waiting to be explored.'}</small></span><span className="world-stage-card-bottom">EXPLORE THIS WORLD<ArrowUpRight size={17} /></span>
            </button>;
          })}
        </div>
        <div className="world-stage-controls"><button className="stage-arrow" aria-label="Previous world" onClick={() => step(-1)} disabled={worlds.length < 2}><ArrowLeft size={20} /></button><span className="stage-position" aria-hidden="true">{String(current + 1).padStart(2, '0')}<i />{String(worlds.length).padStart(2, '0')}</span><button className="stage-arrow" aria-label="Next world" onClick={() => step(1)} disabled={worlds.length < 2}><ArrowRight size={20} /></button></div>
      </div>
      <div className="world-stage-info"><div className="world-stage-active-copy"><button className="stage-category" onClick={() => onCategory(active.category)} aria-label={`Explore ${active.category} from orbital stage`}>{active.category}<ArrowUpRight size={12} /></button><h3>{active.title}</h3><p>{active.description}</p></div><div className="world-stage-actions"><a className="primary-button" href={active.url} target="_blank" rel="noopener noreferrer" onClick={() => onLaunch(active.id)} aria-label={`Launch ${active.title} from orbital stage`}>Enter this world<ArrowUpRight size={17} /></a><button className="secondary-button" aria-label={`${savedIds.includes(active.id) ? 'Unsave' : 'Save'} ${active.title} from orbital stage`} aria-pressed={savedIds.includes(active.id)} onClick={() => onSave(active)}><Star size={16} fill={savedIds.includes(active.id) ? 'currentColor' : 'none'} />{savedIds.includes(active.id) ? 'World saved' : 'Save world'}</button><button className="text-button" onClick={() => onSelect(active)}>View details<ArrowRight size={14} /></button></div></div>
      <div className="world-stage-footer"><span className="stage-hint"><MoveHorizontal size={15} />Swipe, use the arrows, or pick a world.</span><div className="stage-dots" role="group" aria-label="Choose a featured world">{worlds.map((world, position) => <button key={world.id} aria-label={`Show ${world.title} in orbital stage`} aria-current={position === current ? 'true' : undefined} onClick={() => setIndex(position)}><span /></button>)}</div></div>
      <p className="stage-announcement" role="status" aria-label="Focused world" aria-live="polite" aria-atomic="true">{active.title}, world {current + 1} of {worlds.length}.</p>
    </div>
  </section>;
}
