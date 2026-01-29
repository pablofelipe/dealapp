
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
/*
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
*/

messaging.onBackgroundMessage((payload) => {

    console.log('📱 PAYLOAD RECEBIDO:', payload);
    console.log('📱 Notification:', payload.notification);
    console.log('📱 Data:', payload.data);

    // Configuração otimizada para Android
    const notificationOptions = {
        body: payload.notification?.body || 'Nova oferta disponível!',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-192.png',
        vibrate: [200, 100, 200, 100, 200], // Padrão Android
        tag: 'radar-oferta', // Agrupa notificações similares
        renotify: true,
        requireInteraction: false, // Android fecha automaticamente
        data: payload.data || {},
        // ⭐ IMPORTANTE: Ações para Android
        actions: [
            {
                action: 'view',
                title: 'Ver Oferta'
            },
            {
                action: 'dismiss',
                title: 'Fechar'
            }
        ]
    };

    // Título da notificação
    const title = payload.notification?.title || 'Radar da Oferta';

    console.log('📱 Mostrando notificação Android:', title);

    return self.registration.showNotification(title, notificationOptions);
});

// Handler para cliques em notificações (Android)
self.addEventListener('notificationclick', (event) => {
    console.log('📱 Notificação clicada no Android');

    event.notification.close();

    const data = event.notification.data || {};

    // Determinar URL baseado no dispositivo
    let url = '/';
    if (data.dealId) {
        url = `/?deal=${data.dealId}`;
    }

    // Para Android, abrir no app PWA
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Tentar focar em janela existente
            for (const client of clientList) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }

            // Se não encontrou, abrir nova janela
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});