import { useCallback, useEffect, useRef, useState } from 'react';
import { parseRecentWorlds, RECENT_WORLDS_KEY, rememberWorld } from './recentWorlds';

function readRecentWorlds() {
  try { return parseRecentWorlds(localStorage.getItem(RECENT_WORLDS_KEY)); }
  catch { return []; }
}

export function useRecentWorlds() {
  const [recentIds, setRecentIds] = useState(readRecentWorlds);
  const current = useRef(recentIds);
  const update = useCallback((ids: string[]) => {
    if (current.current === ids) return;
    current.current = ids;
    setRecentIds(ids);
    try {
      if (ids.length) localStorage.setItem(RECENT_WORLDS_KEY, JSON.stringify(ids));
      else localStorage.removeItem(RECENT_WORLDS_KEY);
    } catch { /* Shortcuts remain available during this visit. */ }
  }, []);
  const recordRecent = useCallback((id: string) => update(rememberWorld(current.current, id)), [update]);
  const clearRecent = useCallback(() => update([]), [update]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== RECENT_WORLDS_KEY && event.key !== null) return;
      const ids = readRecentWorlds();
      current.current = ids;
      setRecentIds(ids);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return { recentIds, recordRecent, clearRecent };
}
