const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

exports.processOfferWithAI = onRequest({
    cors: true,
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 20,
    memory: '256MiB',
}, async (req, res) => {
    const API_KEY = process.env.GEMINI_API_KEY;
    const { imageBase64, title, price, mimeType } = req.body;

    try {
        if (!API_KEY) {
            return res.status(200).json(generateSmartFallback(title, price, 'no_api_key'));
        }

        try {
            const genAI = new GoogleGenerativeAI(API_KEY);

            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const prompt = `Você é um especialista em varejo para o app Radar da Oferta. 
    Dados reais: Título "${title}" e Preço promocional R$ ${price}.
    
    Retorne APENAS um objeto JSON puro, sem markdown, sem explicações, seguindo este formato:
    {
      "description": "Uma frase de marketing curta (máx 128 caracteres) e apelativa com emojis",
      "category": "Escolha a melhor chave desta lista: [adega, butcher, automotive, drinks, toys, fitness, frozen, electronics, pharmacy, dairy, florist, cleaning, hortifruti, grocery, bakery, stationery, fishmonger, petshop, pizzeria, restaurant, services, home_utilities, clothing]",
      "originalPrice": Sugira um valor aleatório entre 10% e 60% acima de ${price},
      "discount": O número inteiro representando a porcentagem de desconto calculada sobre o valor sugerido
    }

    Importante: Se o produto for um bolo ou pão, lembre-se que vencem de um dia para o outro, então a descrição deve focar em 'fresquinho' ou 'fornada de hoje'.`;

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: imageBase64, mimeType: mimeType || "image/jpeg" } }
            ]);

            const response = await result.response;

            let text = response.text();

            const cleanJson = text.replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();

            try {
                return res.status(200).json(JSON.parse(cleanJson));
            } catch (parseError) {
                logger.error("Erro ao parsear JSON da IA:", cleanJson);
                throw parseError;
            }

        } catch (sdkError) {
            logger.warn("SDK falhou, tentando via Fetch manual...", sdkError.message);

            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

            const fetchResponse = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: `Analise este produto: ${title}. Preço: ${price}. Retorne JSON puro.` },
                            { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } }
                        ]
                    }]
                })
            });

            if (!fetchResponse.ok) throw new Error(`Fetch API Error: ${fetchResponse.status}`);

            const data = await fetchResponse.json();
            const rawText = data.candidates[0].content.parts[0].text;
            const cleanFetchJson = rawText.replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();

            try {
                return res.status(200).json(JSON.parse(cleanFetchJson));
            } catch (parseError) {
                logger.error("Erro ao parsear JSON da IA:", cleanFetchJson);
                throw parseError;
            }
        }

    } catch (error) {
        logger.error("Todas as tentativas de IA falharam:", error.message);
        return res.status(200).json(generateSmartFallback(title, price, 'ai_all_failed'));
    }
});

function generateSmartFallback(title, price, reason) {
    const titleLower = title.toLowerCase().trim();
    const priceNum = parseFloat(price);

    logger.info(`Gerando fallback inteligente (${reason}):`, { title, price: priceNum });

    // ========================================
    // 1. DETECTAR CATEGORIA INTELIGENTE
    // ========================================
    const categoryPatterns = [
        // Padaria (prioridade alta - produtos perecíveis)
        {
            keywords: ['pão', 'bolo', 'torta', 'doce', 'rosca', 'croissant', 'sonho', 'bisnaga', 'frances', 'caseir'],
            category: 'bakery',
            emoji: '🥐',
            freshness: true
        },
        // Açougue
        {
            keywords: ['carne', 'frango', 'peixe', 'bife', 'linguiça', 'salsicha', 'presunto', 'mortadela', 'bacon', 'costela', 'picanha'],
            category: 'butcher',
            emoji: '🥩'
        },
        // Hortifruti
        {
            keywords: ['fruta', 'verdura', 'legume', 'salada', 'tomate', 'cebola', 'alface', 'banana', 'maçã', 'laranja', 'abacaxi'],
            category: 'hortifruti',
            emoji: '🥦',
            freshness: true
        },
        // Farmácia
        {
            keywords: ['remédio', 'medicamento', 'farmac', 'vitamina', 'suplemento', 'analgésico', 'xarope', 'cólica', 'gripe', 'dor'],
            category: 'pharmacy',
            emoji: '💊'
        },
        // Limpeza
        {
            keywords: ['sabão', 'detergente', 'desinfetante', 'limpeza', 'álcool', 'água sanitária', 'amaciante', 'lustra móvel', 'multiuso'],
            category: 'cleaning',
            emoji: '🧼'
        },
        // Laticínios
        {
            keywords: ['leite', 'queijo', 'iogurte', 'manteiga', 'requeijão', 'cream cheese', 'nata', 'iorgute'],
            category: 'dairy',
            emoji: '🧀',
            freshness: true
        },
        // Bebidas
        {
            keywords: ['cerveja', 'vinho', 'refri', 'refrigerante', 'suco', 'água', 'whisky', 'vodka', 'energético', 'mate'],
            category: 'drinks',
            emoji: '🍷'
        },
        // Congelados
        {
            keywords: ['congelado', 'sorvete', 'pizza', 'lasanha', 'hambúrguer', 'nugget', 'batata frita'],
            category: 'frozen',
            emoji: '🧊'
        },
        // Padrão (grocery)
        {
            keywords: [],
            category: 'grocery',
            emoji: '🛒'
        }
    ];

    let selectedCategory = categoryPatterns.find(pattern =>
        pattern.keywords.some(keyword => titleLower.includes(keyword))
    ) || categoryPatterns[categoryPatterns.length - 1]; // Último é grocery

    // ========================================
    // 2. GERAR DESCRIÇÃO CRIATIVA E VARIADA
    // ========================================
    const descriptions = {
        bakery: [
            "🥐 {title} fresquinho da fornada!",
            "🍞 {title} quentinho direto do forno!",
            "👨‍🍳 {title} artesanal - qualidade garantida!",
            "🎯 {title} perfeito para o café da manhã!",
            "⏰ {title} acabou de sair do forno!"
        ],
        hortifruti: [
            "🥦 {title} fresquinhos colhidos hoje!",
            "🌱 {title} natural e saudável!",
            "👩‍🌾 {title} direto do produtor!",
            "💚 {title} - qualidade premium!",
            "🌿 {title} selecionados a mão!"
        ],
        butcher: [
            "🥩 {title} - corte especial!",
            "🔪 {title} selecionado com cuidado!",
            "🏆 {title} de primeira qualidade!",
            "👨‍🍳 {title} perfeito para o churrasco!",
            "💪 {title} - proteína de qualidade!"
        ],
        pharmacy: [
            "💊 {title} - cuide da sua saúde!",
            "🏥 {title} com procedência garantida!",
            "👨‍⚕️ {title} - qualidade farmacêutica!",
            "❤️ {title} para seu bem-estar!",
            "⚕️ {title} - laboratório certificado!"
        ],
        default: [
            "🔥 {title} - Oferta imperdível!",
            "🎯 {title} - Preço especial hoje!",
            "⚡ {title} - Promoção relâmpago!",
            "💰 {title} - Economize agora!",
            "🎉 {title} - Oferta exclusiva!"
        ]
    };

    // Escolher descrição aleatória
    const categoryKey = selectedCategory.category in descriptions
        ? selectedCategory.category
        : 'default';

    const availableDescs = descriptions[categoryKey];
    const randomDesc = availableDescs[Math.floor(Math.random() * availableDescs.length)];

    // Substituir {title} pelo título real (truncado se necessário)
    let finalTitle = title;
    if (title.length > 25) {
        finalTitle = title.substring(0, 22) + '...';
    }

    let description = randomDesc.replace('{title}', finalTitle);

    // Se for produto fresco, adicionar ênfase
    if (selectedCategory.freshness) {
        const freshnessPhrases = [' Fresco!', ' Hoje mesmo!', ' Aproveite!', ' Qualidade!'];
        const randomPhrase = freshnessPhrases[Math.floor(Math.random() * freshnessPhrases.length)];
        description = description.replace('!', randomPhrase + '!');
    }

    // Garantir que não ultrapasse 80 caracteres
    if (description.length > 80) {
        description = description.substring(0, 77) + '...';
    }

    // ========================================
    // 3. CALCULAR PREÇO ORIGINAL REALISTA
    // ========================================
    // Diferentes margens por categoria
    const marginRanges = {
        bakery: { min: 1.15, max: 1.40 },      // 15-40% - produtos com margem baixa
        hortifruti: { min: 1.20, max: 1.50 },   // 20-50% - produtos perecíveis
        butcher: { min: 1.25, max: 1.60 },      // 25-60% - proteínas
        pharmacy: { min: 1.30, max: 1.70 },     // 30-70% - medicamentos
        electronics: { min: 1.40, max: 2.00 },  // 40-100% - eletrônicos
        default: { min: 1.20, max: 1.60 }       // 20-60% - padrão
    };

    const range = marginRanges[selectedCategory.category] || marginRanges.default;
    const margin = range.min + (Math.random() * (range.max - range.min));

    // Arredondar para múltiplo de 0.10 (dezenas de centavos)
    let originalPrice = priceNum * margin;
    originalPrice = Math.ceil(originalPrice * 10) / 10; // Arredonda para cima em 0.10

    // Garantir diferença mínima de 10% (evitar "desconto" de 1-2%)
    if ((originalPrice - priceNum) / originalPrice < 0.10) {
        originalPrice = priceNum * 1.15; // Força 15% de desconto mínimo
    }

    // Calcular desconto real
    const discount = Math.round(((originalPrice - priceNum) / originalPrice) * 100);

    // Garantir desconto mínimo de 5% e máximo de 70%
    const finalDiscount = Math.min(Math.max(discount, 5), 70);

    // Ajustar preço original se necessário
    if (discount !== finalDiscount) {
        originalPrice = priceNum / (1 - finalDiscount / 100);
        originalPrice = Math.ceil(originalPrice * 10) / 10;
    }

    // ========================================
    // 4. RETORNAR RESULTADO
    // ========================================
    return {
        description: description,
        category: selectedCategory.category,
        originalPrice: originalPrice, // NÚMERO, não string
        discount: finalDiscount,
        fallbackReason: reason,
        emoji: selectedCategory.emoji,
        isFreshProduct: selectedCategory.freshness || false,
        categoryDetected: selectedCategory.category !== 'grocery'
    };
}

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