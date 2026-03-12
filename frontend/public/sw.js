const CACHE_NAME = 'urbanova-v1';

// Assets estáticos a cachear en la instalación
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/logo.png'
];

// Nunca cachear estas rutas — siempre red
const NETWORK_ONLY = ['/stream', '/socket.io', '/api', '/broadcast'];

const isNetworkOnly = (url) => {
  const { pathname } = new URL(url);
  return NETWORK_ONLY.some(p => pathname.startsWith(p));
};

// Instalación: precachear assets críticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activación: limpiar caches antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first para assets, network-only para stream/api/socket
self.addEventListener('fetch', (event) => {
  // Solo interceptar GET
  if (event.request.method !== 'GET') return;

  // Stream, API, socket.io → siempre red (nunca cachear)
  if (isNetworkOnly(event.request.url)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Solo cachear respuestas válidas de mismo origen
        if (
          response.ok &&
          response.type === 'basic' &&
          event.request.url.startsWith(self.location.origin)
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});