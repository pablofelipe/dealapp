// firebase-messaging-sw.js
// Service Worker EXCLUSIVO para Firebase Cloud Messaging

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// ⚠️ CORRIGIDO: authDomain estava errado
const firebaseConfig = {
    apiKey: "AIzaSyA3br8TLPbQZiMMyG9pjFm1F66LKxIztLs",
    authDomain: "the-dealapp.firebaseapp.com", // ← CORRIGIDO
    projectId: "the-dealapp",
    storageBucket: "the-dealapp.firebasestorage.app",
    messagingSenderId: "278659003528",
    appId: "1:278659003528:web:e3e19c810b74a3370bdb3d"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Instalação e Ativação
self.addEventListener('install', (event) => {
    console.log('🚀 Firebase Messaging SW instalando...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('✅ Firebase Messaging SW ativado!');
    event.waitUntil(self.clients.claim());
});

// ⭐ HANDLER PRINCIPAL - Background Messages
messaging.onBackgroundMessage((payload) => {
    console.log('📱 NOTIFICAÇÃO RECEBIDA:', payload);
    
    // Extrair dados
    const title = payload.notification?.title || 'Radar da Oferta';
    const body = payload.notification?.body || 'Nova oferta disponível!';
    const icon = payload.notification?.icon || '/public/assets/icons/icon-192.png';
    
    // ⭐ Configuração otimizada para Android
    const notificationOptions = {
        body: body,
        icon: icon,
        badge: '/public/assets/icons/icon-192.png',
        
        // Android-specific
        vibrate: [200, 100, 200, 100, 200],
        tag: 'radar-oferta-' + (payload.data?.dealId || Date.now()),
        renotify: true,
        requireInteraction: false,
        
        // Dados customizados
        data: {
            dealId: payload.data?.dealId,
            category: payload.data?.category,
            url: payload.data?.url || '/',
            fcmMessageId: payload.fcmMessageId
        },
        
        // Ações (botões na notificação)
        actions: [
            {
                action: 'view',
                title: '👀 Ver Oferta',
                icon: '/public/assets/icons/icon-192.png'
            },
            {
                action: 'dismiss',
                title: 'Fechar'
            }
        ]
    };
    
    console.log('📤 Exibindo notificação:', title, notificationOptions);
    
    return self.registration.showNotification(title, notificationOptions);
});

// ⭐ HANDLER DE CLIQUES
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notificação clicada:', event.action);
    
    event.notification.close();
    
    // Se clicou em "dismiss", apenas fecha
    if (event.action === 'dismiss') {
        return;
    }
    
    // Determinar URL de destino
    const data = event.notification.data || {};
    let urlToOpen = data.url || '/';
    
    if (data.dealId) {
        urlToOpen = `/?deal=${data.dealId}`;
    }
    
    console.log('🔗 Abrindo URL:', urlToOpen);
    
    // Abrir ou focar no app
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Tentar focar janela existente
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Abrir nova janela
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// ⭐ HANDLER ADICIONAL - Push Event (fallback)
self.addEventListener('push', (event) => {
    console.log('🔔 Push event recebido:', event);
    
    // Firebase já trata via onBackgroundMessage
    // Este handler é fallback caso algo falhe
    if (event.data) {
        try {
            const data = event.data.json();
            console.log('📦 Push data:', data);
        } catch (e) {
            console.log('📦 Push text:', event.data.text());
        }
    }
});
