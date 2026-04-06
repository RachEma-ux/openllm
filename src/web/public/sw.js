// OpenLLM Service Worker — minimal, safe, self-healing
const CACHE_NAME = 'openllm-v7';
const STATIC_ASSETS = ['/favicon.svg', '/manifest.json', '/icon-192.svg', '/icon-512.svg'];

// Install: cache only static assets, activate immediately
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => null)
    )
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches + take control immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Allow UI to force activation
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch: ONLY cache static asset paths, let EVERYTHING else pass through
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip all non-GET and cross-origin
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Skip WebSocket, API, and HTML (let network handle)
  if (url.pathname.startsWith('/ws')) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/' || url.pathname.endsWith('.html')) return;

  // Only intercept the known static assets
  const isStatic = STATIC_ASSETS.some((p) => url.pathname === p);
  if (!isStatic) return;

  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('', { status: 503 }))
    )
  );
});
