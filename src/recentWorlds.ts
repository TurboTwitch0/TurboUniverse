import { canonicalWorldId } from './catalogAliases.ts';

export const RECENT_WORLDS_KEY = 'turbo-universe-recent-worlds';
export const RECENT_WORLDS_LIMIT = 6;

export function parseRecentWorlds(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128).map(canonicalWorldId))].slice(0, RECENT_WORLDS_LIMIT);
  } catch { return []; }
}

export function rememberWorld(ids: string[], id: string): string[] {
  if (!id || id.length > 128) return ids;
  id = canonicalWorldId(id);
  if (ids[0] === id) return ids;
  return [id, ...ids.filter(item => item !== id)].slice(0, RECENT_WORLDS_LIMIT);
}

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Exclusive = <T>(action: () => T) => Promise<T>;

/** Refresh device history before applying each queued visit. */
export function createRecentWorldStore(getStorage: () => StorageAdapter, exclusive: Exclusive = async action => action()) {
  let ids: string[] = [];
  let visitOnly = false;
  let queue = Promise.resolve();

  const read = () => {
    if (!visitOnly) {
      try { ids = parseRecentWorlds(getStorage().getItem(RECENT_WORLDS_KEY)); }
      catch { visitOnly = true; }
    }
    return [...ids];
  };
  read();

  const update = (operation: (latest: string[]) => string[]) => {
    const result = queue.then(() => exclusive(() => {
      const latest = read();
      ids = operation(latest);
      if (!visitOnly && JSON.stringify(ids) !== JSON.stringify(latest)) {
        try {
          if (ids.length) getStorage().setItem(RECENT_WORLDS_KEY, JSON.stringify(ids));
          else getStorage().removeItem(RECENT_WORLDS_KEY);
        } catch {
          // Never write unreconciled visit-only history over another tab later.
          visitOnly = true;
        }
      }
      return [...ids];
    }));
    queue = result.then(() => {}, () => {});
    return result;
  };

  return {
    snapshot: () => [...ids],
    sync: read,
    record: (id: string) => update(latest => rememberWorld(latest, id)),
    clear: () => update(() => []),
  };
}
