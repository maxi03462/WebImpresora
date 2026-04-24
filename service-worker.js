const CACHE_NAME = 'webimpresora-v1';
const OFFLINE_URL = './offline.html';

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './impresora.js',
  './camara.js',
  './image-config.js',
  './dist/receipt-printer-encoder.umd.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  OFFLINE_URL
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo manejar GET.
  if (request.method !== 'GET') return;

  // Navegacion: network-first con fallback offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          return cachedPage || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Assets: cache-first con fallback a red.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});
