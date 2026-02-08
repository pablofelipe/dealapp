const CACHE_NAME = 'dealapp-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/firebase-config.js',
  '/js/auth.js',
  '/js/deals.js',
  '/js/coupons.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Install - cache recursos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Fetch - estratégia Network First, Cache Fallback
self.addEventListener('fetch', event => {
  // Ignorar requisições do Firebase Messaging
  if (event.request.url.includes('firebase-cloud-messaging-push-scope')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone e salva no cache
        const responseClone = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Activate - limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Handler para notificações push (opcional - complementa o firebase-messaging-sw.js)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    console.log('Push recebido:', data);

    const options = {
      body: data.body || 'Nova oferta disponível!',
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data: data.data || {}
    };

    event.waitUntil(
      self.registration.showNotification(
        data.title || 'Radar da Oferta',
        options
      )
    );
  }
});

// Handler para cliques em notificações
self.addEventListener('notificationclick', event => {
  console.log('Notificação clicada:', event.notification);
  event.notification.close();
});