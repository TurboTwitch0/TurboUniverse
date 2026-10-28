import { ArrowUpRight, History, X } from 'lucide-react';
import './recent-worlds.css';

type World = { id: string; title: string; category: string; url: string; status?: 'setup-pending' };

export default function RecentWorlds<T extends World>({ projects, recentIds, onSelect, onLaunch, onClear }: {
  projects: T[]; recentIds: string[]; onSelect: (project: T) => void; onLaunch: (id: string) => void; onClear: () => void;
}) {
  const worlds = recentIds.flatMap(id => {
    const project = projects.find(item => item.id === id);
    return project ? [project] : [];
  });
  if (!worlds.length) return null;
  return <section className="recent-worlds" aria-labelledby="recent-worlds-title">
    <div className="recent-worlds-heading"><div><span className="recent-worlds-icon"><History size={21} /></span><div><span className="eyebrow">YOUR LAUNCHPAD</span><h3 id="recent-worlds-title">Pick up where curiosity left off.</h3></div></div><button className="text-button" onClick={onClear} aria-label="Clear recent worlds">Clear recent<X size={13} /></button></div>
    <p className="recent-worlds-description">Shortcuts to worlds you recently explored. Your history stays in this browser.</p>
    <div className="recent-worlds-grid">{worlds.map(project => <article className="recent-world" key={project.id}><button className="recent-world-details" onClick={() => onSelect(project)} aria-label={`Revisit ${project.title}`}><span>{project.status === 'setup-pending' ? 'SETUP PENDING' : project.category}</span><strong>{project.title}</strong></button>{project.url && <a href={project.url} target="_blank" rel="noopener noreferrer" onClick={() => onLaunch(project.id)} aria-label={`${project.status === 'setup-pending' ? 'View source for' : 'Launch recent'} ${project.title}`} title={project.status === 'setup-pending' ? 'View project on GitHub' : 'Open in a new tab'}><ArrowUpRight size={18} /></a>}</article>)}</div>
  </section>;
}
