import { useId, useState } from 'react';
import { ArrowRight, ArrowUpRight, History, Star } from 'lucide-react';
import { canonicalWorldId } from '../catalogAliases';
import './personal-launchpad.css';

type ShortcutWorld = {
  id: string;
  title: string;
  url: string;
  category: string;
  status?: 'setup-pending';
};

export default function PersonalLaunchpad<T extends ShortcutWorld>({
  projects,
  savedIds,
  recentIds,
  onSelect,
  onLaunch,
  onBrowseSaved,
}: {
  projects: readonly T[];
  savedIds: readonly string[];
  recentIds: readonly string[];
  onSelect: (project: T) => void;
  onLaunch: (id: string) => void;
  onBrowseSaved: () => void;
}) {
  const headingId = useId();
  const [preferredView, setPreferredView] = useState<'saved' | 'recent'>('saved');
  const byId = new Map(projects.map(project => [project.id, project]));
  const resolveWorlds = (ids: readonly string[]) => [...new Set(ids.map(canonicalWorldId))].flatMap(id => {
    const project = byId.get(id);
    return project ? [project] : [];
  });
  const saved = resolveWorlds(savedIds);
  const recent = resolveWorlds(recentIds);
  if (!saved.length && !recent.length) return null;

  const view = preferredView === 'recent' && recent.length ? 'recent' : saved.length ? 'saved' : 'recent';
  const shortcuts = (view === 'saved' ? saved : recent).slice(0, 4);

  return <section className="personal-launchpad content-section" aria-labelledby={headingId}>
    <div className="personal-launchpad-heading">
      <h2 id={headingId}>Your shortcuts</h2>
      {!!saved.length && !!recent.length && <div className="personal-launchpad-views" role="group" aria-label="Shortcut list">
        <button aria-pressed={view === 'saved'} onClick={() => setPreferredView('saved')}><Star size={14} aria-hidden="true" />Saved</button>
        <button aria-pressed={view === 'recent'} onClick={() => setPreferredView('recent')}><History size={14} aria-hidden="true" />Recent</button>
      </div>}
      {!!saved.length && <button className="personal-launchpad-browse" onClick={onBrowseSaved}>View saved<ArrowRight size={15} aria-hidden="true" /></button>}
    </div>
    <div className="personal-launchpad-grid">
      {shortcuts.map(project => {
        const initial = project.title.replace(/^Turbo\s*/i, '').trim().slice(0, 1) || project.title.slice(0, 1) || 'T';
        const pending = project.status === 'setup-pending';
        return <article className="personal-shortcut" key={project.id}>
          <button className="personal-shortcut-preview" onClick={() => onSelect(project)} aria-label={`Preview shortcut ${project.title}`}>
            <span className="personal-shortcut-initial" aria-hidden="true">{initial}</span>
            <span><strong>{project.title}</strong><small>{pending ? 'Setup pending' : project.category}</small></span>
          </button>
          {project.url && <a className="personal-shortcut-open" href={project.url} target="_blank" rel="noopener noreferrer" onClick={() => onLaunch(project.id)} aria-label={`${pending ? 'View source for' : 'Open shortcut'} ${project.title}`}>
            <span>{pending ? 'Source' : 'Open'}</span><ArrowUpRight size={15} aria-hidden="true" />
          </a>}
        </article>;
      })}
    </div>
  </section>;
}
