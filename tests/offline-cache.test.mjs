import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function collection(id) {
  return { projects: [{ id, title: id, type: 'website', url: 'https://example.com/', description: 'A test world.', category: 'Tools', year: 2026, featured: false, createdAt: '2026-11-21T00:00:00.000Z' }] };
}

function cacheResponseWith(caches) {
  const context = vm.createContext({ self: { addEventListener() {} }, caches, Response, URL });
  vm.runInContext(source, context);
  return context.cacheResponse;
}

test('a successful live catalog remains readable when offline storage is full', async () => {
  const response = new Response(JSON.stringify(collection('new-world')));
  const cacheResponse = cacheResponseWith({
    open: async () => ({ put: async () => { throw new DOMException('Storage is full.', 'QuotaExceededError'); } }),
  });
  const delivered = await cacheResponse('shell', '/api/projects', response);
  assert.equal(delivered, response);
  assert.deepEqual(await delivered.json(), collection('new-world'));
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
      return { match: async request => store.get(request)?.clone(), put: async (request, response) => store.set(request, response.clone()), delete: async request => store.delete(request) };
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
    ['turbo-universe-projects-older', collection('older-world')],
    ['turbo-universe-projects-previous', collection('saved-world')],
    ['turbo-universe-shell-previous', null],
    ['another-app-cache', null],
  ]);
  assert.deepEqual(await projects.json(), collection('saved-world'));
  assert.equal(stores.has('turbo-universe-projects-previous'), false);
  assert.equal(stores.has('turbo-universe-shell-previous'), false);
  assert.equal(stores.has('another-app-cache'), true);
  assert.equal(claimed, true);
});

test('a worker upgrade keeps a newer collection already stored by the current worker', async () => {
  const current = source.match(/const VERSION = '([^']+)'/)[1];
  const { projects } = await activateWorker([
    ['turbo-universe-projects-previous', collection('old-world')],
    [`turbo-universe-projects-${current}`, collection('new-world')],
  ]);
  assert.deepEqual(await projects.json(), collection('new-world'));
});

function catalogFetchHarness(beforePut = async () => {}) {
  const handlers = {};
  const pending = [];
  let stored;
  const context = vm.createContext({
    self: { location: { origin: 'https://universe.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    URL, Request, Response,
    fetch: () => new Promise((resolve, reject) => { pending.push({ resolve, reject }); }),
    caches: {
      open: async () => ({ put: async (_request, response) => { await beforePut(response); stored = response.clone(); } }),
      match: async () => stored?.clone(),
    },
  });
  vm.runInContext(source, context);
  return {
    pending,
    request() {
      let reply;
      let lifetime;
      handlers.fetch({
        request: new Request('https://universe.test/api/projects'),
        respondWith: promise => { reply = promise; },
        waitUntil: promise => { lifetime = promise; },
      });
      return { reply, lifetime };
    },
    cached: async () => stored ? stored.clone().json() : null,
  };
}

test('a late older tab response cannot replace the newer offline collection', async () => {
  const h = catalogFetchHarness();
  const older = h.request();
  const newer = h.request();
  h.pending[1].resolve(Response.json(collection('new-world')));
  await newer.lifetime;
  h.pending[0].resolve(Response.json(collection('old-world')));
  await older.lifetime;
  assert.equal((await h.cached()).projects[0].id, 'new-world');
});

test('a newer server error does not discard a valid pending collection response', async () => {
  const h = catalogFetchHarness();
  const older = h.request();
  const newer = h.request();
  h.pending[1].resolve(Response.json({ error: 'Unavailable' }, { status: 503 }));
  assert.equal((await newer.reply).status, 503);
  await newer.lifetime;
  assert.equal(await h.cached(), null);
  h.pending[0].resolve(Response.json(collection('available-world')));
  await older.lifetime;
  assert.equal((await h.cached()).projects[0].id, 'available-world');
});

test('slow cache writes do not delay live collections and cannot commit in reverse order', { timeout: 3000 }, async () => {
  let release;
  let started;
  const blocked = new Promise(resolve => { release = resolve; });
  const putting = new Promise(resolve => { started = resolve; });
  const h = catalogFetchHarness(async response => {
    if ((await response.clone().json()).projects[0].id === 'old-world') { started(); await blocked; }
  });
  const older = h.request();
  h.pending[0].resolve(Response.json(collection('old-world')));
  await putting;
  const newer = h.request();
  h.pending[1].resolve(Response.json(collection('new-world')));
  try {
    assert.equal((await (await newer.reply).json()).projects[0].id, 'new-world');
    let cached = false;
    void newer.lifetime.then(() => { cached = true; });
    await Promise.resolve();
    assert.equal(cached, false, 'live data is delivered while the older cache write is still pending');
  } finally { release(); }
  await Promise.all([older.lifetime, newer.lifetime]);
  assert.equal((await h.cached()).projects[0].id, 'new-world');
});

test('catalog response and worker lifetime remain successful when cache writes are denied', async () => {
  const h = catalogFetchHarness(async () => { throw new Error('Storage denied'); });
  const request = h.request();
  h.pending[0].resolve(Response.json(collection('live-world')));
  assert.equal((await (await request.reply).json()).projects[0].id, 'live-world');
  await request.lifetime;
  assert.equal(await h.cached(), null);
});

test('a newer interrupted body cannot suppress an older complete collection', async () => {
  const h = catalogFetchHarness();
  const older = h.request();
  const newer = h.request();
  h.pending[1].resolve(new Response(new ReadableStream({ start(controller) { controller.error(new Error('Body failed')); } })));
  await newer.lifetime;
  await assert.rejects((await newer.reply).text(), /Body failed/);
  h.pending[0].resolve(Response.json(collection('complete-world')));
  await older.lifetime;
  assert.equal((await h.cached()).projects[0].id, 'complete-world');
});

test('malformed 200 responses cannot replace a usable offline collection', async () => {
  const h = catalogFetchHarness();
  const good = h.request();
  h.pending.at(-1).resolve(Response.json(collection('saved-world')));
  await good.lifetime;
  const invalid = [
    '<html>Temporary gateway page</html>', '{broken', '[]', '{}',
    JSON.stringify({ projects: {} }), JSON.stringify({ projects: [null] }),
    JSON.stringify({ projects: [{ id: 'partial-world' }] }),
    JSON.stringify({ projects: [{ ...collection('bad-title').projects[0], title: 7 }] }),
    JSON.stringify({ projects: [...collection('duplicate').projects, ...collection('duplicate').projects] }),
  ];
  for (const body of invalid) {
    const request = h.request();
    h.pending.at(-1).resolve(new Response(body, { status: 200 }));
    assert.equal(await (await request.reply).text(), body, 'The original response still reaches the online app');
    await request.lifetime;
    assert.equal((await h.cached()).projects[0].id, 'saved-world');
  }
});

test('an invalid newer payload cannot suppress an older pending valid collection', async () => {
  const h = catalogFetchHarness();
  const older = h.request();
  const newer = h.request();
  h.pending[1].resolve(Response.json({ projects: [{ id: 'incomplete' }] }));
  await newer.lifetime;
  assert.equal(await h.cached(), null);
  h.pending[0].resolve(Response.json(collection('complete-world')));
  await older.lifetime;
  assert.equal((await h.cached()).projects[0].id, 'complete-world');
});

test('upgrade ignores poisoned current and previous snapshots and migrates the last valid collection', async () => {
  const current = source.match(/const VERSION = '([^']+)'/)[1];
  const { projects, stores } = await activateWorker([
    ['turbo-universe-projects-older', collection('valid-world')],
    ['turbo-universe-projects-previous', { projects: [{ id: 'incomplete' }] }],
    [`turbo-universe-projects-${current}`, { projects: 'invalid' }],
    ['another-app-cache', null],
  ]);
  assert.equal((await projects.json()).projects[0].id, 'valid-world');
  assert.equal(stores.has('turbo-universe-projects-previous'), false);
  assert.equal(stores.has('another-app-cache'), true);
});

test('an intentionally empty collection is valid and replaces older offline worlds', async () => {
  const h = catalogFetchHarness();
  const previous = h.request();
  h.pending.at(-1).resolve(Response.json(collection('removed-world')));
  await previous.lifetime;
  const empty = h.request();
  h.pending.at(-1).resolve(Response.json({ projects: [] }));
  await empty.lifetime;
  assert.deepEqual(await h.cached(), { projects: [] });
});
