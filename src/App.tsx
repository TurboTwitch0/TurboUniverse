import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CirclePlay, Command, Compass, Download, Globe2, Layers3, LayoutGrid, Menu, MonitorSmartphone, Plus, Search, Smartphone, Sparkles, Star, Trash2, WifiOff, X } from 'lucide-react';
import ProjectDialog from './components/ProjectDialog';
import OwnerLogin from './components/OwnerLogin';
import { apiFetch, getOwnerKey, setOwnerKey, OWNER_SESSION_EXPIRED } from './api';
import AppearanceControls from './components/AppearanceControls';
import OrbitScene from './components/OrbitScene';
import PopularWorlds from './components/PopularWorlds';
import UpdateAnnouncement from './components/UpdateAnnouncement';
import { useAppearance } from './useAppearance';
import { getWorldPresentation } from './popularWorlds';
import { getCatalogDescription } from './catalogCopy';
import { discoverProjects, type DiscoverySort } from './discovery';
import { useWorldLinks } from './useWorldLinks';
import CopyWorldLink from './components/CopyWorldLink';
import AIStudio from './components/AIStudio';
import ChromebookAI from './components/ChromebookAI';
import RecentWorlds from './components/RecentWorlds';
import { useRecentWorlds } from './useRecentWorlds';
import UniverseShowcase from './components/UniverseShowcase';
import WorldStage from './components/WorldStage';
import { canonicalWorldId } from './catalogAliases';
import { useViewNavigation } from './useViewNavigation';
import type { View } from './navigation';
import RelatedWorlds from './components/RelatedWorlds';
import WorldImage from './components/WorldImage';
import { useDiscoveryState } from './useDiscoveryState';

const SAVED_WORLDS_KEY = 'turbo-universe-saved-worlds';
function readSavedWorlds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_WORLDS_KEY) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length <= 128).map(canonicalWorldId))].slice(0, 1000) : [];
  } catch { return []; }
}

type Project = {
  id: string; title: string; type: 'website' | 'app'; url: string;
  description: string; category: string; year: number; featured: boolean;
  createdAt: string; coverUrl?: string; fileUrl?: string; fileName?: string;
  status?: 'setup-pending';
};
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const scrollBehavior = (): ScrollBehavior => document.documentElement.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
type Capabilities = { canManage: boolean; requiresLogin: boolean; maxUploadBytes: number; storage: string };
const PUBLIC_CAPABILITIES: Capabilities = { canManage: false, requiresLogin: false, maxUploadBytes: 4_000_000, storage: 'catalog' };

const story = [
  { number: '01', label: 'THE SPARK', title: 'It starts with a “what if.”', text: 'A blank page. An idea that won’t sit still. For Turbo, creating is a way to turn curiosity into something you can click, explore, and make your own.' },
  { number: '02', label: 'THE EXPANSION', title: 'One idea opens another world.', text: 'A website becomes a home base. A new app opens another door. Every experiment adds a different corner to a universe that keeps getting bigger.' },
  { number: '03', label: 'THE NEXT CHAPTER', title: 'Always building. Always Turbo.', text: 'This is where the worlds come together: every site, every app, every next idea. Explore what’s here, then come back for what happens next.' },
];

function Mark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M23 2 6 23h12l-2 15 18-23H22l1-13Z" fill="currentColor" /></svg></span>;
}

function ProjectArt({ project, mode, large = false }: { project: Project; mode: 'earth' | 'space'; large?: boolean }) {
  const scene = [...project.id].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 6;
  const spaceScenes = ['cinematic-horizon', 'cinematic-nebula', 'space-03', 'space-04', 'space-05', 'space-06'];
  const earthScenes = ['earth-spring', 'earth-hero', 'earth-detail', 'earth-winter'];
  const image = project.coverUrl || (mode === 'space' ? getWorldPresentation(project)?.image : undefined) || `/images/${mode === 'earth' ? earthScenes[scene % earthScenes.length] : spaceScenes[scene]}.webp`;
  return <div className={`project-art cinematic-project-art ${large ? 'large' : ''}`}>
    <WorldImage src={image} fallbackSrc={mode === 'earth' ? '/images/earth-spring.webp' : '/images/cinematic-horizon.webp'} alt="" loading="lazy" decoding="async" width="1600" height="900" />
    <span className="project-art-shade" aria-hidden="true" />
    <div className="project-art-title"><span>{project.category}</span>{large ? <strong>{project.title}</strong> : <h3>{project.title}</h3>}<span>{project.type === 'app' ? 'AN APP BY TURBO' : 'A TURBO ORIGINAL'}</span></div>
  </div>;
}

function useDialogFocus(ref: React.RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button, a[href], input')?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [close, ref]);
}

function StoryFilm({ onClose }: { onClose: () => void }) {
  const [chapter, setChapter] = useState(0);
  const [playing, setPlaying] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setChapter(value => (value + 1) % story.length), 7000);
    return () => window.clearInterval(timer);
  }, [playing]);
  return <div className="dialog-backdrop film-backdrop" onClick={e => e.currentTarget === e.target && onClose()}>
    <div className="film-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="film-title">
      <div className="film-top"><span><Mark small /> TURBO ORIGINAL</span><button className="icon-button" onClick={onClose} aria-label="Close film"><X /></button></div>
      <div className="film-grain" />
      <div className="film-copy" key={chapter}><span className="eyebrow">CHAPTER {story[chapter].number} / {story[chapter].label}</span><h2 id="film-title">{story[chapter].title}</h2><p>{story[chapter].text}</p></div>
      <div className="film-controls"><button className="text-button" onClick={() => setPlaying(!playing)}>{playing ? 'Pause story' : 'Play story'}</button><div className="film-segments">{story.map((item, index) => <button aria-label={`Chapter ${item.number}`} aria-current={index === chapter ? 'step' : undefined} className={index === chapter ? 'active' : ''} key={item.number} onClick={() => setChapter(index)} />)}</div><span>{story[chapter].number} / 03</span></div>
    </div>
  </div>;
}

function ProjectDetails({ project, onClose, onDelete, editable, saved, onToggleSaved, mode, projects, onSelect }: { projects: Project[]; onSelect: (project: Project) => void; project: Project; onClose: () => void; onDelete: (id: string) => Promise<void>; editable: boolean; saved: boolean; onToggleSaved: () => void; mode: 'earth' | 'space' }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  return <div className="dialog-backdrop" onClick={e => e.target === e.currentTarget && onClose()}><div className="detail-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="project-detail-title">
    <button className="icon-button detail-close" aria-label="Close project" onClick={onClose}><X /></button>
    <ProjectArt project={project} mode={mode} large />
    <div className="detail-content"><div className="project-tags"><span className="project-tag">{project.type}</span><span>{project.category}</span></div><h2 id="project-detail-title">{project.title}</h2><p>{project.description || 'A new world in the Turbo universe. Open it and explore.'}</p>
      <div className="detail-actions">{project.url && <a className="primary-button" href={project.url} target="_blank" rel="noopener noreferrer">{project.status === 'setup-pending' ? 'View project on GitHub' : `Explore ${project.type === 'app' ? 'app' : 'website'}`}<ArrowUpRight size={18} /></a>}{project.fileUrl && <a className="secondary-button" href={project.fileUrl} download={project.fileName}><Download size={18} />Download project</a>}<button className="secondary-button" onClick={onToggleSaved} aria-pressed={saved}><Star size={16} fill={saved ? 'currentColor' : 'none'} />{saved ? 'World saved' : 'Save this world'}</button></div>
      <CopyWorldLink worldId={project.id} />
      <RelatedWorlds currentId={project.id} projects={projects} onSelect={onSelect} />
      {editable && <div className="detail-bottom">{confirm ? <div className="delete-confirm"><span>Remove from your universe?</span><button className="danger-button" disabled={busy} onClick={async () => { setBusy(true); try { await onDelete(project.id); onClose(); } catch(e) { setError(e instanceof Error ? e.message : 'Could not remove project.'); setBusy(false); } }}>{busy ? 'Removing…' : 'Remove'}</button><button className="text-button" onClick={() => setConfirm(false)}>Cancel</button></div> : <><span>PART OF THE TURBO UNIVERSE</span><button className="text-button" onClick={() => setConfirm(true)}><Trash2 size={14} /> Remove project</button></>}{error && <p className="form-error" role="alert">{error}</p>}</div>}
    </div>
  </div></div>;
}

export default function App() {
  const { preferences, setPreferences, season } = useAppearance();
  const [view, setView] = useViewNavigation();
  const [aiStarter, setAIStarter] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { filter, setFilter, search, setSearch, category, setCategory, sort, setSort } = useDiscoveryState();
  const [dialog, setDialog] = useState(false);
  const [film, setFilm] = useState(false);
  const { selected, openWorld, closeWorld: closeDetails } = useWorldLinks(projects);
  const { recentIds, recordRecent, clearRecent } = useRecentWorlds();
  useEffect(() => { if (selected) recordRecent(selected.id); }, [selected, recordRecent]);
  const [mobileNav, setMobileNav] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [toast, setToast] = useState('');
  const [capabilities, setCapabilities] = useState<Capabilities>(PUBLIC_CAPABILITIES);
  const [owner, setOwner] = useState(false);
  const [login, setLogin] = useState(false);
  const [savedIds, setSavedIds] = useState(readSavedWorlds);
  const editable = capabilities.canManage && (!capabilities.requiresLogin || owner);
  const installRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const closeFilm = useCallback(() => setFilm(false), []);
  const closeInstall = useCallback(() => setShowInstall(false), []);
  const focusCollectionSearch = useCallback(() => {
    setView('collection'); setMobileNav(false);
    window.setTimeout(() => {
      document.getElementById('projects')?.scrollIntoView({ behavior: scrollBehavior() });
      searchRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [setView]);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Your universe couldn’t load. Check the connection and try again.');
      const data = await response.json();
      setProjects(data.projects.map((project: Project) => {
        const presentation = getWorldPresentation(project);
        return presentation ? { ...project, title: presentation.displayTitle, description: presentation.description } : { ...project, description: getCatalogDescription(project) };
      })); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your universe.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects, setView]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === SAVED_WORLDS_KEY || event.key === null) setSavedIds(readSavedWorlds()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    let active = true;
    async function loadCapabilities() {
      try {
        const response = await fetch('/api/config', { cache: 'no-store' });
        if (!response.ok) return;
        const next: Capabilities = await response.json();
        if (typeof next.canManage !== 'boolean' || typeof next.requiresLogin !== 'boolean' || !Number.isFinite(next.maxUploadBytes) || next.maxUploadBytes <= 0) return;
        if (active) setCapabilities(next);
        const restoredKey = getOwnerKey();
        if (next.canManage && next.requiresLogin && restoredKey) {
          const authenticated = await apiFetch('/api/admin', { cache: 'no-store' });
          if (active && getOwnerKey() === restoredKey) setOwner(authenticated.ok);
        }
      } catch {
        // Public browsing stays available when management cannot be reached.
      }
    }
    const expired = () => {
      setOwner(false); setDialog(false); setLogin(false);
      setToast('Your owner session ended. Sign in again to manage the collection.');
    };
    window.addEventListener(OWNER_SESSION_EXPIRED, expired);
    void loadCapabilities();
    return () => { active = false; window.removeEventListener(OWNER_SESSION_EXPIRED, expired); };
  }, []);
  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallEvent); };
    const ready = () => { setInstalled(true); setInstallPrompt(null); setShowInstall(false); setToast('TurboUniverse is ready on your home screen.'); };
    const online = () => { setOffline(false); void loadProjects(); };
    const disconnected = () => setOffline(true);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('[aria-modal="true"]')) {
        event.preventDefault(); focusCollectionSearch();
      }
    };
    window.addEventListener('beforeinstallprompt', install); window.addEventListener('appinstalled', ready);
    window.addEventListener('online', online); window.addEventListener('offline', disconnected); window.addEventListener('keydown', shortcut);
    return () => { window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', ready); window.removeEventListener('online', online); window.removeEventListener('offline', disconnected); window.removeEventListener('keydown', shortcut); };
  }, [loadProjects, focusCollectionSearch]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!mobileNav) return;
    const destinations = navigationRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
    Array.from(destinations ?? []).find(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')?.focus({ preventScroll: true });
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      setMobileNav(false);
      navigationToggleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [mobileNav]);

  const navigate = (next: View) => { closeDetails(); setView(next); setMobileNav(false); setFilter('all'); setSearch(''); setCategory('all'); setSort('original'); window.scrollTo({ top: 0, behavior: scrollBehavior() }); };
  const openAI = (prompt = '') => { setAIStarter(prompt); navigate('ai'); };
  const browseWorlds = ({ filter = 'all', category = 'all' }: { filter?: 'all' | 'website' | 'app' | 'saved'; category?: string }) => { navigate('collection'); setFilter(filter); setCategory(category); };
  const retryProjects = () => { setError(''); setLoading(true); void loadProjects(); };
  const explore = () => { setView('collection'); window.setTimeout(() => document.getElementById('projects')?.scrollIntoView({ behavior: scrollBehavior() }), 0); };
  const exportProjects = () => {
    const blob = new Blob([JSON.stringify({ projects: projects.map(({ title, type, url, description, category, year, featured }) => ({ title, type, url, description, category, year, featured })) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'turbo-universe-projects.json'; link.click(); URL.revokeObjectURL(url); setToast('Project list exported. Uploaded files are backed up separately.');
  };
  const removeProject = async (id: string) => { const response = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Could not remove project. Please try again.'); await loadProjects(); setToast('Project removed from your universe.'); };
  const toggleSaved = (project: Project) => {
    const saving = !savedIds.includes(project.id);
    const next = saving ? [...savedIds, project.id] : savedIds.filter(id => id !== project.id);
    setSavedIds(next);
    let persisted = true;
    try { localStorage.setItem(SAVED_WORLDS_KEY, JSON.stringify(next)); } catch { persisted = false; }
    setToast(saving ? (persisted ? `${project.title} saved on this device.` : `${project.title} saved for this visit.`) : `${project.title} removed from saved worlds.`);
  };
  const savedCount = projects.filter(project => savedIds.includes(project.id)).length;
  const categories = [...new Set(projects.map(project => project.category))].sort((a, b) => a.localeCompare(b));
  const filtered = discoverProjects(projects, { filter, category, search, sort, savedIds });
  const resetDiscovery = () => { setSearch(''); setFilter('all'); setCategory('all'); setSort('original'); };
  const hasFilters = !!search.trim() || category !== 'all' || filter !== 'all' || sort !== 'original';
  const websites = projects.filter(p => p.type === 'website').length;
  const apps = projects.filter(p => p.type === 'app').length;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header"><a href="#" className="brand" onClick={e => { e.preventDefault(); navigate('universe'); }} aria-label="TurboUniverse home"><Mark /><span>TURBO<span className="brand-light">UNIVERSE</span><sup>®</sup></span></a>
      <nav ref={navigationRef} className={mobileNav ? 'main-nav open' : 'main-nav'} aria-label="Main navigation" id="main-navigation"><button className={view === 'universe' ? 'active' : ''} aria-current={view === 'universe' ? 'page' : undefined} onClick={() => navigate('universe')}>The universe</button><button className={view === 'story' ? 'active' : ''} aria-current={view === 'story' ? 'page' : undefined} onClick={() => navigate('story')}>The story</button><button className={view === 'collection' ? 'active' : ''} aria-current={view === 'collection' ? 'page' : undefined} onClick={() => navigate('collection')}>My collection <span className="nav-count">{projects.length}</span></button><button className={view === 'ai' ? 'active' : ''} aria-current={view === 'ai' ? 'page' : undefined} onClick={() => openAI()}>AI studio</button><button className={`nav-chromebook-link ${view === 'chromebooks' ? 'active' : ''}`} aria-current={view === 'chromebooks' ? 'page' : undefined} title="AI (Chromebooks)" onClick={() => navigate('chromebooks')}><Sparkles size={13} />AI (Chromebooks)</button><a className="nav-foundry-link" href="/interface-foundry/" target="_blank" rel="noopener noreferrer" aria-label="Open Interface Foundry">Interface Foundry<ArrowUpRight size={13} /></a></nav>
      <div className="header-actions"><button className="icon-button header-search-button" onClick={focusCollectionSearch} aria-label="Search all worlds" title="Search all worlds"><Search size={18} /></button>{editable ? <button className="add-project-button" onClick={() => setDialog(true)} disabled={offline}><Plus size={16} />Add project</button> : capabilities.canManage && <button className="add-project-button" onClick={() => setLogin(true)} disabled={offline}>Manage collection</button>}{editable && capabilities.requiresLogin && <button className="text-button owner-signout" onClick={() => { setOwnerKey(''); setOwner(false); setDialog(false); setToast('You’re signed out of collection management.'); }}>Sign out</button>}<button ref={navigationToggleRef} className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation" aria-controls="main-navigation" aria-expanded={mobileNav}>{mobileNav ? <X /> : <Menu />}</button></div>
    </header>

    <UpdateAnnouncement />
    <div className="appearance-layout"><AppearanceControls preferences={preferences} onChange={setPreferences} season={season} /></div>

    {offline && <div className="offline-banner" role="status"><WifiOff size={15} /> You’re offline. Explore your saved universe; reconnect to add projects.</div>}

    <main id="main-content" tabIndex={-1}>
      {view === 'universe' && <>
        <section className="hero cinematic-hero" aria-labelledby="hero-title">
          <div className="hero-cinema-grain" aria-hidden="true" />
          <div className="hero-copy"><div className="eyebrow hero-eyebrow"><span className="hero-coordinate">A WORLD OF IDEAS</span><span className="hero-eyebrow-line" /><span>BY TURBO</span></div><h1 id="hero-title" aria-label="TurboUniverse"><span className="hero-title-prefix">TURBO</span>UNIVERSE</h1><p className="hero-lead">All your worlds. One place.</p><p className="hero-description">Find your next favorite website. Keep your worlds close.<br />Bring your ideas to life with free, on-device AI.</p><div className="hero-actions"><button className="primary-button" onClick={explore}>Find your next world <ArrowUpRight size={18} /></button><button className="film-button" onClick={() => setFilm(true)}><CirclePlay size={19} strokeWidth={1.4} /> The life of Turbo</button></div></div>
          <div className="hero-bottom"><span>01 / A UNIVERSE IN THE MAKING</span><button onClick={explore}>BEGIN EXPLORING <ArrowDown size={13} /></button><span className="hero-live"><span className="status-dot" /> {projects.length} WORLDS & COUNTING</span></div>
        </section>
        <WorldStage projects={projects} savedIds={savedIds} mode={preferences.mode} onSelect={openWorld} onSave={toggleSaved} onCategory={category => browseWorlds({ category })} onLaunch={recordRecent} />
        <UniverseShowcase projects={projects} savedIds={savedIds} loading={loading} error={error} onSelect={openWorld} onToggleSaved={toggleSaved} onBrowse={browseWorlds} onAI={openAI} onRetry={retryProjects} />
        <section className="neptune-section content-section" aria-labelledby="neptune-title"><div className="neptune-copy"><div className="section-kicker"><span className="short-line" /> THE TURBO SYSTEM</div><h2 id="neptune-title">A little gravity.<br /><span>A lot of possibility.</span></h2><p>Every idea needs a place to land. This is where Turbo’s experiments become worlds of their own—places to connect, play, learn, and see what’s next.</p><p className="neptune-invitation">Pick a world in orbit, or let curiosity choose for you.</p><div className="neptune-coordinate"><span>INSPIRED BY NEPTUNE</span><span>IMAGINATION HAS NO OUTER LIMIT.</span></div></div><OrbitScene projects={projects} onSelect={openWorld} /></section>
        <PopularWorlds mode={preferences.mode} projects={projects} onSelect={openWorld} />
      </>}

      {view === 'chromebooks' ? <ChromebookAI /> : view === 'ai' ? <AIStudio initialPrompt={aiStarter} /> : view === 'story' ? <section className="story-page content-section"><div className="section-kicker"><span className="short-line" /> THE PERSON BEHIND THE PIXELS</div><div className="story-heading"><h1>A life in<br /><em>creation.</em></h1><div><p>Every universe starts somewhere.<br />This one starts with Turbo.</p><button className="secondary-button" onClick={() => setFilm(true)}><CirclePlay size={19} /> Play the cinematic story</button></div></div><div className="story-chapters">{story.map(chapter => <article key={chapter.number}><span className="chapter-number">{chapter.number}</span><div><span className="eyebrow">{chapter.label}</span><h2>{chapter.title}</h2><p>{chapter.text}</p></div><Sparkles size={24} /></article>)}</div><div className="story-ending"><Mark /><h2>The next chapter is<br /><span>already loading.</span></h2><button className="primary-button" onClick={explore}>Explore what’s been built <ArrowUpRight size={18} /></button></div></section> : <section className={`projects-section content-section ${view === 'collection' ? 'collection-page' : ''}`} id="projects">
        <div className="section-kicker"><span className="short-line" /> {view === 'collection' ? 'YOUR CREATIVE CONTROL ROOM' : 'THE EVER-EXPANDING COLLECTION'}</div><div className="section-heading"><div><h2>{view === 'collection' ? 'My collection' : 'Enter the universe'}<span className="heading-period">.</span></h2><p>{view === 'collection' ? (editable ? 'All your creations, together. Add something new or take a look around.' : 'Every creation, together. Take a look around the Turbo universe.') : 'Different worlds. Same creative DNA. Find your next rabbit hole.'}</p></div><div className="project-total"><span>{String(projects.length).padStart(2, '0')}</span> {projects.length === 1 ? 'WORLD' : 'WORLDS'} & COUNTING<ArrowUpRight size={17} /></div></div>
        {view === 'collection' && <div className="collection-stats"><div><Layers3 size={20} /><strong>{projects.length}</strong><span>Total projects</span></div><div><Globe2 size={20} /><strong>{websites}</strong><span>Websites</span></div><div><Smartphone size={20} /><strong>{apps}</strong><span>Apps</span></div><button className="secondary-button" onClick={exportProjects} disabled={!projects.length}><ArrowDownToLine size={17} /> Export project list</button></div>}
        <RecentWorlds projects={projects} recentIds={recentIds} onSelect={openWorld} onLaunch={recordRecent} onClear={clearRecent} />
        <div className="project-toolbar"><div className="filters" role="group" aria-label="Filter projects"><button className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}><LayoutGrid size={15} /> All worlds <span>{projects.length}</span></button><button className={filter === 'website' ? 'active' : ''} aria-pressed={filter === 'website'} onClick={() => setFilter('website')}><Globe2 size={15} /> Websites <span>{websites}</span></button><button className={filter === 'app' ? 'active' : ''} aria-pressed={filter === 'app'} onClick={() => setFilter('app')}><Smartphone size={15} /> Apps <span>{apps}</span></button><button className={`saved-filter ${filter === 'saved' ? 'active' : ''}`} aria-pressed={filter === 'saved'} onClick={() => setFilter('saved')}><Star size={15} /> Saved <span>{savedCount}</span></button></div><label className="search-field"><Search size={16} /><input ref={searchRef} type="search" maxLength={200} aria-label="Search projects" placeholder="Find your world…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setSearch(''); }} />{search ? <button className="search-clear" aria-label="Clear search" onClick={() => { setSearch(''); searchRef.current?.focus(); }}><X size={15} /></button> : <kbd><Command size={10} /> K</kbd>}</label></div>
        <div className="discovery-controls"><p className="discovery-results" role="status" aria-label="Search results">{loading ? 'Finding your worlds…' : <><strong>{filtered.length}</strong> of {projects.length} worlds{search.trim() && <span> matching “{search.trim()}”</span>}</>}{hasFilters && <button onClick={resetDiscovery}>Reset filters <X size={12} /></button>}</p><div className="discovery-selects"><label>Category<select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">Every category</option>{category !== 'all' && !categories.includes(category) && <option value={category}>{category}</option>}{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label>Sort by<select aria-label="Sort worlds" value={sort} onChange={event => setSort(event.target.value as DiscoverySort)}><option value="original">Original order</option><option value="featured">Featured first</option><option value="newest">Newest first</option><option value="az">Name, A–Z</option></select></label></div></div>
        {hasFilters && <div className="active-discovery-filters" role="group" aria-label="Active filters">
          {filter !== 'all' && <button onClick={() => setFilter('all')} aria-label="Remove type filter"><span>{filter === 'website' ? 'Websites' : filter === 'app' ? 'Apps' : 'Saved worlds'}</span><X size={12} /></button>}
          {category !== 'all' && <button onClick={() => setCategory('all')} aria-label="Remove category filter"><span>{category}</span><X size={12} /></button>}
          {!!search.trim() && <button onClick={() => { setSearch(''); searchRef.current?.focus(); }} aria-label="Remove search filter" title={search.trim()}><span>Search: {search.trim()}</span><X size={12} /></button>}
          {sort !== 'original' && <button onClick={() => setSort('original')} aria-label="Reset sort order"><span>{sort === 'az' ? 'Name, A–Z' : sort === 'newest' ? 'Newest first' : 'Featured first'}</span><X size={12} /></button>}
        </div>}
        {error ? <div className="empty-state"><WifiOff size={28} /><h3>We lost the signal.</h3><p role="alert">{error}</p><button className="secondary-button" onClick={retryProjects}>Try again</button></div> : loading ? <div className="project-grid" aria-busy="true" aria-label="Loading projects"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div> : <div className="project-grid">
          {filtered.map((project, index) => <article className="project-card" key={project.id}><button className="project-image-button" onClick={() => openWorld(project)} aria-label={`View ${project.title}`}><ProjectArt project={project} mode={preferences.mode} /><span className="card-index">{String(index + 1).padStart(2, '0')} / TURBO ORIGINAL</span>{project.featured && <span className="featured-badge"><Sparkles size={11} /> FEATURED</span>}<span className="card-open"><ArrowUpRight size={20} /></span></button><button className={`save-project-button ${savedIds.includes(project.id) ? 'saved' : ''}`} aria-label={`${savedIds.includes(project.id) ? 'Unsave' : 'Save'} ${project.title}`} aria-pressed={savedIds.includes(project.id)} onClick={() => toggleSaved(project)}><Star size={15} fill={savedIds.includes(project.id) ? 'currentColor' : 'none'} /></button><div className="project-card-body"><div className="project-tags"><span className="project-tag">{project.type === 'website' ? <Globe2 size={10} /> : <Smartphone size={10} />}{project.type}</span><span>{project.category}</span></div><button className="project-explore-link" onClick={() => openWorld(project)}><span>{project.status === 'setup-pending' ? 'View project details' : `Explore ${project.type === 'app' ? 'app' : 'website'}`}</span><ArrowUpRight size={17} /></button><p>{project.description || 'A new world in the Turbo universe. Open it and explore.'}</p>{project.url && <a className="card-launch" href={project.url} target="_blank" rel="noopener noreferrer" onClick={() => recordRecent(project.id)} aria-label={`${project.status === 'setup-pending' ? 'View source for' : 'Launch'} ${project.title}`}>{project.status === 'setup-pending' ? 'View on GitHub' : 'Open world'}<ArrowUpRight size={14} /></a>}<div className="card-foot"><span className="status-dot" /> {project.status === 'setup-pending' ? 'SETUP PENDING' : 'IN THE UNIVERSE'}<span>TURBO ORIGINAL</span></div></div></article>)}
          {!projects.length && <div className="empty-state catalog-empty"><Compass size={29} /><h3>Your universe is waiting.</h3><p>{editable ? 'Add your first website or app to give this collection a place to begin.' : 'New worlds will appear here as they are added. You can check again any time.'}</p><button className="secondary-button" onClick={editable ? () => setDialog(true) : retryProjects}>{editable ? 'Add your first world' : 'Check for worlds'}<ArrowRight size={16} /></button></div>}
          {!filtered.length && projects.length > 0 && <div className="empty-state filter-empty"><Compass size={29} /><h3>{filter === 'saved' && !search.trim() && category === 'all' ? 'Keep your favorite worlds close.' : filter === 'app' && !search.trim() && category === 'all' ? 'Your next app belongs here.' : 'No worlds found.'}</h3><p>{filter === 'saved' && !search.trim() && category === 'all' ? 'Tap the star on any project to save it on this device.' : filter === 'app' && !search.trim() && category === 'all' ? (editable ? 'Add an app link or upload a project to expand your universe.' : 'There are more worlds on the way. Explore the rest of the collection.') : 'Try another search or explore a different category.'}</p><button className="secondary-button" onClick={resetDiscovery}>Show all worlds <ArrowRight size={16} /></button></div>}
          {editable && <button className="add-world-card" onClick={() => setDialog(true)} disabled={offline}><span className="add-world-orbit"><Plus size={28} strokeWidth={1.2} /></span><span className="eyebrow">THERE’S ALWAYS ROOM FOR MORE</span><strong>Your next world<br />starts here.</strong><span className="add-world-link">Add a project <ArrowUpRight size={16} /></span><span className="add-world-hint">A website, an app, a new possibility.</span></button>}
        </div>}
        <div className="collection-note"><span><span className="status-dot" /> THE UNIVERSE IS ALWAYS EXPANDING</span>{editable ? <button className="text-button" onClick={() => setDialog(true)} disabled={offline}>Bring your projects together <ArrowRight size={15} /></button> : <span className="collection-readonly">Explore the collection. New worlds are added by Turbo.</span>}</div>
      </section>}

      {(view === 'universe' || view === 'story') && <section className="about-section content-section"><div className="about-art about-landscape" aria-hidden="true"><span className="landscape-frame" /><span className="about-art-label">ROOTED HERE. REACHING FURTHER.</span><span className="about-cross">+</span></div><div className="about-copy"><div className="section-kicker"><span className="short-line" /> MORE THAN A COLLECTION</div><h2>A little chaos.<br />A lot of <span>creation.</span></h2><p>Some people collect things. Turbo creates worlds. This is a living archive of the ideas, experiments, websites, and apps that make up one creative universe.</p><p>Different directions. One unmistakable energy.</p><button className="text-button about-story" onClick={() => navigate(view === 'story' ? 'universe' : 'story')}>{view === 'story' ? 'Back to the universe' : 'Get to know Turbo'} <ArrowUpRight size={18} /></button></div></section>}

      {view !== 'chromebooks' && <section className="app-banner content-section"><div className="app-banner-icon"><MonitorSmartphone size={29} /></div><div><span className="eyebrow">YOUR UNIVERSE. TO GO.</span><h2>Big ideas. Pocket-sized.</h2><p>Keep TurboUniverse one tap away. Install the app and take your worlds with you.</p></div><button className="secondary-button" onClick={() => setShowInstall(true)}>{installed ? <Check size={17} /> : <Download size={17} />}{installed ? 'App installed' : 'Get the app'}<ArrowUpRight size={16} /></button></section>}
    </main>

    <footer className="site-footer"><div className="footer-main"><a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('universe'); }}><Mark /><span>TURBO<span className="brand-light">UNIVERSE</span></span></a><p>One creator. A universe of possibilities.</p><button className="text-button" onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}>BACK TO TOP <ArrowUpRight size={15} /></button></div><div className="footer-bottom"><span>© {new Date().getFullYear()} TURBOUNIVERSE</span><span>IMAGINED & BUILT BY TURBO <Sparkles size={12} /></span><span><span className="status-dot" /> ALWAYS IN ORBIT</span></div></footer>

    {dialog && editable && <ProjectDialog maxUploadBytes={capabilities.maxUploadBytes} onClose={() => setDialog(false)} onCreated={() => { void loadProjects(); setToast('A new world has entered your universe.'); }} />}
    {login && capabilities.canManage && <OwnerLogin onClose={() => setLogin(false)} onSuccess={() => { setOwner(true); setLogin(false); setToast('Welcome back. Your universe is ready to manage.'); }} />}
    {film && <StoryFilm onClose={closeFilm} />}
    {selected && <ProjectDetails key={selected.id} projects={projects} onSelect={openWorld} mode={preferences.mode} editable={editable} project={selected} onClose={closeDetails} onDelete={removeProject} saved={savedIds.includes(selected.id)} onToggleSaved={() => toggleSaved(selected)} />}
    {showInstall && <InstallDialog dialogRef={installRef} onClose={closeInstall} installed={installed} prompt={installPrompt} onInstall={async () => { if (!installPrompt) return; await installPrompt.prompt(); const choice = await installPrompt.userChoice; setInstallPrompt(null); if (choice.outcome === 'accepted') setShowInstall(false); }} />}
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}

function InstallDialog({ dialogRef, onClose, installed, prompt, onInstall }: { dialogRef: React.RefObject<HTMLDivElement | null>; onClose: () => void; installed: boolean; prompt: InstallEvent | null; onInstall: () => Promise<void> }) {
  useDialogFocus(dialogRef, onClose);
  return <div className="dialog-backdrop" onClick={e => e.target === e.currentTarget && onClose()}><div className="install-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="install-title"><button className="icon-button" aria-label="Close install instructions" onClick={onClose}><X /></button><Mark /><span className="eyebrow">THE WHOLE UNIVERSE. ONE TAP.</span><h2 id="install-title">{installed ? 'You’re in orbit.' : 'Take Turbo with you.'}</h2><p>{installed ? 'TurboUniverse is already running as an app on this device.' : 'Install TurboUniverse on your home screen for a full-screen experience and offline access to your collection.'}</p>{!installed && (prompt ? <button className="primary-button" onClick={() => void onInstall()}>Install TurboUniverse <Download size={18} /></button> : <div className="install-instructions"><strong>On iPhone or iPad</strong><p>Open in Safari, tap Share, then “Add to Home Screen.”</p><strong>On Android or desktop</strong><p>Open your browser menu and choose “Install app” or “Add to Home Screen” when available.</p><span className="field-hint">Installation requires HTTPS or localhost and a supported browser.</span></div>)}</div></div>;
}
