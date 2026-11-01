import { useEffect, useState } from 'react';
import { parseWinterPreferences, WINTER_STORAGE_KEY } from './winter';

export function useWinterAtmosphere(seasonal: boolean, motion: boolean) {
  const [preferences, setPreferences] = useState(() => {
    try { return parseWinterPreferences(localStorage.getItem(WINTER_STORAGE_KEY)); }
    catch { return parseWinterPreferences(null); }
  });
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    try { localStorage.setItem(WINTER_STORAGE_KEY, JSON.stringify(preferences)); }
    catch { /* Seasonal controls remain usable for this visit. */ }
  }, [preferences]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const refreshMotion = () => setReducedMotion(media.matches);
    const refreshVisibility = () => setVisible(document.visibilityState === 'visible');
    const storage = (event: StorageEvent) => {
      if (event.key === WINTER_STORAGE_KEY || event.key === null) setPreferences(parseWinterPreferences(event.newValue));
    };
    media.addEventListener('change', refreshMotion);
    document.addEventListener('visibilitychange', refreshVisibility);
    window.addEventListener('storage', storage);
    return () => {
      media.removeEventListener('change', refreshMotion);
      document.removeEventListener('visibilitychange', refreshVisibility);
      window.removeEventListener('storage', storage);
    };
  }, []);

  const active = preferences.display === 'on' || (preferences.display === 'auto' && seasonal);
  const motionAllowed = motion && !reducedMotion;
  return { preferences, setPreferences, active, motionAllowed, snowRunning: active && preferences.snow && motionAllowed && visible };
}
