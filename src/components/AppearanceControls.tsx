import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe2, Leaf, Orbit, SlidersHorizontal, Snowflake, Sprout, Sun, X } from 'lucide-react';
import { SEASONS, SEASON_LABELS, type AppearancePreferences, type Season } from '../theme';

type Props = { preferences: AppearancePreferences; onChange: (preferences: AppearancePreferences) => void; season: Season };
const seasonIcons = { spring: Sprout, summer: Sun, autumn: Leaf, winter: Snowflake };

export default function AppearanceControls({ preferences, onChange, season }: Props) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const SeasonIcon = seasonIcons[season];
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('button,select,input')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      trigger.current?.focus();
    };
  }, [open]);

  return <>
    <section className="appearance-bar" aria-label="Appearance">
      <div className="appearance-mode" role="group" aria-label="Theme">
        <button className={preferences.mode === 'earth' ? 'active' : ''} aria-pressed={preferences.mode === 'earth'} onClick={() => onChange({ ...preferences, mode: 'earth' })}><Globe2 size={14} /> Earth</button>
        <button className={preferences.mode === 'space' ? 'active' : ''} aria-pressed={preferences.mode === 'space'} onClick={() => onChange({ ...preferences, mode: 'space' })}><Orbit size={14} /> Space</button>
      </div>
      <span className="appearance-tagline">Two atmospheres. One universe.</span>
      <button className="season-trigger" ref={trigger} aria-label="Appearance options" aria-haspopup="dialog" onClick={() => setOpen(true)}><SeasonIcon size={14} /><span>{SEASON_LABELS[season]}<span className="season-auto"> / {preferences.season === 'auto' ? 'AUTO' : 'PREVIEW'}</span></span><ChevronDown size={12} /></button>
    </section>
    {open && <div className="dialog-backdrop appearance-backdrop" onClick={event => { if (event.currentTarget === event.target) setOpen(false); }}>
      <div className="appearance-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="appearance-title">
        <div className="dialog-head"><div><span className="eyebrow"><SlidersHorizontal size={12} /> SET YOUR ATMOSPHERE</span><h2 id="appearance-title">A universe that feels like you.</h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close appearance options"><X size={19} /></button></div>
        <p className="appearance-intro">Follow the seasons, find your favorite colors, and make a little space for yourself.</p>
        <div className="appearance-mode appearance-mode-large" role="group" aria-label="Choose atmosphere"><button className={preferences.mode === 'earth' ? 'active' : ''} aria-pressed={preferences.mode === 'earth'} onClick={() => onChange({ ...preferences, mode: 'earth' })}><Globe2 size={19} /><span><strong>Earth</strong><small>Landscapes & grounded colors</small></span></button><button className={preferences.mode === 'space' ? 'active' : ''} aria-pressed={preferences.mode === 'space'} onClick={() => onChange({ ...preferences, mode: 'space' })}><Orbit size={19} /><span><strong>Space</strong><small>Distant worlds & cosmic light</small></span></button></div>
        <label className="field appearance-season-field">Season<select aria-label="Season" value={preferences.season} onChange={event => onChange({ ...preferences, season: event.target.value as AppearancePreferences['season'] })}><option value="auto">Follow the time of year</option>{SEASONS.map(item => <option key={item} value={item}>{SEASON_LABELS[item]} preview</option>)}</select></label>
        <p className="field-hint">Automatic colors and backgrounds change with your local calendar. Preview any season whenever you like.</p>
        <label className="field appearance-hemisphere-field">Your hemisphere<select aria-label="Your hemisphere" value={preferences.hemisphere} onChange={event => onChange({ ...preferences, hemisphere: event.target.value as AppearancePreferences['hemisphere'] })}><option value="north">Northern hemisphere</option><option value="south">Southern hemisphere</option></select></label>
        <label className="appearance-motion"><span><strong>Let the universe move</strong><small>Gentle orbits, subtle light, a little wonder.</small></span><input type="checkbox" checked={preferences.motion} onChange={event => onChange({ ...preferences, motion: event.target.checked })} /></label>
        <button className="primary-button appearance-done" onClick={() => setOpen(false)}>That’s my atmosphere <SeasonIcon size={16} /></button>
      </div>
    </div>}
  </>;
}
