/* Al-Rahma Academy — Service Worker
   Strategy: Network-first for API; Cache-first for static assets.
   Version bump clears the old cache. */

const CACHE = 'alrahma-v1';

const STATIC_PRECACHE = [
  '/',
  '/tools/quran-reader',
  '/tools/prayer-times',
  '/tools/adhkar',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API calls: network-first, no cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(request).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
