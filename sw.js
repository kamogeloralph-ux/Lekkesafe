// Bump VERSION any time app.js / styles.css / any CORE_ASSET changes,
// or browsers will keep serving stale cached copies indefinitely.
const VERSION = 'v1';
const CACHE_NAME = `lekkesafe-${VERSION}`;

const CORE_ASSETS = [
  'index.html',
  'register.html',
  'offline.html',
  'css/styles.css',
  'js/app.js',
  'js/supabase-client.js',
  'manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Never cache Supabase API/storage calls — always go to network.
  if (request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(response => {
          if (response.ok && request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match('offline.html');
        });
    })
  );
});
