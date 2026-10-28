import { ArrowUpRight } from 'lucide-react';
import { getRelatedWorlds, type RelatedWorld } from '../relatedWorlds';
import './related-worlds.css';

export default function RelatedWorlds<T extends RelatedWorld>({ currentId, projects, onSelect }: {
  currentId: string;
  projects: readonly T[];
  onSelect: (project: T) => void;
}) {
  const related = getRelatedWorlds(projects, currentId);
  if (!related.length) return null;

  return <section className="related-worlds" aria-label="Related worlds">
    <div className="related-worlds-heading"><h3>Keep exploring</h3><span>More worlds to discover</span></div>
    <div className="related-worlds-grid">{related.map(project => <button key={project.id} onClick={() => onSelect(project)} aria-label={`Explore related ${project.title}`}>
      <span><small>{project.category}</small><strong>{project.title}</strong></span><ArrowUpRight size={17} aria-hidden="true" />
    </button>)}</div>
  </section>;
}
