export type ThemeMode = 'earth' | 'space';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type AppearancePreferences = {
  mode: ThemeMode;
  scheme: 'light' | 'dark';
  palette: 'classic' | 'seasonal';
  artwork: 'monochrome' | 'color';
  season: 'auto' | Season;
  hemisphere: 'north' | 'south';
  motion: boolean;
};

export const APPEARANCE_STORAGE_KEY = 'turbo-universe-appearance';
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter',
};
export const DEFAULT_APPEARANCE: AppearancePreferences = {
  mode: 'space', scheme: 'light', palette: 'classic', artwork: 'monochrome', season: 'auto', hemisphere: 'north', motion: true,
};

/** Meteorological seasons follow the visitor's local calendar. */
export function seasonForDate(date: Date, hemisphere: 'north' | 'south' = 'north'): Season {
  const month = date.getMonth();
  if (!Number.isFinite(month)) return 'winter';
  const north = month >= 2 && month <= 4 ? 'spring'
    : month >= 5 && month <= 7 ? 'summer'
    : month >= 8 && month <= 10 ? 'autumn' : 'winter';
  if (hemisphere === 'north') return north;
  return ({ spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' } as const)[north];
}

export function resolveSeason(preferences: Pick<AppearancePreferences, 'season' | 'hemisphere'>, date = new Date()): Season {
  return preferences.season === 'auto' ? seasonForDate(date, preferences.hemisphere) : preferences.season;
}

export function parseAppearancePreferences(raw: string | null, reducedMotion = false): AppearancePreferences {
  const defaults = { ...DEFAULT_APPEARANCE, motion: !reducedMotion };
  if (!raw) return defaults;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
    const saved = value as Record<string, unknown>;
    return {
      mode: saved.scheme !== undefined && (saved.mode === 'earth' || saved.mode === 'space') ? saved.mode : defaults.mode,
      scheme: saved.scheme === 'dark' || saved.scheme === 'light' ? saved.scheme : defaults.scheme,
      palette: saved.palette === 'seasonal' || saved.palette === 'classic' ? saved.palette : defaults.palette,
      artwork: saved.artwork === 'color' || saved.artwork === 'monochrome' ? saved.artwork : defaults.artwork,
      season: saved.season === 'auto' || SEASONS.includes(saved.season as Season) ? saved.season as 'auto' | Season : defaults.season,
      hemisphere: saved.hemisphere === 'north' || saved.hemisphere === 'south' ? saved.hemisphere : defaults.hemisphere,
      motion: typeof saved.motion === 'boolean' ? saved.motion : defaults.motion,
    };
  } catch { return defaults; }
}
