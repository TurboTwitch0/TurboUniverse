import test from 'node:test';
import assert from 'node:assert/strict';
import { getRelatedWorlds } from '../src/relatedWorlds.ts';

test('recommendations prioritize the current category, then curated worlds without modifying the catalog', () => {
  const projects = [
    { id: 'current', title: 'Study', category: 'Learning' },
    { id: 'featured', title: 'Chat', category: 'Community', featured: true },
    { id: 'unrelated', title: 'Games', category: 'Gaming' },
    { id: 'first', title: 'Practice', category: 'Learning' },
    { id: 'pending', title: 'Preview', category: 'Learning', featured: true, status: 'setup-pending' },
    { id: 'second', title: 'Discover', category: 'Learning', featured: true },
  ];
  const before = structuredClone(projects);
  assert.deepEqual(getRelatedWorlds(projects, 'current').map(project => project.id), ['first', 'second', 'featured']);
  assert.deepEqual(projects, before);
});

test('recommendations stay unique and stop at three public destinations', () => {
  const projects = ['a', 'a', 'b', 'c', 'd'].map(id => ({ id, title: id, category: 'Tools', featured: true }));
  assert.deepEqual(getRelatedWorlds(projects, 'missing').map(project => project.id), ['a', 'b', 'c']);
});

test('empty, isolated, and pending-only collections have no fabricated recommendations', () => {
  assert.deepEqual(getRelatedWorlds([], 'missing'), []);
  const current = { id: 'current', title: 'Solo', category: 'Tools', featured: true };
  assert.deepEqual(getRelatedWorlds([current, { id: 'pending', title: 'Preview', category: 'Tools', featured: true, status: 'setup-pending' }], 'current'), []);
  assert.deepEqual(getRelatedWorlds([{ id: 'other', title: 'Other', category: 'Community' }], 'missing'), []);
});
