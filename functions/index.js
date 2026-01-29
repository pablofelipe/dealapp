/* eslint-disable no-unused-vars */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();

exports.onNewDealNotify = functions.firestore
    .document("deals/{dealId}")
    .onCreate(async (snap, context) => {
        const deal = snap.data();

        if (deal.status !== "active") return;

        const topic = deal.category;

        const message = {
            notification: {
                title: `🔥 Nova oferta em ${deal.category}!`,
                body: `${deal.title} por apenas R$ ${deal.dealPrice.toFixed(2)}`,
            },
            data: {
                dealId: context.params.dealId,
                url: "https://radardaoferta.com.br/public",
            },
            // ⭐ CONFIGURAÇÃO ESPECÍFICA PARA ANDROID
            android: {
                notification: {
                    sound: "default",
                    // channelId: "radar_ofertas_channel", // ⭐ Canal Android
                    priority: "high",
                    vibrateTimingsMillis: [0, 500, 250, 500],
                    defaultLightSettings: true,
                },
            },
            // Configuração para iOS
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                        badge: 1,
                    },
                },
            },
            webpush: {
                notification: {
                    icon: "https://radardaoferta.com.br/public/assets/icons/icon-192.png",
                    badge: "https://radardaoferta.com.br/public/assets/icons/icon-192.png",
                    vibrate: [200, 100, 200],
                },
                fcm_options: {
                    link: "https://radardaoferta.com.br/public",
                },
            },
            topic: topic,
        };

        try {
            const topicInfo = await admin.messaging().getTopic(topic);
            console.log(`👥 Inscritos no tópico ${topic}:`, topicInfo);
        } catch (error) {
            console.log(`ℹ️ Não foi possível verificar tópico ${topic}:`, error.message);
        }

        try {
            const response = await admin.messaging().send(message);
            console.log("✅ Notificação enviada para o tópico:", topic);

            // Log para debug Android
            console.log(`📱 Config Android: channelId=${message.android.notification.channelId}`);
            console.log(`📱 Config Web: icon=${message.webpush.notification.icon}`);

            return { success: true, messageId: response };
        } catch (error) {
            console.error(`❌ Erro ao enviar para tópico ${topic}:`, error);

            // Log específico para problemas Android
            if (error.code === "messaging/unknown-topic") {
                console.log(`ℹ️ Tópico ${topic} não tem inscritos no Android`);
            }

            throw error;
        }
    });

exports.manageSubscription = functions.https.onCall(async (data, context) => {
    const { token, topic, action } = data;

    try {
        if (action === "subscribe") {
            await admin.messaging().subscribeToTopic(token, topic);
            return { success: true, message: `Inscrito em ${topic}` };
        } else {
            await admin.messaging().unsubscribeFromTopic(token, topic);
            return { success: true, message: `Removido de ${topic}` };
        }
    } catch (error) {
        console.error("Erro na assinatura:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
