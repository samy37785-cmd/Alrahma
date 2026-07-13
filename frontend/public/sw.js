/* Al-Rahma Academy — Service Worker
   Strategy: Network-first for API and HTML; Cache-first for truly static assets
   (fonts, images, versioned JS/CSS chunks).
   IMPORTANT: bump CACHE version on every deployment to clear stale caches. */

const CACHE = 'alrahma-v2';

// Only precache assets that never change between deployments.
// HTML (including '/') must NOT be precached — Vite embeds new chunk hashes in
// each build, so serving a cached HTML with old chunk names causes 404s.
const STATIC_PRECACHE = [
  '/manifest.json',
  '/favicon.svg',
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

  // HTML documents: always network-first so the latest index.html is served.
  // A cached HTML pointing to old Vite chunk hashes is the #1 cause of mobile crashes.
  const isHtml = request.headers.get('accept')?.includes('text/html');
  if (isHtml || !url.pathname.includes('.')) {
    e.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Versioned static assets (JS/CSS chunks have content-hash in filename): cache-first
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
