import { useCallback, useEffect, useState } from 'react';
import { createSavedWorldStore, SAVED_WORLDS_KEY } from './savedWorlds';
import { withWorldStorageLock } from './worldStorageLock';

export function useSavedWorlds() {
  const [store] = useState(() => createSavedWorldStore(() => localStorage,
    action => withWorldStorageLock(SAVED_WORLDS_KEY, action, navigator.locks)));
  const [savedIds, setSavedIds] = useState(store.snapshot);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === SAVED_WORLDS_KEY || event.key === null) setSavedIds(store.sync());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [store]);
  const toggleSavedWorld = useCallback(async (id: string) => {
    const result = await store.toggle(id);
    setSavedIds(result.ids);
    return result;
  }, [store]);
  return { savedIds, toggleSavedWorld };
}
