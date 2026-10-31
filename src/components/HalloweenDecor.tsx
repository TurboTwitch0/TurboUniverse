import { X } from 'lucide-react';

function Pumpkin({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 120 112" fill="none" aria-hidden="true">
    <path d="M59 25c-3-11 2-17 10-20l5 7c-7 1-10 5-9 14" fill="#66834b" />
    <path d="M61 28C36 10 5 32 8 65c2 27 25 43 52 39 28 4 51-12 53-39 3-33-28-55-52-37Z" fill="#ef8839" />
    <ellipse cx="60" cy="65" rx="34" ry="40" fill="#fa9b4b" />
    <path d="M60 26c-20 13-20 62 0 78 20-16 20-65 0-78Z" fill="#ffae60" />
    <path d="m29 59 18-10 2 17-20-7Zm62 0L73 49l-2 17 20-7ZM41 79l10 2 9-6 9 6 10-2-7 12H48l-7-12Z" fill="#4b271f" />
    <path d="m35 58 9-5 1 8-10-3Zm50 0-9-5-1 8 10-3Z" fill="#ffe5a3" />
  </svg>;
}

export function HalloweenBanner({ onDismiss }: { onDismiss: () => void }) {
  return <aside className="halloween-banner" aria-label="Halloween decorations">
    <Pumpkin className="halloween-banner-pumpkin" />
    <div><span className="halloween-date">OCT 31 · HALLOWEEN EDITION</span><p>A little spooky. A whole universe to explore.</p></div>
    <button className="icon-button" onClick={onDismiss} aria-label="Hide Halloween decorations" title="Hide Halloween decorations"><X size={17} /></button>
  </aside>;
}

export function HalloweenScene() {
  return <div className="halloween-scene" aria-hidden="true">
    <svg className="halloween-web" viewBox="0 0 180 180" fill="none"><path d="M180 0 5 0M180 0 14 58M180 0 54 125M180 0 120 167M180 0v180M140 0q7 8 2 13 12 0 11 14 13-1 13 11 5-4 14 2M100 0q14 14 5 26 24 0 22 27 26-2 26 24 11-8 27 3M60 0q21 20 7 40 36 0 33 40 40-3 40 40 17-14 40 0M20 0q28 27 9 54 48 0 44 53 53-4 53 53 24-19 54 0" /></svg>
    <svg className="halloween-bats" viewBox="0 0 320 160" fill="currentColor"><path d="M84 73 51 49l8 29-31 11c21-1 21 14 30 18 6-9 15-9 26-5 11-4 20-4 26 5 9-4 9-19 30-18l-31-11 8-29-33 24Zm5-3-5-10-5 10" /><path d="m220 34-19-14 5 17-18 6c12 0 12 9 17 11 4-5 9-5 15-3 6-2 11-2 15 3 5-2 5-11 17-11l-18-6 5-17-19 14Z" /></svg>
    <div className="halloween-pumpkins"><Pumpkin /><Pumpkin /></div>
    <span className="halloween-hero-note">A FEW EXTRA WORLDS GO BUMP IN THE NIGHT.</span>
  </div>;
}
