import test from 'node:test';
import assert from 'node:assert/strict';
import { readDiscoveryState, urlForDiscoveryState } from '../src/discoveryUrl.ts';

const defaults = { filter: 'all', search: '', category: 'all', sort: 'original' };

test('missing, invalid, and explicit defaults produce clean discovery addresses', () => {
  assert.deepEqual(readDiscoveryState('https://turbo.test/'), defaults);
  const address = 'https://turbo.test/?type=unknown&sort=fast&q=+%20&category=+%20#collection';
  assert.deepEqual(readDiscoveryState(address), defaults);
  assert.equal(urlForDiscoveryState(address, readDiscoveryState(address)).href, 'https://turbo.test/#collection');
  assert.equal(urlForDiscoveryState('https://turbo.test/?type=all&category=all&sort=original', defaults).search, '');
});

test('shared text trims outer whitespace and bounds URL input', () => {
  const url = new URL('https://turbo.test/');
  url.searchParams.set('q', `  ${'x'.repeat(220)}  `);
  url.searchParams.set('category', `  ${'c'.repeat(120)}  `);
  const state = readDiscoveryState(url);
  assert.equal(state.search, 'x'.repeat(200));
  assert.equal(state.category, 'c'.repeat(100));
  assert.equal(readDiscoveryState('https://turbo.test/?q=++two+++words++').search, 'two   words');
});

test('discovery updates preserve world links, campaign parameters, and the hash', () => {
  const address = 'https://turbo.test/explore?world=orbit&campaign=autumn&campaign=launch&q=old#collection';
  const url = urlForDiscoveryState(address, { ...defaults, filter: 'saved', search: 'new' });
  assert.deepEqual(url.searchParams.getAll('campaign'), ['autumn', 'launch']);
  assert.equal(url.searchParams.get('world'), 'orbit');
  assert.equal(url.hash, '#collection');
  assert.equal(url.pathname, '/explore');
  assert.equal(new URL(address).searchParams.get('q'), 'old');
});

test('all supported filters and sort modes round-trip encoded discovery text', () => {
  for (const filter of ['all', 'website', 'app', 'saved']) {
    for (const sort of ['original', 'az', 'newest', 'featured']) {
      const state = { filter, sort, search: 'café + games & learning', category: 'Art / Design' };
      const url = urlForDiscoveryState('https://turbo.test/#collection', state);
      assert.deepEqual(readDiscoveryState(url), state);
      assert.equal(url.searchParams.get('q'), state.search);
      assert.ok(!url.href.includes('q=café'));
    }
  }
});
