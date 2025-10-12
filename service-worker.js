const CACHE_VERSION = 'v1';
const STATIC_CACHE_NAME = `radar1090-static-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_PAGE = './index.html';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.json',
  './Medium.png',
  './Heavy.png',
  './Light.png',
  './Glider.png',
  './LighterThanAir.png',
  './DroneUAV.png',
  './Rotar.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('radar1090-static-') && key !== STATIC_CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_FALLBACK_PAGE))
    );
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();
          caches
            .open(STATIC_CACHE_NAME)
            .then((cache) => {
              if (networkResponse.ok) {
                cache.put(request, responseClone);
              }
            })
            .catch((error) => {
              console.warn('Failed to cache resource', request.url, error);
            });

          return networkResponse;
        })
        .catch((error) => {
          console.warn('Network request failed', request.url, error);
          return Response.error();
        });
    })
  );
});
