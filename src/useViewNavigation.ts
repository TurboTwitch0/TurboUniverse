import { useCallback, useEffect, useState } from 'react';
import { VIEWS, urlForView, viewFromHash, type View } from './navigation';

/** Keep real browser addresses and history in step with the visible section. */
export function useViewNavigation() {
  const [view, setCurrent] = useState<View>(() => viewFromHash(window.location.hash) ?? 'universe');

  useEffect(() => {
    const restore = () => {
      const saved = window.history.state?.turboView;
      setCurrent(viewFromHash(window.location.hash) ?? (VIEWS.includes(saved) ? saved : 'universe'));
    };
    const anchor = () => {
      const next = viewFromHash(window.location.hash);
      // Skip links and document anchors move focus without leaving the section.
      if (next) setCurrent(next);
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', anchor);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', anchor);
    };
  }, []);

  const navigate = useCallback((next: View) => {
    const url = urlForView(window.location.href, next);
    if (url.href !== window.location.href) {
      const state = window.history.state;
      try { window.history.pushState({ ...(state && typeof state === 'object' ? state : {}), turboView: next }, '', url); }
      catch { /* Navigation remains usable if a browser restricts history. */ }
    }
    setCurrent(next);
  }, []);

  useEffect(() => {
    const labels = { universe: 'One mind. Many worlds.', story: 'The story', collection: 'My collection', ai: 'AI studio', chromebooks: 'AI (Chromebooks)' };
    document.title = `TurboUniverse — ${labels[view]}`;
  }, [view]);

  return [view, navigate] as const;
}
