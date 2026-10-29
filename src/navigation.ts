export const VIEWS = ['universe', 'story', 'collection', 'ai', 'chromebooks'] as const;
export type View = typeof VIEWS[number];

export function viewFromHash(hash: string): View | undefined {
  if (!hash || hash === '#universe') return 'universe';
  const value = hash.slice(1);
  return VIEWS.includes(value as View) ? value as View : undefined;
}

export function urlForView(address: string, view: View): URL {
  const url = new URL(address);
  url.hash = view === 'universe' ? '' : view;
  return url;
}
