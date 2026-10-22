import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverProjects } from '../src/discovery.ts';

const worlds = [
  { id: 'play', title: 'TurboGames', description: 'Find a new adventure.', category: 'Gaming', type: 'website', featured: false, createdAt: '2026-01-02' },
  { id: 'study', title: 'Orbit Study', description: 'A focused space for curiosity.', category: 'Learning', type: 'app', featured: true, createdAt: '2026-02-01' },
  { id: 'cafe', title: 'Café 2', description: 'A curious community.', category: 'Community', type: 'website', featured: true, createdAt: 'invalid' },
];
const options = { filter: 'all', category: 'all', search: '', sort: 'original', savedIds: [] };

test('discovery combines all search words across fields and ignores accents, case, and extra spaces', () => {
  assert.deepEqual(discoverProjects(worlds, { ...options, search: '  TURBO adventure ' }).map(p => p.id), ['play']);
  assert.deepEqual(discoverProjects(worlds, { ...options, search: 'cafe community' }).map(p => p.id), ['cafe']);
  assert.equal(discoverProjects(worlds, { ...options, search: 'adventure learning' }).length, 0);
});

test('type, category, and saved filters narrow the same collection together', () => {
  assert.deepEqual(discoverProjects(worlds, { ...options, filter: 'saved', category: 'Learning', savedIds: ['play', 'study'] }).map(p => p.id), ['study']);
  assert.equal(discoverProjects(worlds, { ...options, filter: 'website', category: 'Learning' }).length, 0);
  assert.equal(discoverProjects(worlds, { ...options, filter: 'saved' }).length, 0);
});

test('sort modes are stable, handle missing dates, and preserve the source collection', () => {
  const original = worlds.map(p => p.id);
  assert.deepEqual(discoverProjects(worlds, { ...options, sort: 'newest' }).map(p => p.id), ['study', 'play', 'cafe']);
  assert.deepEqual(discoverProjects(worlds, { ...options, sort: 'featured' }).map(p => p.id), ['study', 'cafe', 'play']);
  assert.deepEqual(discoverProjects(worlds, { ...options, sort: 'az' }).map(p => p.id), ['cafe', 'study', 'play']);
  assert.deepEqual(worlds.map(p => p.id), original);
  assert.deepEqual(discoverProjects(worlds, options).map(p => p.id), original);
});
