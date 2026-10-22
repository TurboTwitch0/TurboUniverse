export type DiscoverySort = 'original' | 'az' | 'newest' | 'featured';
type Discoverable = { id: string; title: string; description: string; category: string; type: string; featured: boolean; createdAt: string };
type Options = { filter: string; category: string; search: string; sort: DiscoverySort; savedIds: string[] };

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
const timestamp = (value: string) => Date.parse(value) || 0;

export function discoverProjects<T extends Discoverable>(projects: T[], options: Options): T[] {
  const terms = normalize(options.search.trim()).split(/\s+/).filter(Boolean);
  const saved = new Set(options.savedIds);
  const result = projects.filter(project => {
    if (options.filter === 'saved' ? !saved.has(project.id) : options.filter !== 'all' && project.type !== options.filter) return false;
    if (options.category !== 'all' && project.category !== options.category) return false;
    const text = normalize(`${project.title} ${project.description} ${project.category}`);
    return terms.every(term => text.includes(term));
  });
  if (options.sort === 'az') result.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  if (options.sort === 'newest') result.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
  if (options.sort === 'featured') result.sort((a, b) => Number(b.featured) - Number(a.featured));
  return result;
}
