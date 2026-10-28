export type RelatedWorld = {
  id: string;
  title: string;
  category: string;
  featured?: boolean;
  status?: string;
};

/** Prefer neighboring categories, then curated featured worlds in catalog order. */
export function getRelatedWorlds<T extends RelatedWorld>(projects: readonly T[], currentId: string): T[] {
  const category = projects.find(project => project.id === currentId)?.category;
  const available = projects.filter(project => project.id !== currentId && project.status !== 'setup-pending');
  const candidates = [
    ...available.filter(project => !!category && project.category === category),
    ...available.filter(project => project.featured),
  ];
  const seen = new Set<string>();
  return candidates.filter(project => {
    if (seen.has(project.id)) return false;
    seen.add(project.id);
    return true;
  }).slice(0, 3);
}
