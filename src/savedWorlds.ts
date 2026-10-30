import { canonicalWorldId } from './catalogAliases.ts';

export const SAVED_WORLDS_KEY = 'turbo-universe-saved-worlds';
export const MAX_SAVED_WORLDS = 1000;
type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>;
type Exclusive = <T>(action: () => T) => Promise<T>;

export function parseSavedWorlds(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string =>
      typeof id === 'string' && id.length > 0 && id.length <= 128).map(canonicalWorldId))].slice(0, MAX_SAVED_WORLDS) : [];
  } catch { return []; }
}

/** Refresh before editing so an older tab cannot replace newer favorites. */
export function createSavedWorldStore(getStorage: () => StorageAdapter, exclusive: Exclusive = async action => action()) {
  let ids: string[] = [];
  const pending = new Map<string, boolean>();
  let queue = Promise.resolve();

  const refresh = () => {
    try {
      const next = new Set(parseSavedWorlds(getStorage().getItem(SAVED_WORLDS_KEY)));
      for (const [id, saved] of pending) { if (saved) next.add(id); else next.delete(id); }
      ids = [...next];
      return true;
    } catch { return false; }
  };
  refresh();

  return {
    snapshot: () => [...ids],
    sync: () => { refresh(); return [...ids]; },
    toggle(id: string) {
      const result = queue.then(() => exclusive(() => {
        const key = canonicalWorldId(id);
        const saving = !ids.includes(key);
        const readable = refresh();
        const next = new Set(ids);
        if (saving && !next.has(key) && next.size >= MAX_SAVED_WORLDS) {
          return { ids: [...ids], saved: false, persisted: false, full: true };
        }
        if (saving) next.add(key); else next.delete(key);
        ids = [...next];
        pending.set(key, saving);
        let persisted = false;
        if (readable) {
          try {
            getStorage().setItem(SAVED_WORLDS_KEY, JSON.stringify(ids));
            pending.clear();
            persisted = true;
          } catch { /* Keep visit-only changes until storage is available again. */ }
        }
        return { ids: [...ids], saved: saving, persisted, full: false };
      }));
      queue = result.then(() => {}, () => {});
      return result;
    },
  };
}
