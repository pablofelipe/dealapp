import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, onBackgroundMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-sw.js";

// Mesma config de merchant/firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyCEJpdEqFdVgSXd8fH7WYjEP2xCfPeGv2Q",
    authDomain: "deal-application.firebaseapp.com",
    projectId: "deal-application",
    storageBucket: "deal-application.firebasestorage.app",
    messagingSenderId: "985803535961",
    appId: "1:985803535961:web:5f7b976c1d5042bfc12348"
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