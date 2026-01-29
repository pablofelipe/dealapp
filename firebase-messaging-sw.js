
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyA3br8TLPbQZiMMyG9pjFm1F66LKxIztLs",
    authDomain: "the-dealapp.firebasestorage.app",
    projectId: "the-dealapp",
    storageBucket: "the-dealapp.firebasestorage.app",
    messagingSenderId: "278659003528",
    appId: "1:278659003528:web:e3e19c810b74a3370bdb3d"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// ⭐ IMPORTANTE: Forçar ativação imediata
self.addEventListener('install', (event) => {
    console.log('🚀 Firebase Messaging SW instalando...');
    self.skipWaiting(); // ⭐ Força ativação imediata
});

self.addEventListener('activate', (event) => {
    console.log('✅ Firebase Messaging SW ativado!');
    event.waitUntil(self.clients.claim()); // ⭐ Assume controle imediato
});

// Handler para mensagens em background
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Notificação recebida:', payload);

    const notificationTitle = payload.notification?.title || 'Radar da Oferta';
    const notificationOptions = {
        body: payload.notification?.body || 'Nova oferta!',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-192.png',
        data: payload.data || {}
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});