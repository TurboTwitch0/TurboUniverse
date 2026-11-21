import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalWorldId } from './catalogAliases';

type World = { id: string };

function requestedWorld() {
  const id = new URL(window.location.href).searchParams.get('world');
  return id ? canonicalWorldId(id) : null;
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
export function useWorldLinks<T extends World>(projects: T[], ready = true) {
  const [selected, setSelected] = useState<T | null>(null);
  const [unavailableWorld, setUnavailableWorld] = useState<string | null>(null);
  const projectsRef = useRef(projects);
  const readyRef = useRef(ready);
  const resolvedId = useRef<string | null>(null);
  projectsRef.current = projects;
  readyRef.current = ready;

  const syncFromLocation = useCallback(() => {
    const id = requestedWorld();
    const project = projectsRef.current.find(item => item.id === id) ?? null;
    // A formerly available world may have been removed from the collection.
    const removed = id && id === resolvedId.current && !project;
    if (removed) updateWorldUrl(null, 'replaceState');
    resolvedId.current = project?.id ?? null;
    setSelected(project);
    setUnavailableWorld(readyRef.current && id && !project && !removed ? id : null);
  }, []);

  useEffect(() => { syncFromLocation(); }, [projects, ready, syncFromLocation]);
  useEffect(() => {
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [syncFromLocation]);

  const openWorld = useCallback((project: T) => {
    updateWorldUrl(project.id, 'pushState');
    resolvedId.current = project.id;
    setUnavailableWorld(null);
    setSelected(project);
  }, []);

  const closeWorld = useCallback(() => {
    updateWorldUrl(null, 'replaceState');
    resolvedId.current = null;
    setUnavailableWorld(null);
    setSelected(null);
  }, []);

  return { selected, unavailableWorld, openWorld, closeWorld };
}
