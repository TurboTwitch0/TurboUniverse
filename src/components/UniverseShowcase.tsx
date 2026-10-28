import { ArrowRight, ArrowUpRight, Bookmark, Compass, Globe2, Layers3, Search, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { getWorldPresentation, POPULAR_WORLDS } from '../popularWorlds';

type World = { id: string; title: string; category: string; featured: boolean; type: 'website' | 'app'; status?: 'setup-pending' };
type BrowseOptions = { filter?: 'all' | 'website' | 'app' | 'saved'; category?: string };

export default function UniverseShowcase<T extends World>({ projects, savedIds, loading, error, onSelect, onToggleSaved, onBrowse, onAI, onRetry }: {
  projects: T[]; savedIds: string[]; loading: boolean; error: string;
  onSelect: (world: T) => void; onToggleSaved: (world: T) => void; onBrowse: (options: BrowseOptions) => void; onAI: (prompt: string) => void; onRetry: () => void;
}) {
  const popular = POPULAR_WORLDS.flatMap(presentation => {
    const world = projects.find(item => !item.status && getWorldPresentation(item)?.id === presentation.id);
    return world ? [world] : [];
  }).slice(0, 3);
  const preview = popular.length ? popular : projects.filter(world => world.featured && !world.status).slice(0, 3);
  const worlds = preview.length ? preview : projects.slice(0, 3);
  const savedCount = projects.filter(world => savedIds.includes(world.id)).length;
  const categories = [...new Set(projects.map(world => world.category))].slice(0, 6);
  return <section className="universe-showcase content-section" aria-labelledby="showcase-title">
    <div className="showcase-heading"><div><span className="eyebrow">MADE TO EXPLORE. BUILT TO KEEP.</span><h2 id="showcase-title">One home for<br /><span>your next obsession.</span></h2></div><p>Find a world. Save a favorite.<br />Give your next idea a little momentum.</p></div>
    <div className="showcase-grid">
      <div className="showcase-catalog">
        <div className="showcase-window-bar"><span className="showcase-window-mark"><Compass size={16} /> YOUR UNIVERSE</span><span>{loading ? 'Finding worlds…' : `${projects.length} worlds to explore`}</span></div>
        <div className="showcase-catalog-content">
          <div className="showcase-panel-heading"><div><span className="showcase-label">A PLACE FOR EVERY POSSIBILITY</span><h3>A whole universe.<br />Beautifully organized.</h3></div><span className="showcase-feature-icon"><Layers3 size={26} strokeWidth={1.4} /></span></div>
          <div className="showcase-shortcuts" role="group" aria-label="Quick collection views"><button onClick={() => onBrowse({})}><Globe2 size={13} />All worlds</button><button onClick={() => onBrowse({ filter: 'app' })}>Apps<ArrowUpRight size={12} /></button><button onClick={() => onBrowse({ filter: 'saved' })}><Bookmark size={13} />Saved<span>{savedCount}</span></button></div>
          <div className="showcase-world-list">
            {loading ? <div className="showcase-loading" role="status" aria-label="Loading featured worlds"><i /><i /><i /></div> : error ? <div className="showcase-unavailable"><p>The collection couldn’t load.</p><button onClick={onRetry}>Try again<ArrowRight size={14} /></button></div> : worlds.length ? worlds.map((world, index) => <article className="showcase-world-row" key={world.id}>
              <button className="showcase-world-preview" onClick={() => onSelect(world)} aria-label={`Preview ${world.title}`}><span className={`showcase-world-monogram monogram-${index}`} aria-hidden="true">{world.title.replace(/^Turbo\s*/i, '').slice(0, 1) || 'T'}</span><span><strong>{world.title}</strong><small>{world.status === 'setup-pending' ? 'Setup pending' : world.category}</small></span><ArrowUpRight size={16} /></button>
              <button className="showcase-world-save" aria-label={`${savedIds.includes(world.id) ? 'Unsave' : 'Save'} ${world.title} from showcase`} aria-pressed={savedIds.includes(world.id)} onClick={() => onToggleSaved(world)}><Star size={16} fill={savedIds.includes(world.id) ? 'currentColor' : 'none'} /></button>
            </article>) : <div className="showcase-unavailable"><p>Your first world is still on its way.</p><button onClick={onRetry}>Check for worlds<ArrowRight size={14} /></button></div>}
          </div>
          <button className="showcase-browse" onClick={() => onBrowse({})}>Explore the collection<ArrowRight size={17} /></button>
        </div>
      </div>
      <div className="showcase-ai">
        <div className="showcase-ai-orbit" aria-hidden="true"><i /><i /><span><Sparkles size={29} strokeWidth={1.25} /></span><b>YOUR NEXT IDEA</b></div>
        <span className="showcase-label">A LITTLE SPARK. ALL YOURS.</span><h3>Big ideas.<br />Zero API bills.</h3><p>Real AI replies, generated on your device. Write, study, code, or follow a new idea.</p>
        <button className="showcase-prompt" onClick={() => onAI('Suggest five imaginative names for a space club.')} aria-label="Try the space club AI starter"><span>“What should I name my space club?”</span><ArrowUpRight size={16} /></button>
        <button className="primary-button" aria-label="Open AI studio" onClick={() => onAI('')}>Open free AI<Sparkles size={16} /></button><span className="showcase-ai-note"><ShieldCheck size={13} />Opt-in download · compatible WebGPU browser</span>
      </div>
    </div>
    {!!categories.length && <div className="ecosystem-paths"><div><Search size={16} /><span>Follow your curiosity</span></div><div className="ecosystem-categories" role="group" aria-label="Explore ecosystem categories">{categories.map(category => <button key={category} onClick={() => onBrowse({ category })}>{category}<ArrowUpRight size={12} /></button>)}</div></div>}
  </section>;
}
