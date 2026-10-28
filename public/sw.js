/* TurboUniverse: retain the app shell and last successful project list offline. */
const VERSION = 'v9-local-ai-launchpad';
const SHELL_CACHE = `turbo-universe-shell-${VERSION}`;
const PROJECT_CACHE = `turbo-universe-projects-${VERSION}`;
const SHELL_FILES = [
  '/', '/release.json', '/manifest.webmanifest', '/favicon.svg', '/icon.svg', '/icon-192.png', '/icon-512.png',
  '/images/cinematic-horizon.webp', '/images/cinematic-nebula.webp',
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
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('turbo-universe-') && ![SHELL_CACHE, PROJECT_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheResponse(cacheName, request, response) {
  if (response.ok && response.type !== 'opaque') {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname === '/release.json') {
    event.respondWith((async () => {
      try { return await cacheResponse(SHELL_CACHE, request, await fetch(request)); }
      catch { return (await caches.match(request, { cacheName: SHELL_CACHE })) || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }); }
    })());
    return;
  }

  if (url.pathname === '/api/projects') {
    event.respondWith((async () => {
      try {
        // Validation and server errors are returned directly, never cached.
        return await cacheResponse(PROJECT_CACHE, request, await fetch(request));
      } catch {
        const cached = await caches.match(request, { cacheName: PROJECT_CACHE });
        return cached || new Response(JSON.stringify({ error: 'You are offline. Connect to load your projects for the first time.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    })());
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
