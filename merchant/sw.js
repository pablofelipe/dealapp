
const CACHE_NAME = 'radar-merchant-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {

    event.respondWith(fetch(event.request));
});
