import type { CSSProperties } from 'react';
import { Pause, Play, Snowflake, X } from 'lucide-react';

type WinterBannerProps = {
  snowEnabled: boolean;
  onToggleSnow: () => void;
  onDismiss: () => void;
  motionAllowed?: boolean;
};

export function WinterBanner({ snowEnabled, onToggleSnow, onDismiss, motionAllowed = true }: WinterBannerProps) {
  return <aside className="winter-banner" aria-label="Winter decorations">
    <span className="winter-banner-symbol" aria-hidden="true"><Snowflake size={23} strokeWidth={1.3} /></span>
    <div className="winter-banner-copy"><span className="winter-edition-label">THE WINTER EDITION</span><p>Cold skies. Warm ideas.<span> A fresh season of discovery.</span></p></div>
    <div className="winter-banner-controls">
      {motionAllowed ? <button className="winter-snow-toggle" onClick={onToggleSnow} aria-label={snowEnabled ? 'Pause snowfall' : 'Resume snowfall'} title={snowEnabled ? 'Pause snowfall' : 'Resume snowfall'}>
        {snowEnabled ? <Pause size={14} /> : <Play size={14} />}<span>{snowEnabled ? 'Pause snow' : 'Let it snow'}</span>
      </button> : <span className="winter-still-status" role="img" aria-label="Still snowfall; motion is reduced"><Snowflake size={14} aria-hidden="true" /><span>Still snowfall</span></span>}
      <button className="winter-dismiss icon-button" onClick={onDismiss} aria-label="Hide winter decorations" title="Hide winter decorations"><X size={17} /></button>
    </div>
  </aside>;
}

const flakes = Array.from({ length: 24 }, (_, index) => ({
  '--snow-x': `${(index * 37 + 7) % 100}%`,
  '--snow-rest-y': `${(index * 29 + 11) % 100}%`,
  '--snow-delay': `${-((index * 7) % 23)}s`,
  '--snow-duration': `${17 + (index * 3) % 14}s`,
  '--snow-size': `${index % 4 === 0 ? 3 : index % 3 === 0 ? 2 : 1.5}px`,
  '--snow-opacity': 0.22 + (index % 5) * 0.1,
  '--snow-drift': `${index % 2 === 0 ? 30 : -25}px`,
} as CSSProperties));

export function WinterScene() {
  return <div className="winter-scene" aria-hidden="true">
    <div className="winter-aurora" />
    <div className="winter-frost" />
    <svg className="winter-crystal" viewBox="0 0 160 160" fill="none">
      <g stroke="currentColor" strokeWidth=".8"><path d="M80 10v140M19 45l122 70M19 115l122-70M66 24l14 14 14-14M66 136l14-14 14 14M24 63l19-5-5-19M122 121l-5-19 19-5M24 97l19 5-5 19M122 39l-5 19 19 5M68 58l12 7 12-7M68 102l12-7 12 7M55 78l12-7V57M105 103V89l12-7M55 82l12 7v14M105 57v14l12 7" /><circle cx="80" cy="80" r="47" strokeDasharray="1 8" /></g>
    </svg>
    <div className="winter-snowfall">{flakes.map((style, index) => <i className="winter-flake" key={index} style={style} />)}</div>
    <div className="winter-hero-signature"><Snowflake size={20} strokeWidth={1} /><span>WINTER, IN ORBIT<small>A LITTLE WONDER. EVERYWHERE.</small></span></div>
  </div>;
}
