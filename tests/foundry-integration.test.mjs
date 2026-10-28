import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
test('Foundry source is pinned to the reviewed public revision with hosting identity excluded', async () => {
  const pinned = JSON.parse(await readFile(new URL('vendor/interface-foundry.upstream.json', root), 'utf8'));
  assert.equal(pinned.commit, '56ca9eec9a12136e78ab8b44aaf24947c0fe634a');
  assert.equal(pinned.visibilityAtReview, 'public');
  assert.equal(pinned.license, 'MIT');
  assert.equal(pinned.files.length, 44);
  assert.ok(!pinned.files.some(file => file.path.startsWith('.openai/') || /node_modules|(?:^|\/)\.git\//.test(file.path)));
  for (const file of pinned.files) {
    const location = new URL(`vendor/interface-foundry/${file.path}`, root);
    assert.equal((await lstat(location)).isSymbolicLink(), false);
    assert.equal(createHash('sha256').update(await readFile(location)).digest('hex'), file.sha256, file.path);
  }
});

test('hub SPA routing excludes the sub-app namespace and retains its trailing-slash entry', async () => {
  const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  assert.ok(config.redirects.some(route => route.source === '/interface-foundry' && route.destination === '/interface-foundry/'));
  assert.ok(config.rewrites.some(route => route.source === '/interface-foundry/' && route.destination === '/interface-foundry/index.html'));
  const fallback = config.rewrites.find(route => route.destination === '/index.html');
  const pattern = new RegExp(`^${fallback.source}$`);
  for (const value of ['/interface-foundry', '/interface-foundry/', '/interface-foundry/data/skills.json', '/interface-foundry/assets/missing.js']) assert.equal(pattern.test(value), false, value);
  for (const value of ['/', '/collection', '/interface-foundry-other']) assert.equal(pattern.test(value), true, value);
});

test('Foundry navigations and files bypass the hub service worker without poisoning the offline shell', async () => {
  const handlers = new Map();
  const writes = [];
  const self = { location: { origin: 'https://turbouniverse.vercel.app' }, addEventListener: (name, callback) => handlers.set(name, callback) };
  runInNewContext(await readFile(new URL('public/sw.js', root), 'utf8'), {
    self, URL, Response, fetch: async () => new Response('TurboUniverse shell', { headers: { 'content-type': 'text/html' } }),
    caches: { open: async () => ({ put: async (key) => writes.push(key) }) },
  });
  const handler = handlers.get('fetch');
  let intercepted = 0;
  for (const pathname of ['/interface-foundry', '/interface-foundry/', '/interface-foundry/data/skills.json', '/interface-foundry/downloads/interface-foundry-toolkit.zip']) {
    handler({ request: { method: 'GET', url: self.location.origin + pathname, mode: 'navigate' }, respondWith: () => intercepted++ });
  }
  assert.equal(intercepted, 0);
  assert.deepEqual(writes, []);
  let response;
  handler({ request: { method: 'GET', url: self.location.origin + '/', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'TurboUniverse shell');
  assert.deepEqual(writes, ['/']);
});
