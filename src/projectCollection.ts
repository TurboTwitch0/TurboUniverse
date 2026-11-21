export type Project = {
  id: string; title: string; type: 'website' | 'app'; url: string;
  description: string; category: string; year: number; featured: boolean;
  createdAt: string; coverUrl?: string; fileUrl?: string; fileName?: string;
  status?: 'setup-pending';
};

/** Validate rendering fields before replacing the last loaded collection.
 * Keep this contract aligned with the classic worker; cache tests check both.
 */
export function isProjectCollection(value: unknown): value is { projects: Project[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const projects = (value as Record<string, unknown>).projects;
  if (!Array.isArray(projects)) return false;
  const identifiers = new Set<string>();
  return projects.every(project => {
    if (!project || typeof project !== 'object' || Array.isArray(project) ||
        typeof project.id !== 'string' || !project.id.trim() || identifiers.has(project.id) ||
        typeof project.title !== 'string' || !project.title.trim() ||
        !['website', 'app'].includes(project.type) || typeof project.url !== 'string' ||
        typeof project.description !== 'string' || typeof project.category !== 'string' ||
        !Number.isInteger(project.year) || typeof project.featured !== 'boolean' ||
        typeof project.createdAt !== 'string') return false;
    identifiers.add(project.id);
    return true;
  });
}
