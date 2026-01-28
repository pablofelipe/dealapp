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
            webpush: {
                fcm_options: {
                    link: "https://radardaoferta.com.br/public",
                },
            },
            topic: topic,
        };

        try {
            await admin.messaging().send(message);
            console.log("✅ Notificação enviada para o tópico:", topic);
        } catch (error) {
            console.error("❌ Erro ao enviar notificação:", error);
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
