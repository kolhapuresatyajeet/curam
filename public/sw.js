// Cúram service worker.
// Strategy:
//   - Navigations (HTML): network-first, fall back to the last cached page
//     when offline. Never serve stale HTML when the network is available.
//   - Hashed static assets (/assets/*): cache-first (content-hashed, safe).
//   - Everything else (Supabase, Edge Functions, third-party): untouched.
const CACHE = 'curam-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // App shells / navigations: network-first so deployments go live immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/'))
            .then(
              (cached) =>
                cached ||
                new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }),
            ),
        ),
    );
    return;
  }

  // Hashed build assets: cache-first — immutable per deploy.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
