import type { AppearancePreferences } from './theme';

export type WinterPreferences = { display: 'auto' | 'on' | 'off'; snow: boolean };
export const WINTER_STORAGE_KEY = 'turbo-universe-winter';
export const DEFAULT_WINTER: WinterPreferences = { display: 'auto', snow: true };

export function parseWinterPreferences(raw: string | null): WinterPreferences {
  try {
    const value: unknown = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_WINTER };
    const saved = value as Record<string, unknown>;
    return {
      display: saved.display === 'on' || saved.display === 'off' ? saved.display : 'auto',
      snow: typeof saved.snow === 'boolean' ? saved.snow : true,
    };
  } catch { return { ...DEFAULT_WINTER }; }
}

/** The winter edition starts a month early; explicit season previews take priority. */
export function isWinterSeason(preferences: Pick<AppearancePreferences, 'season' | 'hemisphere'>, date: Date): boolean {
  if (preferences.season !== 'auto') return preferences.season === 'winter';
  const month = date.getMonth();
  return preferences.hemisphere === 'south' ? month >= 4 && month <= 7 : month === 10 || month === 11 || month === 0 || month === 1;
}
