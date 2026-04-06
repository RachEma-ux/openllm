const CACHE_NAME = 'openllm-v5';
const STATIC_ASSETS = ['/favicon.svg', '/manifest.json', '/icon-192.svg', '/icon-512.svg'];

// Install: cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Allow UI to force activation
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML + API, cache-first for assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip WebSocket and non-GET
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/ws')) return;

  // Only handle same-origin requests (skip CDN scripts, etc.)
  if (url.origin !== self.location.origin) return;

  // API and HTML (index): always network-first, fall back to cache only if offline
  if (url.pathname.startsWith('/api/') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request) || caches.match('/'))
    );
    return;
  }

  // Static assets: cache-first, update in background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
