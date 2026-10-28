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
  if (!id || id.length > 128 || ids[0] === id) return ids;
  return [id, ...ids.filter(item => item !== id)].slice(0, RECENT_WORLDS_LIMIT);
}
import { canonicalWorldId } from './catalogAliases.ts';
