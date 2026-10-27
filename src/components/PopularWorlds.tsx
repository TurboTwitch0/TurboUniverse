import { ArrowUpRight } from 'lucide-react';
import { getWorldPresentation, POPULAR_WORLDS } from '../popularWorlds';

type Project = { id: string; title: string; type: 'website' | 'app'; url: string; description: string; coverUrl?: string; status?: 'setup-pending' };

export default function PopularWorlds<T extends Project>({ projects, onSelect, mode = 'space' }: { mode?: 'earth' | 'space'; projects: T[]; onSelect: (project: T) => void }) {
  const worlds = POPULAR_WORLDS.flatMap(world => {
    const project = projects.find(item => getWorldPresentation(item)?.id === world.id);
    return project ? [{ world, project }] : [];
  });
  if (!worlds.length) return null;

  return <section className="popular-worlds content-section" aria-labelledby="popular-worlds-title">
    <div className="section-kicker"><span className="short-line" /> POPULAR DESTINATIONS</div>
    <div className="popular-worlds-heading"><h2 id="popular-worlds-title">Four worlds.<br className="popular-mobile-break" /> Endless possibilities<span>.</span></h2><p>Start with a favorite. See where it takes you.</p></div>
    <div className="popular-worlds-grid">
      {worlds.map(({ world, project }, index) => <article className="popular-world" key={world.id}>
        <button className="popular-world-image" onClick={() => onSelect({ ...project, title: world.displayTitle, description: world.description })} aria-label={`Discover ${world.displayTitle}`}>
          <img src={project.coverUrl || (mode === 'earth' ? `/images/${['earth-spring', 'earth-hero', 'earth-detail', 'earth-winter'][index]}.webp` : world.image)} alt="" loading="lazy" decoding="async" width="1200" height="800" />
          <span className="popular-world-shade" aria-hidden="true" />
          <span className="popular-world-number">0{index + 1} / {world.label}</span>
          <span className="popular-world-name"><strong>{world.displayTitle}</strong><span>{world.tagline}</span></span>
          <span className="popular-world-open" aria-hidden="true"><ArrowUpRight size={18} /></span>
        </button>
        <div className="popular-world-copy"><span>{project.status === 'setup-pending' ? 'SETUP PENDING' : project.type === 'app' ? 'APP' : 'WEBSITE'} / {world.label}</span><p>{world.description}</p><div className="popular-world-actions"><a className="popular-world-launch" href={project.url} target="_blank" rel="noopener noreferrer" aria-label={`${project.status === 'setup-pending' ? 'View project' : 'Open'} ${world.displayTitle}`} title={`${project.status === 'setup-pending' ? 'View project' : 'Open'} ${world.displayTitle} in a new tab`}>{project.status === 'setup-pending' ? 'View on GitHub' : `Open ${project.type === 'app' ? 'app' : 'website'}`} <ArrowUpRight size={14} /></a><button className="popular-world-details" onClick={() => onSelect({ ...project, title: world.displayTitle, description: world.description })} aria-label={`Details about ${world.displayTitle}`}>Details</button></div></div>
      </article>)}
    </div>
  </section>;
}
