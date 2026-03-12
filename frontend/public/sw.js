// CACHE_NAME incluye el parámetro ?v= de la URL del SW (único por build)
const params = new URL(self.scriptURL).searchParams;
const CACHE_NAME = 'urbanova-' + (params.get('v') || 'dev');

const NETWORK_ONLY = ['/stream', '/socket.io', '/api', '/broadcast'];

const isNetworkOnly = (url) => {
  try {
    const { pathname } = new URL(url);
    return NETWORK_ONLY.some(p => pathname.startsWith(p));
  } catch { return false; }
};

// Instalación: activar inmediatamente sin esperar
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activación: eliminar TODAS las caches anteriores y tomar control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first para HTML (siempre versión nueva), cache-first para assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (isNetworkOnly(event.request.url)) return;

  const isHTML = event.request.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    // Network-first para HTML: siempre intenta la red primero
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first para assets estáticos (JS, CSS, imágenes)
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});

// Cuando el SW detecta una nueva versión, notifica a todos los clientes para recargar
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
