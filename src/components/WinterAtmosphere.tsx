import { useId, type CSSProperties } from 'react';
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
    <div className="winter-banner-copy"><span className="winter-edition-label">THE CHRISTMAS EDITION / 2026</span><p>Your universe, wrapped in wonder.<span> Lights on. Favorite worlds close. Christmas turned up.</span></p></div>
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
    <svg className="christmas-hero-baubles" viewBox="0 0 260 300" fill="none"><path d="M80 0v110M208 0v44" stroke="#eed497" /><path d="M73 106h14v12H73zM202 42h12v10h-12z" fill="#c9a25b" /><circle cx="80" cy="154" r="38" fill="#a9354e" /><circle cx="208" cy="80" r="29" fill="#d5ae5e" /><path d="M43 154c18 11 56 11 74 0M49 135c17 8 45 8 62 0M49 174c17 8 45 8 62 0" stroke="#efd39a" /><path d="m208 61 5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1 5-12Z" stroke="#fff0be" /><ellipse cx="65" cy="138" rx="8" ry="13" fill="#ffd0b4" opacity=".35" /></svg>
    <svg className="winter-crystal" viewBox="0 0 160 160" fill="none">
      <g stroke="currentColor" strokeWidth=".8"><path d="M80 10v140M19 45l122 70M19 115l122-70M66 24l14 14 14-14M66 136l14-14 14 14M24 63l19-5-5-19M122 121l-5-19 19-5M24 97l19 5-5 19M122 39l-5 19 19 5M68 58l12 7 12-7M68 102l12-7 12 7M55 78l12-7V57M105 103V89l12-7M55 82l12 7v14M105 57v14l12 7" /><circle cx="80" cy="80" r="47" strokeDasharray="1 8" /></g>
    </svg>
    <div className="winter-hero-signature"><Snowflake size={20} strokeWidth={1} /><span>WINTER, IN ORBIT<small>A LITTLE WONDER. EVERYWHERE.</small></span></div>
  </div>;
}

export function WinterPageBackdrop() {
  const pine = useId();
  return <div className="winter-page-backdrop" aria-hidden="true">
    <svg className="christmas-ornaments" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMin slice" fill="none">
      <defs>
        <radialGradient id={`${pine}-red`} cx=".3" cy=".2" r=".85"><stop stopColor="#f3ac9d" /><stop offset=".3" stopColor="#c34852" /><stop offset="1" stopColor="#631f32" /></radialGradient>
        <radialGradient id={`${pine}-gold`} cx=".3" cy=".2" r=".85"><stop stopColor="#fff5c4" /><stop offset=".35" stopColor="#d9b15f" /><stop offset="1" stopColor="#75542f" /></radialGradient>
      </defs>
      <g stroke="#c5a562" strokeWidth="1"><path d="M60 0v235M1528 0v135M1471 0v300" /></g>
      <g transform="translate(60 280)"><circle r="43" fill={`url(#${pine}-red)`} /><path d="M-9-44h18v-8H-9z" fill="#e4c487" /><path d="M-41 0c22 14 60 14 82 0M-36-20c22 10 50 10 72 0M-36 20c22 10 50 10 72 0" stroke="#edca8e" opacity=".7" /></g>
      <g transform="translate(1528 168)"><circle r="31" fill={`url(#${pine}-gold)`} /><path d="M-7-31H7v-7H-7z" fill="#e4c487" /><path d="m0-19 5 13 14 1-11 9 3 14L0 10l-11 8 3-14-11-9 14-1 5-13Z" stroke="#fff0bb" /></g>
      <g transform="translate(1471 325)"><circle r="23" fill={`url(#${pine}-red)`} /><path d="M-5-23H5v-6H-5z" fill="#e4c487" /></g>
      <path d="m127 125 4 12 12 4-12 4-4 12-4-12-12-4 12-4 4-12Zm1305 96 4 12 12 4-12 4-4 12-4-12-12-4 12-4 4-12Z" fill="#e9ca82" opacity=".8" />
    </svg>
    <svg className="winter-page-landscape" viewBox="0 0 1600 400" preserveAspectRatio="none" fill="none">
      <defs><g id={pine}>
        <path className="winter-tree-silhouette" fill="var(--christmas-tree, #67978c)" d="M50 0 14 65h18L6 115h25L0 165h100l-31-50h25L68 65h18L50 0Z" />
        <path className="winter-tree-snow" fill="#f8ffff" d="m50 6-24 45 24-9 24 9L50 6ZM29 82l-12 24 33-10 32 10-12-24-20-7-21 7ZM22 133l-11 22 39-10 39 10-12-22-27-8-28 8Z" />
        <path d="M45 165h10v23H45z" fill="currentColor" opacity=".4" />
        <circle cx="35" cy="91" r="3.5" fill="var(--christmas-red, #a74c5a)" /><circle cx="67" cy="134" r="3.5" fill="var(--christmas-gold, #bd964d)" />
        <circle cx="58" cy="51" r="3" fill="var(--christmas-gold, #bd964d)" /><circle cx="32" cy="142" r="3" fill="var(--christmas-red, #a74c5a)" />
      </g></defs>
      <path className="winter-snow-drift" d="M0 267c230-62 384 38 590 26 253-15 330-70 563-36 197 28 303-18 447-35v178H0V267Z" />
      <use href={`#${pine}`} transform="translate(12 119) scale(1.18)" />
      <use href={`#${pine}`} transform="translate(148 196) scale(.72)" />
      <use href={`#${pine}`} transform="translate(274 228) scale(.48)" />
      <use href={`#${pine}`} transform="translate(1278 212) scale(.63)" />
      <use href={`#${pine}`} transform="translate(1376 152) scale(.95)" />
      <use href={`#${pine}`} transform="translate(1490 81) scale(1.3)" />
      <path className="winter-tree-snow" d="M0 337c169-30 337 35 568 11 230-23 392-16 625-2 189 11 306-41 407-32v86H0v-63Z" />
    </svg>
    <div className="winter-snowfall">{flakes.map((style, index) => <i className="winter-flake" key={index} style={style} />)}</div>
  </div>;
}

const bulbColors = ['#ed7d83', '#f1ce80', '#91d6ad', '#f5e3ae'];
export function ChristmasLights() {
  return <div className="christmas-lights" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <span key={index} style={{ '--bulb-color': bulbColors[index % bulbColors.length] } as CSSProperties} />)}</div>;
}
