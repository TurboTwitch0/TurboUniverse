import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function cacheResponseWith(caches) {
  const context = vm.createContext({ self: { addEventListener() {} }, caches, Response, URL });
  vm.runInContext(source, context);
  return context.cacheResponse;
}

test('a successful live catalog remains readable when offline storage is full', async () => {
  const response = new Response(JSON.stringify({ projects: [{ id: 'new-world' }] }));
  const cacheResponse = cacheResponseWith({
    open: async () => ({ put: async () => { throw new DOMException('Storage is full.', 'QuotaExceededError'); } }),
  });
  const delivered = await cacheResponse('shell', '/api/projects', response);
  assert.equal(delivered, response);
  assert.deepEqual(await delivered.json(), { projects: [{ id: 'new-world' }] });
});

test('successful live data also survives an unavailable cache API', async () => {
  const response = new Response('Live content');
  const cacheResponse = cacheResponseWith({ open: async () => { throw new Error('Storage denied'); } });
  assert.equal(await (await cacheResponse('shell', '/', response)).text(), 'Live content');
});

async function activateWorker(initialCaches) {
  const handlers = {};
  const stores = new Map(initialCaches.map(([key, projects]) => [key, new Map(projects ? [['/api/projects', new Response(JSON.stringify(projects))]] : [])]));
  const caches = {
    keys: async () => [...stores.keys()],
    open: async key => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return { match: async request => store.get(request)?.clone(), put: async (request, response) => store.set(request, response.clone()) };
    },
    delete: async key => stores.delete(key),
  };
  let claimed = false;
  const context = vm.createContext({ self: { addEventListener: (name, handler) => { handlers[name] = handler; }, clients: { claim: async () => { claimed = true; } } }, caches, Response, URL });
  vm.runInContext(source, context);
  let activation;
  handlers.activate({ waitUntil: promise => { activation = promise; } });
  await activation;
  const name = vm.runInContext('PROJECT_CACHE', context);
  return { stores, projects: await (await caches.open(name)).match('/api/projects'), claimed };
}

test('a service worker update preserves the last offline collection before retiring old caches', async () => {
  const { projects, stores, claimed } = await activateWorker([
    ['turbo-universe-projects-older', { projects: [{ id: 'older-world' }] }],
    ['turbo-universe-projects-previous', { projects: [{ id: 'saved-world' }] }],
    ['turbo-universe-shell-previous', null],
    ['another-app-cache', null],
  ]);
  assert.deepEqual(await projects.json(), { projects: [{ id: 'saved-world' }] });
  assert.equal(stores.has('turbo-universe-projects-previous'), false);
  assert.equal(stores.has('turbo-universe-shell-previous'), false);
  assert.equal(stores.has('another-app-cache'), true);
  assert.equal(claimed, true);
});

test('a worker upgrade keeps a newer collection already stored by the current worker', async () => {
  const current = source.match(/const VERSION = '([^']+)'/)[1];
  const { projects } = await activateWorker([
    ['turbo-universe-projects-previous', { projects: [{ id: 'old-world' }] }],
    [`turbo-universe-projects-${current}`, { projects: [{ id: 'new-world' }] }],
  ]);
  assert.deepEqual(await projects.json(), { projects: [{ id: 'new-world' }] });
});
