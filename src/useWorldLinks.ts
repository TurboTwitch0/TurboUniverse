import { useCallback, useEffect, useRef, useState } from 'react';

type World = { id: string };

function requestedWorld() {
  return new URL(window.location.href).searchParams.get('world');
}

function updateWorldUrl(id: string | null, method: 'pushState' | 'replaceState') {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('world', id);
  else url.searchParams.delete('world');
  if (url.href === window.location.href) return;
  try { window.history[method](window.history.state, '', url); }
  catch { /* Details remain usable when a browser restricts history access. */ }
}

/** Project details are addressable, reloadable, and follow browser navigation. */
export function useWorldLinks<T extends World>(projects: T[]) {
  const [selected, setSelected] = useState<T | null>(null);
  const projectsRef = useRef(projects);
  const resolvedId = useRef<string | null>(null);
  projectsRef.current = projects;

  const syncFromLocation = useCallback(() => {
    const id = requestedWorld();
    const project = projectsRef.current.find(item => item.id === id) ?? null;
    // A formerly available world may have been removed from the collection.
    if (id && id === resolvedId.current && !project) updateWorldUrl(null, 'replaceState');
    resolvedId.current = project?.id ?? null;
    setSelected(project);
  }, []);

  useEffect(() => { syncFromLocation(); }, [projects, syncFromLocation]);
  useEffect(() => {
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [syncFromLocation]);

  const openWorld = useCallback((project: T) => {
    updateWorldUrl(project.id, 'pushState');
    resolvedId.current = project.id;
    setSelected(project);
  }, []);

  const closeWorld = useCallback(() => {
    updateWorldUrl(null, 'replaceState');
    resolvedId.current = null;
    setSelected(null);
  }, []);

  return { selected, openWorld, closeWorld };
}
