/* TurboUniverse: retain the app shell and last successful project list offline. */
const VERSION = 'v29-collection-order';
const SHELL_CACHE = `turbo-universe-shell-${VERSION}`;
const PROJECT_CACHE = `turbo-universe-projects-${VERSION}`;
let projectRequestSequence = 0;
let newestSuccessfulProjectRequest = 0;
let projectCacheWrites = Promise.resolve();
const SHELL_FILES = [
  '/', '/release.json', '/offline-assets.json', '/manifest.webmanifest', '/favicon.svg', '/icon.svg', '/icon-192.png', '/icon-512.png',
  '/images/cinematic-horizon.webp', '/images/cinematic-nebula.webp',
  '/images/winter-orbit.webp', '/images/winter-orbit-mobile.webp',
  '/images/christmas-forest.webp', '/images/christmas-forest-mobile.webp',
  '/images/earth-hero.webp', '/images/earth-detail.webp', '/images/earth-spring.webp', '/images/earth-winter.webp',
  ...Array.from({ length: 6 }, (_, index) => `/images/space-${String(index + 1).padStart(2, '0')}.webp`),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES);

    // Vite uses content hashes. Precache exactly the assets in this app shell.
    const shell = await cache.match('/');
    const html = await shell.text();
    const assets = [...new Set([...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]))];
    const offlineManifest = await cache.match('/offline-assets.json');
    const deferred = offlineManifest ? (await offlineManifest.json()).assets : [];
    const appAssets = deferred.filter(asset => typeof asset === 'string' && asset.startsWith('/assets/'));
    await cache.addAll([...new Set([...assets, ...appAssets])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // The last collection may have been fetched by the previous worker while
    // this update installed. Carry it forward before retiring that cache.
    try {
      const projects = await caches.open(PROJECT_CACHE);
      if (!(await projects.match('/api/projects'))) {
        for (const key of keys.filter(key => key.startsWith('turbo-universe-projects-') && key !== PROJECT_CACHE).reverse()) {
          const previous = await (await caches.open(key)).match('/api/projects');
          if (previous?.ok) { await projects.put('/api/projects', previous); break; }
        }
      }
    } catch { /* Updating must still work when this device denies storage. */ }
    await Promise.all(keys.filter((key) => key.startsWith('turbo-universe-') && ![SHELL_CACHE, PROJECT_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheResponse(cacheName, request, response) {
  if (response.ok && response.type !== 'opaque') {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    } catch { /* Storage limits must not interrupt a successful live response. */ }
  }
  return response;
}

// Cross-tab fetches can finish out of order. Serialize cache writes and keep
// the newest successful request; a slow older response must not replace it.
async function cacheProjectResponse(request, response, sequence) {
  if (!response.ok) return;
  // A 200 response whose body is interrupted is not a successful snapshot.
  try { await response.clone().arrayBuffer(); } catch { return; }
  newestSuccessfulProjectRequest = Math.max(newestSuccessfulProjectRequest, sequence);
  const pending = projectCacheWrites.then(async () => {
    if (sequence < newestSuccessfulProjectRequest) return;
    await cacheResponse(PROJECT_CACHE, request, response);
  });
  projectCacheWrites = pending.catch(() => {});
  return pending;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // This independent app must never replace the hub's cached navigation shell.
  if (url.pathname === '/interface-foundry' || url.pathname.startsWith('/interface-foundry/')) return;

  if (url.pathname === '/release.json') {
    event.respondWith((async () => {
      try { return await cacheResponse(SHELL_CACHE, request, await fetch(request)); }
      catch { return (await caches.match(request, { cacheName: SHELL_CACHE })) || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }); }
    })());
    return;
  }

  if (url.pathname === '/api/projects') {
    const sequence = ++projectRequestSequence;
    let cacheWrite = Promise.resolve();
    const reply = (async () => {
      try {
        const response = await fetch(request);
        // Keep live responses fast even if an earlier cache write is slow.
        // Validation and server errors are returned directly, never cached.
        cacheWrite = cacheProjectResponse(request, response.clone(), sequence);
        return response;
      } catch {
        const cached = await caches.match(request, { cacheName: PROJECT_CACHE });
        return cached || new Response(JSON.stringify({ error: 'You are offline. Connect to load your projects for the first time.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    })();
    event.respondWith(reply);
    event.waitUntil(reply.then(() => cacheWrite).catch(() => {}));
    return;
  }

  // Mutations, downloads, and every other API call keep their normal network behavior.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
          await cacheResponse(SHELL_CACHE, '/', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/', { cacheName: SHELL_CACHE })) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || SHELL_FILES.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: SHELL_CACHE });
      if (cached) return cached;
      return cacheResponse(SHELL_CACHE, request, await fetch(request));
    })());
  }
});
