import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, onBackgroundMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-sw.js";

// Mesma config de merchant/firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyA3br8TLPbQZiMMyG9pjFm1F66LKxIztLs",
    authDomain: "the-dealapp.firebaseapp.com",
    projectId: "the-dealapp",
    storageBucket: "the-dealapp.firebasestorage.app",
    messagingSenderId: "278659003528",
    appId: "1:278659003528:web:e3e19c810b74a3370bdb3d"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
    console.log('🔔 Notificação em segundo plano:', payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'public/assets/icons/icon-192.png',
        data: payload.data // link da oferta
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});