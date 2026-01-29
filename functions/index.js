// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// ========================================
// FUNÇÃO PRINCIPAL: Gerenciar Inscrições
// ========================================
exports.manageSubscription = functions.https.onCall(async (data, context) => {
    try {
        const { token, topic, action } = data;

        // Validação
        if (!token || !topic || !action) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Token, tópico e ação são obrigatórios'
            );
        }

        if (!['subscribe', 'unsubscribe'].includes(action)) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Ação deve ser "subscribe" ou "unsubscribe"'
            );
        }

        console.log(`📡 Gerenciando inscrição: ${action} em ${topic}`);
        console.log(`📱 Token: ${token.substring(0, 20)}...`);

        let response;

        if (action === 'subscribe') {
            response = await admin.messaging().subscribeToTopic(token, topic);
            console.log(`✅ Inscrito no tópico ${topic}:`, response);
        } else {
            response = await admin.messaging().unsubscribeFromTopic(token, topic);
            console.log(`✅ Desinscrito do tópico ${topic}:`, response);
        }

        return {
            success: true,
            topic: topic,
            action: action,
            successCount: response.successCount,
            failureCount: response.failureCount,
            errors: response.errors || []
        };

    } catch (error) {
        console.error('❌ Erro ao gerenciar inscrição:', error);

        if (error.code) {
            console.error('📋 Código do erro:', error.code);
        }
        if (error.message) {
            console.error('📋 Mensagem:', error.message);
        }

        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ========================================
// NOTIFICAÇÃO: Nova Oferta Criada
// ========================================
exports.onNewDealNotify = functions.firestore
    .document('deals/{dealId}')
    .onCreate(async (snap, context) => {
        try {
            const deal = snap.data();
            const dealId = context.params.dealId;

            console.log('🆕 Nova oferta detectada:', dealId);
            console.log('📦 Dados da oferta:', deal);

            // Determinar categoria
            const category = deal.category || 'all';

            console.log(`📡 Enviando para tópico: ${category}`);

            // ⭐ PAYLOAD CORRIGIDO - SEM TTL em notification
            const message = {
                notification: {
                    title: `🏷️ ${deal.title || 'Nova Oferta!'}`,
                    body: deal.description || 'Confira esta oferta imperdível no seu bairro!',
                },
                data: {
                    dealId: dealId,
                    category: category,
                    url: `/?deal=${dealId}`,
                    timestamp: Date.now().toString()
                },
                // ⭐ Configuração Android CORRIGIDA
                android: {
                    // ⭐ TTL aqui, não em notification
                    ttl: 86400000, // 24 horas em milissegundos
                    priority: 'high',
                    notification: {
                        channelId: 'high_importance',
                        priority: 'high',
                        defaultSound: true,
                        defaultVibrateTimings: true,
                        icon: 'ic_notification',
                        color: '#2196F3',
                        tag: `deal-${dealId}`,
                        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                        notificationPriority: 'PRIORITY_HIGH',
                        visibility: 'PUBLIC'
                    },
                    data: {
                        dealId: dealId,
                        category: category,
                        url: `/?deal=${dealId}`,
                        timestamp: Date.now().toString()
                    }
                },
                // Configuração Web/PWA
                webpush: {
                    notification: {
                        icon: 'https://radardaoferta.com.br/public/assets/icons/icon-192.png',
                        badge: 'https://radardaoferta.com.br/public/assets/icons/icon-192.png',
                        vibrate: [200, 100, 200, 100, 200],
                        requireInteraction: false,
                        tag: `deal-${dealId}`,
                        renotify: true,
                        silent: false
                    },
                    fcmOptions: {
                        link: `https://radardaoferta.com.br/?deal=${dealId}`
                    },
                    headers: {
                        Urgency: 'high',
                        TTL: '86400' // TTL para web em segundos
                    }
                },
                topic: category
            };

            console.log('📤 Configuração da mensagem:');
            console.log('   - Título:', message.notification.title);
            console.log('   - Corpo:', message.notification.body);
            console.log('   - Tópico:', message.topic);
            console.log('   - Android channelId:', message.android?.notification?.channelId);
            console.log('   - Android TTL:', message.android?.ttl);

            // Enviar mensagem
            const response = await admin.messaging().send(message);

            console.log('✅ Notificação enviada com sucesso!');
            console.log('📊 Message ID:', response);
            console.log(`📱 Enviado para tópico: ${category}`);

            return {
                success: true,
                messageId: response,
                topic: category,
                dealId: dealId
            };

        } catch (error) {
            console.error('❌ ERRO ao enviar notificação:', error);
            console.error('📋 Código:', error.code);
            console.error('📋 Mensagem:', error.message);
            console.error('📋 Stack:', error.stack);

            // Não lançar erro para não bloquear criação da oferta
            return {
                success: false,
                error: error.message,
                code: error.code
            };
        }
    });

// ========================================
// TESTE: Enviar Notificação Manual
// ========================================
exports.testNotification = functions.https.onCall(async (data, context) => {
    try {
        const { token, topic } = data;

        console.log('🧪 Iniciando teste de notificação...');
        console.log('📱 Token:', token ? `${token.substring(0, 20)}...` : 'null');
        console.log('📡 Tópico:', topic || 'null');

        const message = {
            notification: {
                title: '🧪 Teste - Radar da Oferta',
                body: 'Se você viu isso, as notificações estão funcionando! 🎉',
            },
            data: {
                test: 'true',
                timestamp: Date.now().toString(),
                source: 'testNotification'
            },
            android: {
                ttl: 3600000, // 1 hora
                priority: 'high',
                notification: {
                    channelId: 'high_importance',
                    priority: 'high',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    icon: 'ic_notification',
                    color: '#2196F3',
                    notificationPriority: 'PRIORITY_HIGH',
                    visibility: 'PUBLIC'
                }
            },
            webpush: {
                notification: {
                    icon: 'https://radardaoferta.com.br/public/assets/icons/icon-192.png',
                    badge: 'https://radardaoferta.com.br/public/assets/icons/icon-192.png',
                    vibrate: [200, 100, 200],
                    requireInteraction: false
                },
                headers: {
                    Urgency: 'high',
                    TTL: '3600'
                }
            }
        };

        let response;

        if (token) {
            message.token = token;
            console.log('📤 Enviando para token específico...');
        } else if (topic) {
            message.topic = topic;
            console.log(`📤 Enviando para tópico: ${topic}`);
        } else {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Forneça token OU topic'
            );
        }

        response = await admin.messaging().send(message);

        console.log('✅ Teste enviado com sucesso!');
        console.log('📊 Message ID:', response);

        return {
            success: true,
            messageId: response,
            sentTo: token ? 'token' : `topic:${topic}`
        };

    } catch (error) {
        console.error('❌ Erro no teste:', error);
        console.error('📋 Código:', error.code);
        console.error('📋 Mensagem:', error.message);

        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ========================================
// DEBUG: Verificar Status do Tópico
// ========================================
exports.checkTopicStatus = functions.https.onCall(async (data, context) => {
    try {
        const { topic } = data;

        if (!topic) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Tópico é obrigatório'
            );
        }

        console.log(`🔍 Verificando tópico: ${topic}`);

        try {
            const message = {
                data: {
                    ping: 'test',
                    timestamp: Date.now().toString()
                },
                topic: topic
            };

            const response = await admin.messaging().send(message);

            console.log(`✅ Tópico ${topic} está ativo`);
            console.log('📊 Message ID:', response);

            return {
                success: true,
                topic: topic,
                status: 'active',
                messageId: response,
                message: `Tópico ${topic} está ativo e recebendo mensagens`
            };

        } catch (sendError) {
            console.error(`❌ Erro ao enviar para tópico ${topic}:`, sendError);

            return {
                success: false,
                topic: topic,
                status: 'error',
                error: sendError.message,
                code: sendError.code
            };
        }

    } catch (error) {
        console.error('❌ Erro ao verificar tópico:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ========================================
// DEBUG: Validar Token
// ========================================
exports.debugTokenInfo = functions.https.onCall(async (data, context) => {
    try {
        const { token } = data;

        if (!token) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Token é obrigatório'
            );
        }

        console.log('🔍 Testando token:', token.substring(0, 20) + '...');

        try {
            const message = {
                data: {
                    ping: 'test'
                },
                token: token
            };

            const response = await admin.messaging().send(message);

            return {
                valid: true,
                messageId: response,
                message: 'Token é válido'
            };

        } catch (sendError) {
            return {
                valid: false,
                error: sendError.message,
                code: sendError.code
            };
        }

    } catch (error) {
        console.error('❌ Erro ao validar token:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});