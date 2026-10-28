import test from 'node:test';
import assert from 'node:assert/strict';
import { urlForView, viewFromHash } from '../src/navigation.ts';

test('direct section links resolve without treating document anchors as pages', () => {
  for (const view of ['story', 'collection', 'ai', 'universe']) assert.equal(viewFromHash(`#${view}`), view);
  assert.equal(viewFromHash(''), 'universe');
  for (const hash of ['#main-content', '#projects', '#unknown', '#%ZZ']) assert.equal(viewFromHash(hash), undefined);
});

test('section navigation preserves project and campaign parameters and uses the current origin', () => {
  const current = 'https://example.com/hub/?world=existing&campaign=visit#story';
  const ai = urlForView(current, 'ai');
  assert.equal(ai.href, 'https://example.com/hub/?world=existing&campaign=visit#ai');
  assert.equal(urlForView(ai.href, 'universe').href, 'https://example.com/hub/?world=existing&campaign=visit');
});
