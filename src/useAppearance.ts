import { useEffect, useLayoutEffect, useState } from 'react';
import { APPEARANCE_STORAGE_KEY, parseAppearancePreferences, resolveSeason, SEASON_LABELS, type AppearancePreferences } from './theme';

function readPreferences(): AppearancePreferences {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { return parseAppearancePreferences(localStorage.getItem(APPEARANCE_STORAGE_KEY), reduced); }
  catch { return parseAppearancePreferences(null, reduced); }
}

export function useAppearance() {
  const [preferences, setPreferences] = useState<AppearancePreferences>(readPreferences);
  const [now, setNow] = useState(() => new Date());
  const season = resolveSeason(preferences, now);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = preferences.mode;
    root.dataset.season = season;
    root.dataset.motion = preferences.motion ? 'on' : 'off';
    const color = getComputedStyle(root).getPropertyValue('--theme-background').trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [preferences.mode, preferences.motion, season]);

  useEffect(() => {
    try { localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences)); }
    catch { /* Appearance stays usable when browser storage is unavailable. */ }
  }, [preferences]);

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const storage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY) {
        setPreferences(parseAppearancePreferences(event.newValue, window.matchMedia('(prefers-reduced-motion: reduce)').matches));
      }
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('storage', storage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('storage', storage);
    };
  }, []);

  return { preferences, setPreferences, season, seasonLabel: SEASON_LABELS[season] };
}
