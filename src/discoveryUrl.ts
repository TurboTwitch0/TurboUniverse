import type { DiscoverySort } from './discovery';

export type DiscoveryFilter = 'all' | 'website' | 'app' | 'saved';
export type DiscoveryState = {
  filter: DiscoveryFilter;
  search: string;
  category: string;
  sort: DiscoverySort;
};

const filters: readonly string[] = ['all', 'website', 'app', 'saved'];
const sorts: readonly string[] = ['original', 'az', 'newest', 'featured'];

/** Normalize shared addresses without requiring a category to exist in the catalog. */
export function normalizeDiscoveryState(state: { filter: string; search: string; category: string; sort: string }): DiscoveryState {
  return {
    filter: filters.includes(state.filter) ? state.filter as DiscoveryFilter : 'all',
    search: state.search.trim().slice(0, 200),
    category: state.category.trim().slice(0, 100) || 'all',
    sort: sorts.includes(state.sort) ? state.sort as DiscoverySort : 'original',
  };
}

export function readDiscoveryState(address: string | URL): DiscoveryState {
  const params = new URL(address).searchParams;
  return normalizeDiscoveryState({
    filter: params.get('type') ?? 'all',
    search: params.get('q') ?? '',
    category: params.get('category') ?? 'all',
    sort: params.get('sort') ?? 'original',
  });
}

/** Change only discovery parameters, retaining world links, campaigns, and anchors. */
export function urlForDiscoveryState(address: string | URL, state: DiscoveryState): URL {
  const url = new URL(address);
  const normalized = normalizeDiscoveryState(state);
  const values = {
    q: normalized.search,
    type: normalized.filter === 'all' ? '' : normalized.filter,
    category: normalized.category === 'all' ? '' : normalized.category,
    sort: normalized.sort === 'original' ? '' : normalized.sort,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url;
}
