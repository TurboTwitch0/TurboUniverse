import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Music2, Pause, Play, Repeat2, Square, Volume2, VolumeX, X } from 'lucide-react';
import { ChristmasBells, JINGLE_DURATION } from '../lib/christmas-music';
import './christmas-player.css';

const tracks = [
  { id: 'bells', title: 'Jingle Bells', artist: 'TurboUniverse · original bell arrangement' },
  { id: 'yXQViqx6GMY', title: 'All I Want for Christmas Is You', artist: 'Mariah Carey' },
  { id: 'E8gmARGvPlI', title: 'Last Christmas', artist: 'Wham!' },
  { id: 'TFsZy9t-qDc', title: "Rockin’ Around the Christmas Tree", artist: 'Brenda Lee' },
  { id: 'nlR0MkrRklg', title: 'Santa Tell Me', artist: 'Ariana Grande' },
  { id: '0bhsXykXxfg', title: 'It’s Beginning to Look a Lot Like Christmas', artist: 'Michael Bublé' },
];
const SETTINGS_KEY = 'turbo-universe-radio';
function savedSettings() {
  const defaults = { trackId: 'bells', volume: .45, muted: false, hidden: false, repeat: false };
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
    return {
      trackId: tracks.some(track => track.id === value.trackId) ? value.trackId as string : defaults.trackId,
      volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : defaults.volume,
      muted: value.muted === true, hidden: value.hidden === true, repeat: value.repeat === true,
    };
  } catch { return defaults; }
}
const clockLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
type Player = { playVideo(): void; pauseVideo(): void; stopVideo(): void; destroy(): void; setVolume(value: number): void; mute(): void; unMute(): void };
type YouTubeAPI = { Player: new (element: HTMLElement, options: Record<string, unknown>) => Player };
type YouTubeWindow = Window & { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void };
let youtubePromise: Promise<YouTubeAPI> | undefined;

function loadYouTube() {
  const host = window as YouTubeWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (youtubePromise) return youtubePromise;
  youtubePromise = new Promise<YouTubeAPI>((resolve, reject) => {
    const previous = host.onYouTubeIframeAPIReady;
    let settled = false;
    let script = document.querySelector<HTMLScriptElement>('script[data-christmas-youtube]');
    const cleanup = () => {
      window.clearTimeout(timeout);
      if (host.onYouTubeIframeAPIReady === ready) host.onYouTubeIframeAPIReady = previous;
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup(); script?.remove(); youtubePromise = undefined; reject(new Error(message));
    };
    const ready = () => {
      if (settled) return;
      try { previous?.(); } catch { /* Another callback must not interrupt this player. */ }
      if (host.YT?.Player) { settled = true; cleanup(); resolve(host.YT); }
    };
    const timeout = window.setTimeout(() => fail('YouTube did not load. You can retry or open the official video.'), 15000);
    host.onYouTubeIframeAPIReady = ready;
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.dataset.christmasYoutube = 'true';
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.onerror = () => fail('YouTube is unavailable here. Open the official video or choose Jingle Bells.');
      document.head.appendChild(script);
    }
  });
  return youtubePromise;
}

export default function ChristmasPlayer({ seasonalVisible = true, restoreRequest = 0, onHide, onPlayingChange }: { seasonalVisible?: boolean; restoreRequest?: number; onHide?: (stillPlaying: boolean) => void; onPlayingChange?: (playing: boolean) => void }) {
  const panelId = useId();
  const [settings] = useState(savedSettings);
  const [open, setOpen] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [docked, setDocked] = useState(false);
  const [uiHidden, setUIHidden] = useState(settings.hidden);
  const [trackId, setTrackId] = useState(settings.trackId);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'>('idle');
  const [message, setMessage] = useState('Press play for a little Christmas.');
  const [volume, setVolume] = useState(settings.volume);
  const [muted, setMuted] = useState(settings.muted);
  const [repeat, setRepeat] = useState(settings.repeat);
  const [position, setPosition] = useState(0);
  const bells = useRef<ChristmasBells | null>(null);
  const video = useRef<Player | null>(null);
  const videoHost = useRef<HTMLDivElement>(null);
  const playerTimer = useRef<number | undefined>(undefined);
  const attempt = useRef(0);
  const currentVolume = useRef(settings.muted ? 0 : settings.volume);
  const hiddenRef = useRef(settings.hidden);
  const seekTimer = useRef<number | undefined>(undefined);
  const scrubbing = useRef(false);
  const resumeAfterSeek = useRef(false);
  const toggleElement = useRef<HTMLButtonElement>(null);
  const videoPlayRequested = useRef(false);
  const playerElement = useRef<HTMLElement>(null);
  const track = tracks.find(item => item.id === trackId)!;
  const isBells = trackId === 'bells';

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ trackId, volume, muted, hidden: uiHidden, repeat })); }
    catch { /* Radio settings still work for this visit. */ }
  }, [trackId, volume, muted, uiHidden, repeat]);
  useEffect(() => { onPlayingChange?.(status === 'playing'); }, [status, onPlayingChange]);

  useEffect(() => { if (!seasonalVisible) { setOpen(false); setDocked(true); } }, [seasonalVisible]);
  useEffect(() => {
    if (!restoreRequest) return;
    hiddenRef.current = false;
    setUIHidden(false); setEngaged(true); setDocked(true); setOpen(true);
  }, [restoreRequest]);
  useLayoutEffect(() => {
    if (restoreRequest && open && !uiHidden) playerElement.current?.querySelector<HTMLButtonElement>('.christmas-play')?.focus({ preventScroll: true });
  }, [restoreRequest, open, uiHidden]);
  useEffect(() => () => { attempt.current++; window.clearTimeout(playerTimer.current); window.clearTimeout(seekTimer.current); bells.current?.dispose(); video.current?.destroy(); }, []);
  useEffect(() => {
    currentVolume.current = muted ? 0 : volume;
    bells.current?.setVolume(currentVolume.current);
    if (video.current) { video.current.setVolume?.(Math.round(volume * 100)); if (muted) video.current.mute?.(); else video.current.unMute?.(); }
  }, [muted, volume]);
  useEffect(() => {
    if (status !== 'playing' || !isBells) return;
    const timer = window.setInterval(() => {
      const next = bells.current?.position ?? 0;
      setPosition(next);
      if (next >= JINGLE_DURATION) {
        bells.current?.stop();
        if (repeat) void play();
        else { setStatus('ended'); setMessage('That’s the last bell. Play it again?'); }
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [status, isBells, repeat]);

  function cancelSeek() { window.clearTimeout(seekTimer.current); scrubbing.current = false; resumeAfterSeek.current = false; }
  function finishSeek() {
    if (!scrubbing.current) return;
    const resume = resumeAfterSeek.current;
    cancelSeek();
    if ((bells.current?.position ?? 0) >= JINGLE_DURATION - .1) { setStatus('ended'); setMessage('At the last bell. Press Play to restart.'); }
    else if (resume) void play();
  }
  function seek(value: number) {
    attempt.current++;
    if (!scrubbing.current) { resumeAfterSeek.current = status === 'playing'; scrubbing.current = true; }
    bells.current ??= new ChristmasBells();
    bells.current.seek(value);
    setPosition(bells.current.position); setStatus('paused'); setMessage('Position saved. Press Play to continue.');
    window.clearTimeout(seekTimer.current);
    seekTimer.current = window.setTimeout(finishSeek, 250);
  }

  function stop() {
    cancelSeek();
    videoPlayRequested.current = false;
    attempt.current++;
    window.clearTimeout(playerTimer.current);
    bells.current?.stop();
    video.current?.destroy(); video.current = null;
    videoHost.current?.replaceChildren();
    setPosition(0); setStatus('idle'); setMessage('Ready when you are.');
  }
  function choose(id: string) { stop(); setTrackId(id); }
  function toggleOpen() { setEngaged(true); if (open) setDocked(true); setOpen(current => !current); }
  function pause() { cancelSeek(); videoPlayRequested.current = false; bells.current?.pause(); video.current?.pauseVideo?.(); if (isBells) { attempt.current++; setPosition(bells.current?.position ?? 0); setStatus('paused'); setMessage('Paused. Your place is saved.'); } }
  function hide(pauseFirst = false) {
    if (pauseFirst) pause();
    hiddenRef.current = true;
    setUIHidden(true); setEngaged(true); setDocked(true); setOpen(false);
    if (!isBells) {
      videoPlayRequested.current = false;
      window.clearTimeout(playerTimer.current);
      video.current?.pauseVideo?.();
      setStatus('paused'); setMessage('Video paused while hidden. Press Play to resume.');
    }
    onHide?.(!pauseFirst && isBells && status === 'playing');
  }
  function watchVideo(request: number) {
    window.clearTimeout(playerTimer.current);
    playerTimer.current = window.setTimeout(() => {
      if (request !== attempt.current) return;
      setStatus('error'); setMessage('The video did not become ready. Try the official video or choose Jingle Bells.');
    }, 15000);
  }

  async function play() {
    cancelSeek();
    setEngaged(true);
    if (!isBells) videoPlayRequested.current = true;
    if (!isBells && video.current && status !== 'error') {
      setStatus('loading'); setMessage('Starting the official video…');
      watchVideo(attempt.current);
      video.current.playVideo?.();
      return;
    }
    const request = ++attempt.current;
    if (!isBells && video.current) {
      window.clearTimeout(playerTimer.current);
      video.current.destroy(); video.current = null;
      videoHost.current?.replaceChildren();
    }
    setStatus('loading'); setMessage(isBells ? 'Warming up the bells…' : 'Opening the official video…');
    try {
      if (isBells) {
        bells.current ??= new ChristmasBells();
        await bells.current.play(currentVolume.current);
        if (request !== attempt.current) return;
        setStatus('playing'); setMessage('Playing Jingle Bells · original bell arrangement');
      } else {
        const api = await loadYouTube();
        if (request !== attempt.current || !videoHost.current || hiddenRef.current || !videoPlayRequested.current) return;
        const element = document.createElement('div');
        videoHost.current.replaceChildren(element);
        video.current = new api.Player(element, {
          host: 'https://www.youtube-nocookie.com', width: '100%', height: '240', videoId: trackId,
          playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => {
              if (request !== attempt.current) return;
              window.clearTimeout(playerTimer.current);
              if (hiddenRef.current || !videoPlayRequested.current) { video.current?.pauseVideo?.(); return; }
              const iframe = videoHost.current?.querySelector('iframe');
              if (iframe) { iframe.title = `${track.artist} — ${track.title}, official YouTube video`; iframe.referrerPolicy = 'strict-origin-when-cross-origin'; }
              video.current?.setVolume(Math.round(currentVolume.current * 100));
              watchVideo(request);
              video.current?.playVideo?.();
            },
            onStateChange: (event: { data: number }) => {
              if (request !== attempt.current) return;
              if (hiddenRef.current && (event.data === 1 || event.data === 3)) { video.current?.pauseVideo?.(); return; }
              if (event.data === 1) { videoPlayRequested.current = true; window.clearTimeout(playerTimer.current); setStatus('playing'); setMessage(`Playing ${track.title}`); }
              else if (event.data === 2) { window.clearTimeout(playerTimer.current); setStatus('paused'); setMessage(hiddenRef.current ? 'Video paused while hidden. Press Play to resume.' : 'Video paused.'); }
              else if (event.data === 0) { window.clearTimeout(playerTimer.current); setStatus('ended'); setMessage('Track finished. Pick another or play it again.'); }
              else if (event.data === 3 && videoPlayRequested.current) { watchVideo(request); setStatus('loading'); setMessage('Video buffering…'); }
            },
            onAutoplayBlocked: () => { if (request === attempt.current) { window.clearTimeout(playerTimer.current); setStatus('paused'); setMessage('Select Play in the video to start the music.'); } },
            onError: (event: { data: number }) => {
              if (request !== attempt.current) return;
              window.clearTimeout(playerTimer.current);
              setStatus('error');
              setMessage(event.data === 101 || event.data === 150 ? 'This video cannot play embedded here. Open the official video instead.' : 'This video is unavailable here. Try the official video or Jingle Bells.');
            },
          },
        });
        const iframe = videoHost.current.querySelector('iframe');
        if (iframe) { iframe.title = `${track.artist} — ${track.title}, official YouTube video`; iframe.referrerPolicy = 'strict-origin-when-cross-origin'; }
        watchVideo(request);
      }
    } catch (error) {
      if (request !== attempt.current || (!isBells && !videoPlayRequested.current)) return;
      setStatus('error'); setMessage(error instanceof Error ? error.message : 'Music could not start. Please try again.');
    }
  }

  if (!seasonalVisible && !engaged) return null;

  return <aside ref={playerElement} hidden={uiHidden} data-status={status} className={`christmas-player ${isBells ? 'is-local' : 'is-video'}${open ? ' is-open' : engaged ? ' is-mini' : ''}${engaged && (docked || !open || !seasonalVisible) ? ' is-docked' : ''}`} aria-label="Christmas music" onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); setDocked(true); toggleElement.current?.focus(); } }}>
    <div className="christmas-player-top">
    <button className="christmas-player-toggle" ref={toggleElement} onClick={toggleOpen} aria-label={open ? 'Minimize Christmas radio' : 'Open Christmas radio'} title={open ? 'Minimize · music keeps playing' : 'Open Christmas radio'} aria-expanded={open} aria-controls={panelId}>
      <span className="christmas-player-icon"><Music2 size={19} aria-hidden="true" /></span>
      <span><strong>{!open && engaged ? track.title : 'Christmas radio'}</strong><small>{open ? 'Minimize · music keeps playing' : engaged ? `${status === 'playing' ? 'Playing' : status === 'paused' ? 'Paused' : status === 'loading' ? 'Loading' : 'Christmas radio'} · Open radio` : 'Jingle Bells + holiday favorites'}</small></span>
      <ChevronDown size={18} className="christmas-player-chevron" aria-hidden="true" />
    </button>
    <button className="christmas-player-hide" onClick={() => hide()} aria-label="Hide Christmas radio" title={isBells ? 'Hide · music keeps playing' : 'Hide · pauses video'}><X size={16} aria-hidden="true" /><span>Hide</span></button>
    </div>
    <div className="christmas-player-panel" hidden={!open && !engaged}>
      <div id={panelId} hidden={!open}>
      <label className="christmas-track-label" htmlFor={`${panelId}-track`}>Pick your holiday track</label>
      <select id={`${panelId}-track`} value={trackId} onChange={event => choose(event.target.value)}>
        {tracks.map(item => <option key={item.id} value={item.id}>{item.title} — {item.id === 'bells' ? 'Original bells' : item.artist}</option>)}
      </select>
      <div className="christmas-now-playing"><span className="christmas-disc" aria-hidden="true"><Music2 size={28} /></span><div><small>{isBells ? 'MADE FOR THIS UNIVERSE' : 'OFFICIAL YOUTUBE VIDEO'}</small><strong>{track.title}</strong><span>{track.artist}</span></div></div>
      </div>
      {!isBells && <div className="christmas-video-shell"><div className="christmas-video-host" ref={videoHost} /><p className="christmas-video-placeholder">Press play to load the official video.</p></div>}
      {isBells && open && <div className="christmas-timeline">
        <div><span>{clockLabel(position)} / {clockLabel(JINGLE_DURATION)}</span><button className="christmas-repeat" aria-label="Repeat Jingle Bells" aria-pressed={repeat} onClick={() => setRepeat(current => !current)}><Repeat2 size={14} aria-hidden="true" /> Repeat</button></div>
        <input className="christmas-seek" type="range" min="0" max={JINGLE_DURATION} step="1" value={position} aria-label="Jingle Bells playback position" aria-valuetext={`${clockLabel(position)} of ${clockLabel(JINGLE_DURATION)}`} onChange={event => seek(Number(event.target.value))} onPointerUp={finishSeek} onKeyUp={finishSeek} onBlur={finishSeek} />
      </div>}
      <div className="christmas-controls">
        <button className="christmas-play" onClick={status === 'playing' ? pause : play} disabled={status === 'loading'} aria-label={status === 'playing' ? 'Pause Christmas music' : 'Play Christmas music'}>{status === 'playing' ? <Pause size={19} aria-hidden="true" /> : <Play size={19} aria-hidden="true" />}<span>{status === 'playing' ? 'Pause' : status === 'loading' ? 'Loading…' : 'Play'}</span></button>
        <button onClick={stop} aria-label="Stop Christmas music" title="Stop"><Square size={17} aria-hidden="true" /></button>
        <button onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute Christmas music' : 'Mute Christmas music'} aria-pressed={muted}>{muted ? <VolumeX size={19} aria-hidden="true" /> : <Volume2 size={19} aria-hidden="true" />}</button>
        <label className="christmas-volume"><span className="christmas-sr-only">Music volume</span><input type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={event => setVolume(Number(event.target.value) / 100)} /></label>
      </div>
      <p className={`christmas-player-status${status === 'error' ? ' has-error' : ''}`} role="status">{message}</p>
      {isBells ? open && <p className="christmas-music-note">Warm bells and a gentle accompaniment. No account or download needed.</p> : <a className="christmas-official-link" href={`https://www.youtube.com/watch?v=${trackId}`} target="_blank" rel="noopener noreferrer">Open official video on YouTube <ExternalLink size={14} aria-hidden="true" /></a>}
      {open && <div className="christmas-hide-options"><button onClick={() => hide(true)}><Pause size={13} aria-hidden="true" />Pause & hide</button><span>{isBells ? 'Hide keeps music on. The header music button brings it back.' : 'Hidden videos pause. Reopen from the header music button.'}</span></div>}
    </div>
  </aside>;
}
