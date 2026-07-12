// Minimal service worker - exists mainly to satisfy installability requirements
// (Chrome/Android require a registered SW with a fetch handler to install a PWA
// or wrap it as a Trusted Web Activity). Deliberately network-first: always
// tries the network first so updates show up immediately, only falling back
// to a cached copy when the device is offline.

const CACHE_NAME = 'bmc-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
