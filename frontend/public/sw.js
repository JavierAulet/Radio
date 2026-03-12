// Service Worker mínimo — solo para cumplir requisitos PWA instalable
// Vite genera hashes en los nombres de assets, no necesitamos cachear nada
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', () => {});
