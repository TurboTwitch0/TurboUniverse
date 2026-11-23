import { useCallback, useEffect, useState } from 'react';
import { createRecentWorldStore, RECENT_WORLDS_KEY } from './recentWorlds';
import { withWorldStorageLock } from './worldStorageLock';

export function useRecentWorlds() {
  const [store] = useState(() => createRecentWorldStore(() => localStorage,
    action => withWorldStorageLock(RECENT_WORLDS_KEY, action, navigator.locks)));
  const [recentIds, setRecentIds] = useState(store.snapshot);
  const recordRecent = useCallback((id: string) => {
    void store.record(id).then(() => setRecentIds(store.sync()));
  }, [store]);
  const clearRecent = useCallback(() => {
    return store.clear().then(() => setRecentIds(store.sync()));
  }, [store]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== RECENT_WORLDS_KEY && event.key !== null) return;
      setRecentIds(store.sync());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [store]);
  return { recentIds, recordRecent, clearRecent };
}
