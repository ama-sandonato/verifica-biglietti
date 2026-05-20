const CACHE_NAME = 'pwa-camera-v1';

// 1. Installazione: Creiamo la cache iniziale
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        './index.html',
        './css/ama-pwa.css',
        './js/config.js',
        './js/pwa-scanner.js'
      ]);
    })
  );
  self.skipWaiting();
});

// 2. Attivazione: Pulizia vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// 3. Strategia: Network First (fondamentale per le chiamate API a GAS)
self.addEventListener('fetch', (event) => {
  // Escludiamo le chiamate a Google Apps Script dal caching!
  if (event.request.url.includes('script.google.com')) {
    return; // Lasciamo che la chiamata vada direttamente al server
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se la rete risponde, aggiorniamo la cache
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => caches.match(event.request)) // Se offline, usa la cache
  );
});