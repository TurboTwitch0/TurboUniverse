import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiscoverySort } from './discovery';
import { normalizeDiscoveryState, readDiscoveryState, urlForDiscoveryState, type DiscoveryState } from './discoveryUrl';

/** Keep discovery controls bookmarkable and restore them with browser navigation. */
export function useDiscoveryState() {
  const [state, setState] = useState(() => readDiscoveryState(window.location.href));
  const latest = useRef(state);

  const update = useCallback((change: Partial<DiscoveryState>) => {
    const next = { ...latest.current, ...change };
    latest.current = next;
    setState(next);
  }, []);

  const setFilter = useCallback((filter: string) => {
    update({ filter: normalizeDiscoveryState({ ...latest.current, filter }).filter });
  }, [update]);
  // Preserve spaces while typing; the shared address uses the equivalent trimmed query.
  const setSearch = useCallback((search: string) => update({ search: search.slice(0, 200) }), [update]);
  const setCategory = useCallback((category: string) => {
    update({ category: normalizeDiscoveryState({ ...latest.current, category }).category });
  }, [update]);
  const setSort = useCallback((sort: DiscoverySort) => {
    update({ sort: normalizeDiscoveryState({ ...latest.current, sort }).sort });
  }, [update]);

  useEffect(() => {
    const restore = () => {
      const restored = readDiscoveryState(window.location.href);
      // Mark the restored state immediately so an older pending effect cannot overwrite it.
      latest.current = restored;
      setState(restored);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    if (state !== latest.current) return;
    const url = urlForDiscoveryState(window.location.href, state);
    if (url.href === window.location.href) return;
    try { window.history.replaceState(window.history.state, '', url); }
    catch { /* Controls remain usable when a browser restricts history access. */ }
  }, [state]);

  return { ...state, setFilter, setSearch, setCategory, setSort };
}
