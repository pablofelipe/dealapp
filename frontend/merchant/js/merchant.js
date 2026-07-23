import { db } from './firebase-config.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    serverTimestamp
} from 'firebase/firestore';

// ========== FUNÇÕES DE PERFIL ==========

/**
 * Verifica se o lojista já tem perfil cadastrado
 * @param {string} uid - ID do usuário
 * @returns {Promise<Object|null>} Dados do merchant ou null
 */
export async function checkMerchantProfile(uid) {
    try {
        console.log('🔍 Verificando perfil do lojista:', uid);

        const docRef = doc(db, "merchants", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            console.log('✅ Perfil encontrado');
            return {
                id: docSnap.id,
                ...docSnap.data()
            };
        } else {
            console.log('📭 Nenhum perfil encontrado');
            return null;
        }

    } catch (error) {
        console.error('❌ Erro ao verificar perfil:', error);
        throw error;
    }
}

/**
 * Salva o perfil completo do lojista
 * @param {string} uid - ID do usuário
 * @param {string} userEmail - Email do usuário
 * @param {Object} profileData - Dados do perfil
 * @returns {Promise<Object>} Dados salvos
 */
export async function saveMerchantProfile(uid, userEmail, profileData) {
    try {
        console.log('💾 Salvando perfil do lojista:', uid);

        // 1. Geocodificação do endereço
        console.log('📍 Geocodificando endereço...');
        const coordinates = await geocodeMerchantAddress(profileData.location);

        if (!coordinates) {
            throw new Error('❌ Não foi possível geocodificar o endereço. Verifique os dados.');
        }

        // 2. Preparar dados para salvar
        const merchantData = {
            // Dados da empresa
            cnpj: profileData.cnpj.replace(/\D/g, ''),
            businessName: profileData.businessName.trim(),
            tradingName: profileData.tradingName.trim(),
            category: profileData.category,
            phone: profileData.phone.replace(/\D/g, ''),
            businessHours: profileData.businessHours,

            // Localização com coordenadas
            location: {
                ...profileData.location,
                cep: profileData.location.cep.replace(/\D/g, ''),
                number: profileData.location.number.trim(),
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                fullAddress: coordinates.fullAddress,
                geohash: await generateGeohash(coordinates.latitude, coordinates.longitude)
            },

            // Contato
            contact: {
                responsibleName: profileData.contact.responsibleName.trim(),
                responsibleEmail: profileData.contact.responsibleEmail.trim(),
                responsiblePhone: profileData.contact.responsiblePhone.replace(/\D/g, '')
            },

            // Metadados
            userId: uid,
            userEmail: userEmail,
            status: 'active',
            isVerified: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),

            // Estatísticas iniciais
            stats: {
                totalDeals: 0,
                totalCoupons: 0,
                totalRevenue: 0,
                lastDealDate: null
            }
        };

        // 3. Validar dados antes de salvar
        validateMerchantData(merchantData);

        // 4. Salvar no Firestore
        console.log('📤 Enviando para Firestore...');
        await setDoc(doc(db, "merchants", uid), merchantData);

        console.log('✅ Perfil salvo com sucesso!');
        return merchantData;

    } catch (error) {
        console.error('❌ Erro ao salvar perfil:', error);
        throw error;
    }
}

/**
 * Atualiza perfil existente
 * @param {string} uid - ID do usuário
 * @param {Object} updateData - Dados para atualizar
 * @returns {Promise<boolean>} Sucesso da operação
 */
export async function updateMerchantProfile(uid, updateData) {
    try {
        console.log('🔄 Atualizando perfil do lojista:', uid);

        const docRef = doc(db, "merchants", uid);

        // Se atualizar endereço, re-geocodificar
        if (updateData.location) {
            const coordinates = await geocodeMerchantAddress(updateData.location);
            if (coordinates) {
                updateData.location = {
                    ...updateData.location,
                    latitude: coordinates.latitude,
                    longitude: coordinates.longitude,
                    fullAddress: coordinates.fullAddress,
                    geohash: await generateGeohash(coordinates.latitude, coordinates.longitude),
                    updatedAt: new Date().toISOString()
                };
            }
        }

        await updateDoc(docRef, {
            ...updateData,
            updatedAt: serverTimestamp()
        });

        console.log('✅ Perfil atualizado com sucesso!');
        return true;

    } catch (error) {
        console.error('❌ Erro ao atualizar perfil:', error);
        return false;
    }
}

// ========== GEOCODIFICAÇÃO ==========

/**
 * Converte endereço em coordenadas GPS
 * @param {Object} location - Dados de localização
 * @returns {Promise<Object|null>} Coordenadas ou null
 */
export async function geocodeMerchantAddress(location) {
    const { address, number, neighborhood, city, state, cep } = location;

    // Monta query completa
    const fullAddress = `${address}, ${number} - ${neighborhood}, ${city} - ${state}, ${cep}, Brasil`;

    console.log('🌍 Geocodificando:', fullAddress);

    try {
        // Usa Nominatim (OpenStreetMap) - GRÁTIS
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1&countrycodes=br`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'RadarOfertas/1.0',
                'Accept-Language': 'pt-BR,pt'
            }
        });

        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            console.log('📍 Coordenadas encontradas:', result.lat, result.lon);

            return {
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon),
                fullAddress: result.display_name,
                accuracy: result.importance || 0.9
            };
        } else {
            // Fallback: busca por bairro e cidade
            console.log('⚠️ Endereço específico não encontrado, tentando bairro...');
            return await geocodeFallback(location);
        }

    } catch (error) {
        console.error('❌ Erro na geocodificação:', error);
        return await geocodeFallback(location);
    }
}

/**
 * Fallback para geocodificação (busca mais genérica)
 */
async function geocodeFallback(location) {
    const { neighborhood, city, state } = location;

    try {
        const fallbackAddress = `${neighborhood}, ${city}, ${state}, Brasil`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackAddress)}&limit=1`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'RadarOfertas/1.0' }
        });

        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            console.log('📍 Coordenadas aproximadas encontradas:', result.lat, result.lon);

            return {
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon),
                fullAddress: `${location.address}, ${location.number} - ${result.display_name}`,
                accuracy: 0.7,
                isApproximate: true
            };
        }
    } catch (error) {
        console.error('❌ Fallback também falhou:', error);
    }

    return null;
}

/**
 * Gera geohash para consultas espaciais
 */
async function generateGeohash(lat, lng) {
    // Em produção, use uma biblioteca como ngeohash
    // Esta é uma implementação simplificada
    const precision = 7; // Precisão de ~153m

    const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    let hash = "";
    let bits = 0;
    let bitCount = 0;

    let minLat = -90, maxLat = 90;
    let minLng = -180, maxLng = 180;

    while (hash.length < precision) {
        let mid;

        if (bitCount % 2 === 0) {
            // Bit de longitude
            mid = (minLng + maxLng) / 2;
            if (lng > mid) {
                bits = (bits << 1) + 1;
                minLng = mid;
            } else {
                bits = (bits << 1) + 0;
                maxLng = mid;
            }
        } else {
            // Bit de latitude
            mid = (minLat + maxLat) / 2;
            if (lat > mid) {
                bits = (bits << 1) + 1;
                minLat = mid;
            } else {
                bits = (bits << 1) + 0;
                maxLat = mid;
            }
        }

        bitCount++;

        if (bitCount % 5 === 0) {
            hash += BASE32[bits];
            bits = 0;
        }
    }

    return hash;
}

// ========== BUSCA DE CEP ==========

/**
 * Busca informações de endereço pelo CEP
 * @param {string} cep - CEP para buscar
 * @returns {Promise<Object|null>} Dados do endereço ou null
 */
export async function fetchCEP(cep) {
    try {
        const cleanCEP = cep.replace(/\D/g, '');
        if (cleanCEP.length !== 8) {
            throw new Error('CEP deve ter 8 dígitos');
        }

        console.log('📮 Buscando CEP:', cleanCEP);

        const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);

        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.erro) {
            throw new Error('CEP não encontrado');
        }

        console.log('✅ CEP encontrado:', data);

        return {
            address: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: data.uf || '',
            cep: data.cep || cleanCEP
        };

    } catch (error) {
        console.error('❌ Erro ao buscar CEP:', error);
        throw error;
    }
}

// ========== VALIDAÇÕES ==========

/**
 * Valida dados do merchant antes de salvar
 */
function validateMerchantData(data) {
    const errors = [];

    // CNPJ
    if (!validateCNPJ(data.cnpj)) {
        errors.push('CNPJ inválido');
    }

    // Email
    if (!isValidEmail(data.contact.responsibleEmail)) {
        errors.push('Email inválido');
    }

    // Telefone
    if (!isValidPhone(data.phone)) {
        errors.push('Telefone do estabelecimento inválido');
    }

    if (!isValidPhone(data.contact.responsiblePhone)) {
        errors.push('Celular do responsável inválido');
    }

    // Localização
    if (!data.location.latitude || !data.location.longitude) {
        errors.push('Endereço não pôde ser geocodificado');
    }

    // Raio de atendimento
    if (data.location.deliveryRadius < 1 || data.location.deliveryRadius > 20) {
        errors.push('Raio de atendimento deve estar entre 1 e 20 km');
    }

    if (errors.length > 0) {
        throw new Error(`Erros de validação: ${errors.join(', ')}`);
    }
}

/**
 * Valida CNPJ
 */
export function validateCNPJ(cnpj) {
    cnpj = cnpj.replace(/[^\d]+/g, '');

    if (cnpj.length !== 14) return false;

    // Elimina CNPJs inválidos conhecidos
    if (/^(\d)\1+$/.test(cnpj)) return false;

    // Valida DVs
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;

    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }

    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0))) return false;

    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;

    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }

    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(1))) return false;

    return true;
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function isValidPhone(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    return cleanPhone.length >= 10 && cleanPhone.length <= 11;
}

// ========== FUNÇÕES DE CONSULTA ==========

/**
 * Atualiza estatísticas do merchant
 */
export async function updateMerchantStats(uid, statsUpdate) {
    try {
        const docRef = doc(db, "merchants", uid);
        await updateDoc(docRef, {
            'stats': statsUpdate,
            'updatedAt': serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('❌ Erro ao atualizar estatísticas:', error);
        return false;
    }
}

/**
 * Obtém localização formatada do merchant
 */
export function getFormattedLocation(merchant) {
    if (!merchant || !merchant.location) return '';

    const loc = merchant.location;
    const parts = [];

    if (loc.address) parts.push(loc.address);
    if (loc.number) parts.push(loc.number);
    if (loc.complement) parts.push(loc.complement);
    if (loc.neighborhood) parts.push(loc.neighborhood);
    if (loc.city) parts.push(loc.city);
    if (loc.state) parts.push(loc.state);
    if (loc.cep) parts.push(`CEP: ${loc.cep}`);

    return parts.join(', ');
}

export function setupFormMasks() {
    return {
        maskCNPJ: function (input) {
            let value = input.value.replace(/\D/g, "");
            if (value.length > 14) value = value.slice(0, 14);
            value = value.replace(/^(\d{2})(\d)/, "$1.$2");
            value = value.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
            value = value.replace(/\.(\d{3})(\d)/, ".$1/$2");
            value = value.replace(/(\d{4})(\d)/, "$1-$2");
            input.value = value;
        },

        maskCEP: function (input) {
            let value = input.value.replace(/\D/g, "");
            if (value.length > 8) value = value.slice(0, 8);
            if (value.length > 5) {
                value = value.replace(/^(\d{5})(\d)/, "$1-$2");
            }
            input.value = value;
        },

        maskPhone: function (input) {
            let value = input.value.replace(/\D/g, "");
            if (value.length > 11) value = value.slice(0, 11);

            if (value.length <= 10) {
                value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
                value = value.replace(/(\d{4})(\d)/, "$1-$2");
            } else {
                value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
                value = value.replace(/(\d{5})(\d)/, "$1-$2");
            }
            input.value = value;
        }
    };
}

let conciergeInicializado = false;

export async function inicializarConcierge(user) {

    if (conciergeInicializado) return;

    if (user.email === "pablofelipe@gmail.com") {
        const divConcierge = document.getElementById('concierge-control');
        const select = document.getElementById('select-lojista');

        if (!divConcierge || !select) return;

        console.log('Inicializando controle de concierge para:', user.email);

        try {

            conciergeInicializado = true;

            select.innerHTML = '<option value="">-- MINHA PRÓPRIA OFERTA --</option>';

            const querySnapshot = await getDocs(collection(db, "merchants"));

            console.log("🔍 Total de documentos encontrados:", querySnapshot.size);

            querySnapshot.forEach((doc) => {

                const data = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = data.tradingName;
                select.appendChild(option);
            });
            divConcierge.style.display = 'block';
        } catch (error) {
            console.error('❌ Erro ao inicializar concierge:', error);
            conciergeInicializado = false;
        }
    }
}