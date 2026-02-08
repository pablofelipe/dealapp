
import { db } from './firebase-config.js';
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { fetchCEP, geocodeMerchantAddress, validateCNPJ } from './merchant.js';

// Elementos DOM
let editMerchantForm = null;

// Estado
let currentMerchantData = null;

/**
 * Inicializa a funcionalidade de edição do merchant
 */
export function initializeEditMerchant() {
    setupFormMasks();
    setupCEPSearch();
    setupFormSubmit();
}

/**
 * Carrega os dados do merchant para edição
 * @param {string} uid - ID do usuário
 */
export async function loadMerchantForEdit(uid) {
    try {
        showLoading(true);

        // Carregar dados do Firestore
        const merchantDoc = await getMerchantData(uid);

        if (!merchantDoc) {
            throw new Error('Dados do lojista não encontrados');
        }

        currentMerchantData = merchantDoc;

        // Preencher formulário
        populateEditForm(merchantDoc);

        console.log('✅ Dados carregados para edição');
        return merchantDoc;

    } catch (error) {
        console.error('❌ Erro ao carregar dados para edição:', error);
        showNotification('error', 'Erro ao carregar dados. Tente novamente.');
        throw error;
    } finally {
        showLoading(false);
    }
}

/**
 * Busca dados do merchant do Firestore
 */
async function getMerchantData(uid) {
    try {
        const docRef = doc(db, "merchants", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return {
                id: docSnap.id,
                ...docSnap.data()
            };
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        throw error;
    }
}

/**
 * Preenche o formulário com os dados do merchant
 */
function populateEditForm(merchant) {
    // Dados da empresa
    document.getElementById('edit-merchant-cnpj').value = formatCNPJ(merchant.cnpj || '');
    document.getElementById('edit-merchant-business-name').value = merchant.businessName || '';
    document.getElementById('edit-merchant-trading-name').value = merchant.tradingName || '';
    document.getElementById('edit-merchant-category').value = merchant.category || '';
    document.getElementById('edit-merchant-phone').value = formatPhone(merchant.phone || '');

    // Localização
    const loc = merchant.location || {};
    document.getElementById('edit-merchant-cep').value = formatCEP(loc.cep || '');
    document.getElementById('edit-merchant-state').value = loc.state || '';
    document.getElementById('edit-merchant-city').value = loc.city || '';
    document.getElementById('edit-merchant-neighborhood').value = loc.neighborhood || '';
    document.getElementById('edit-merchant-address').value = loc.address || '';
    document.getElementById('edit-merchant-number').value = loc.number || '';
    document.getElementById('edit-merchant-complement').value = loc.complement || '';

    if (loc.deliveryRadius) {
        document.getElementById('edit-merchant-radius').value = loc.deliveryRadius;
    }

    // Contato
    const contact = merchant.contact || {};
    document.getElementById('edit-merchant-responsible-name').value = contact.responsibleName || '';
    document.getElementById('edit-merchant-responsible-email').value = contact.responsibleEmail || '';
    document.getElementById('edit-merchant-responsible-phone').value = formatPhone(contact.responsiblePhone || '');

    const vendorInput = document.getElementById('edit-vendorCode');
    if (vendorInput) {
        vendorInput.value = merchant.vendorCode || 'Nenhum (Direto)';
    }

    const hoursInput = document.getElementById('edit-merchant-hours');
    if (hoursInput) {
        hoursInput.value = merchant.businessHours || '';
    }

    // Salvar dados originais para comparação
    saveOriginalData(merchant);
}

/**
 * Salva dados originais para detectar alterações
 */
function saveOriginalData(merchant) {
    sessionStorage.setItem('originalMerchantData', JSON.stringify(merchant));
}

/**
 * Configura máscaras para os campos do formulário
 */
function setupFormMasks() {
    // CNPJ
    const cnpjInput = document.getElementById('edit-merchant-cnpj');
    if (cnpjInput) {
        cnpjInput.addEventListener('input', function () {
            let value = this.value.replace(/\D/g, "");
            if (value.length > 14) value = value.slice(0, 14);
            value = value.replace(/^(\d{2})(\d)/, "$1.$2");
            value = value.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
            value = value.replace(/\.(\d{3})(\d)/, ".$1/$2");
            value = value.replace(/(\d{4})(\d)/, "$1-$2");
            this.value = value;
        });
    }

    // CEP
    const cepInput = document.getElementById('edit-merchant-cep');
    if (cepInput) {
        cepInput.addEventListener('input', function () {
            let value = this.value.replace(/\D/g, "");
            if (value.length > 8) value = value.slice(0, 8);
            if (value.length > 5) {
                value = value.replace(/^(\d{5})(\d)/, "$1-$2");
            }
            this.value = value;
        });
    }

    // Telefones
    const phoneInputs = [
        document.getElementById('edit-merchant-phone'),
        document.getElementById('edit-merchant-responsible-phone')
    ];

    phoneInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', function () {
                let value = this.value.replace(/\D/g, "");
                if (value.length > 11) value = value.slice(0, 11);

                if (value.length <= 10) {
                    value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
                    value = value.replace(/(\d{4})(\d)/, "$1-$2");
                } else {
                    value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
                    value = value.replace(/(\d{5})(\d)/, "$1-$2");
                }
                this.value = value;
            });
        }
    });
}

/**
 * Configura busca automática de CEP
 */
function setupCEPSearch() {
    const cepInput = document.getElementById('edit-merchant-cep');
    if (!cepInput) return;

    let timeoutId;

    cepInput.addEventListener('input', function () {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
            const cep = this.value.replace(/\D/g, '');
            if (cep.length === 8) {
                try {
                    const data = await fetchCEP(cep);
                    if (data) {
                        document.getElementById('edit-merchant-address').value = data.address || '';
                        document.getElementById('edit-merchant-neighborhood').value = data.neighborhood || '';
                        document.getElementById('edit-merchant-city').value = data.city || '';
                        document.getElementById('edit-merchant-state').value = data.state || '';
                    }
                } catch (error) {
                    console.warn('CEP não encontrado ou erro na busca. error: ', error.message);
                }
            }
        }, 800); // Debounce de 800ms
    });
}

/**
 * Configura o envio do formulário
 */
function setupFormSubmit() {
    editMerchantForm = document.getElementById('edit-merchant-form');
    if (!editMerchantForm) return;

    editMerchantForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleEditSubmit();
    });
}

/**
 * Manipula o envio do formulário de edição
 */
async function handleEditSubmit() {
    try {
        showLoading(true);

        // Coletar dados do formulário
        const formData = collectFormData();

        // Validar campos
        validateFormData(formData);


        // Verificar se houve alterações
        const hasChanges = checkForChanges(formData);
        if (!hasChanges) {
            showNotification('info', 'Nenhuma alteração foi feita.');
            return;
        }

        // Preparar dados para atualização
        const updateData = prepareUpdateData(formData);

        updateLocalData(updateData);

        // Se endereço foi alterado, re-geocodificar
        if (updateData.location) {
            const coordinates = await geocodeMerchantAddress(updateData.location);
            if (coordinates) {
                updateData.location = {
                    ...updateData.location,
                    latitude: coordinates.latitude,
                    longitude: coordinates.longitude,
                    fullAddress: coordinates.fullAddress,
                    geohash: await generateGeohash(coordinates.latitude, coordinates.longitude)
                };
            } else {
                throw new Error('Não foi possível geocodificar o novo endereço');
            }
        }

        // Atualizar no Firestore
        await updateMerchantInFirestore(updateData);

        // Recarregar dados COMPLETOS do Firestore
        console.log('🔄 Recarregando dados completos do Firestore...');
        const updatedMerchant = await getMerchantData(currentMerchantData.id || currentMerchantData.userId);

        if (updatedMerchant) {
            currentMerchantData = updatedMerchant;

            const merchantBadge = document.getElementById('merchant-name-badge');
            if (merchantBadge && updatedMerchant.tradingName) {
                merchantBadge.textContent = updatedMerchant.tradingName;
                merchantBadge.title = `CNPJ: ${updatedMerchant.cnpj || 'Não informado'}`;
                console.log('🎯 Badge FINAL atualizado para:', updatedMerchant.tradingName);
            }

            // Salvar no localStorage
            localStorage.setItem('currentMerchant', JSON.stringify(updatedMerchant));

            // Atualizar variável global
            window.currentMerchant = updatedMerchant;

            console.log('✅ Atualização completa concluída');
        }

        showNotification('success', '✅ Cadastro atualizado com sucesso!');

        // Voltar para a view principal após 1 segundo
        setTimeout(() => {
            if (typeof showView === 'function') {
                showView('deals');
            }
        }, 1000);

    } catch (error) {
        console.error('❌ Erro ao atualizar cadastro:', error);
        showNotification('error', error.message || 'Erro ao atualizar cadastro');
    } finally {
        showLoading(false);
    }
}

/**
 * Coleta dados do formulário
 */
function collectFormData() {
    return {
        cnpj: document.getElementById('edit-merchant-cnpj').value,
        businessName: document.getElementById('edit-merchant-business-name').value,
        tradingName: document.getElementById('edit-merchant-trading-name').value,
        category: document.getElementById('edit-merchant-category').value,
        phone: document.getElementById('edit-merchant-phone').value,

        location: {
            cep: document.getElementById('edit-merchant-cep').value,
            state: document.getElementById('edit-merchant-state').value,
            city: document.getElementById('edit-merchant-city').value,
            neighborhood: document.getElementById('edit-merchant-neighborhood').value,
            address: document.getElementById('edit-merchant-address').value,
            number: document.getElementById('edit-merchant-number').value,
            complement: document.getElementById('edit-merchant-complement').value,
            deliveryRadius: parseInt(document.getElementById('edit-merchant-radius').value) || 5
        },

        contact: {
            responsibleName: document.getElementById('edit-merchant-responsible-name').value,
            responsibleEmail: document.getElementById('edit-merchant-responsible-email').value,
            responsiblePhone: document.getElementById('edit-merchant-responsible-phone').value
        }
    };
}

/**
 * Valida dados do formulário
 */
function validateFormData(data) {
    const errors = [];

    // Campos obrigatórios
    const requiredFields = [
        { field: data.cnpj, name: 'CNPJ' },
        { field: data.businessName, name: 'Razão Social' },
        { field: data.tradingName, name: 'Nome Fantasia' },
        { field: data.category, name: 'Categoria' },
        { field: data.phone, name: 'Telefone' },
        { field: data.location.cep, name: 'CEP' },
        { field: data.location.state, name: 'Estado' },
        { field: data.location.city, name: 'Cidade' },
        { field: data.location.neighborhood, name: 'Bairro' },
        { field: data.location.address, name: 'Endereço' },
        { field: data.location.number, name: 'Número' },
        { field: data.contact.responsibleName, name: 'Nome do Responsável' },
        { field: data.contact.responsibleEmail, name: 'Email do Responsável' },
        { field: data.contact.responsiblePhone, name: 'Celular do Responsável' }
    ];

    requiredFields.forEach(({ field, name }) => {
        if (!field || field.trim().length === 0) {
            errors.push(`${name} é obrigatório`);
        }
    });

    // Validações específicas
    if (!validateCNPJ(data.cnpj)) {
        errors.push('CNPJ inválido');
    }

    if (!isValidEmail(data.contact.responsibleEmail)) {
        errors.push('Email inválido');
    }

    if (!isValidPhone(data.phone)) {
        errors.push('Telefone do estabelecimento inválido');
    }

    if (!isValidPhone(data.contact.responsiblePhone)) {
        errors.push('Celular do responsável inválido');
    }

    // Raio de atendimento
    const radius = data.location.deliveryRadius;
    if (radius < 1 || radius > 20) {
        errors.push('Raio de atendimento deve estar entre 1 e 20 km');
    }

    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
}

/**
 * Verifica se houve alterações nos dados
 */
function checkForChanges(newData) {
    const originalData = JSON.parse(sessionStorage.getItem('originalMerchantData') || '{}');

    // Lista de campos que NÃO devem disparar o alerta de mudança (metadados)
    const blackList = ['updatedAt', 'lastDealDate', 'stats'];

    // Função auxiliar para comparar objetos de forma profunda
    const hasChanged = Object.keys(newData).some(key => {
        if (blackList.includes(key)) return false;

        const newValue = JSON.stringify(newData[key]);
        const originalValue = JSON.stringify(originalData[key]);

        return newValue !== originalValue;
    });

    if (hasChanged) {
        console.log("✅ Alteração detectada em algum campo.");
        return true;
    }

    return false;
}

/**
 * Prepara dados para atualização (apenas campos alterados)
 */
function prepareUpdateData(formData) {
    const originalData = JSON.parse(sessionStorage.getItem('originalMerchantData') || '{}');
    const updateData = {};

    // Dados da empresa
    if (cleanForComparison(formData.cnpj) !== cleanForComparison(originalData.cnpj)) {
        updateData.cnpj = formData.cnpj.replace(/\D/g, '');
    }

    if (formData.businessName !== originalData.businessName) {
        updateData.businessName = formData.businessName.trim();
    }

    if (formData.tradingName !== originalData.tradingName) {
        updateData.tradingName = formData.tradingName.trim();
    }

    if (formData.category !== originalData.category) {
        updateData.category = formData.category;
    }

    if (cleanForComparison(formData.phone) !== cleanForComparison(originalData.phone)) {
        updateData.phone = formData.phone.replace(/\D/g, '');
    }

    // Localização
    const locationChanged = checkLocationChanges(formData.location, originalData.location || {});
    if (locationChanged) {
        updateData.location = {
            cep: formData.location.cep.replace(/\D/g, ''),
            state: formData.location.state,
            city: formData.location.city.trim(),
            neighborhood: formData.location.neighborhood.trim(),
            address: formData.location.address.trim(),
            number: formData.location.number.trim(),
            complement: formData.location.complement?.trim() || '',
            deliveryRadius: formData.location.deliveryRadius
        };
    }

    // Contato
    const contactChanged = checkContactChanges(formData.contact, originalData.contact || {});
    if (contactChanged) {
        updateData.contact = {
            responsibleName: formData.contact.responsibleName.trim(),
            responsibleEmail: formData.contact.responsibleEmail.trim(),
            responsiblePhone: formData.contact.responsiblePhone.replace(/\D/g, '')
        };
    }

    // Adicionar timestamp
    if (Object.keys(updateData).length > 0) {
        updateData.updatedAt = serverTimestamp();
    }

    return updateData;
}

/**
 * Verifica alterações na localização
 */
function checkLocationChanges(newLoc, oldLoc) {
    const fields = ['cep', 'state', 'city', 'neighborhood', 'address', 'number', 'complement', 'deliveryRadius'];

    for (const field of fields) {
        const newValue = cleanForComparison(newLoc[field]);
        const oldValue = cleanForComparison(oldLoc[field]);

        if (newValue !== oldValue) {
            return true;
        }
    }

    return false;
}

/**
 * Verifica alterações no contato
 */
function checkContactChanges(newContact, oldContact) {
    const fields = ['responsibleName', 'responsibleEmail', 'responsiblePhone'];

    for (const field of fields) {
        const newValue = cleanForComparison(newContact[field]);
        const oldValue = cleanForComparison(oldContact[field]);

        if (newValue !== oldValue) {
            return true;
        }
    }

    return false;
}

/**
 * Atualiza dados no Firestore
 */
async function updateMerchantInFirestore(updateData) {
    if (Object.keys(updateData).length === 0) {
        return;
    }

    const uid = currentMerchantData?.id || currentMerchantData?.userId;
    if (!uid) {
        throw new Error('ID do usuário não encontrado');
    }

    const docRef = doc(db, "merchants", uid);
    await updateDoc(docRef, updateData);

    console.log('✅ Dados atualizados no Firestore');
}

/**
 * Atualiza dados locais
 */
function updateLocalData(updateData) {
    if (!currentMerchantData) {
        console.log('❌ currentMerchantData é null');
        return;
    }

    console.log('🔄 Atualizando dados locais com:', updateData);

    // Atualizar objeto local
    Object.assign(currentMerchantData, updateData);

    // Atualizar dados na sessão
    const originalData = JSON.parse(sessionStorage.getItem('originalMerchantData') || '{}');
    sessionStorage.setItem('originalMerchantData', JSON.stringify({
        ...originalData,
        ...updateData
    }));

    // Salvar no localStorage
    try {
        localStorage.setItem('currentMerchant', JSON.stringify(currentMerchantData));
        console.log('✅ Merchant atualizado no localStorage');
    } catch (e) {
        console.error('❌ Erro ao salvar no localStorage:', e);
    }

    const merchantBadge = document.getElementById('merchant-name-badge');
    if (merchantBadge && currentMerchantData.tradingName) {
        merchantBadge.textContent = currentMerchantData.tradingName;
        merchantBadge.title = `CNPJ: ${currentMerchantData.cnpj || 'Não informado'}`;
        console.log('🎯 Badge atualizado diretamente para:', currentMerchantData.tradingName);
    }

    // Atualizar variável global (simples)
    window.currentMerchant = currentMerchantData;

    console.log('✅ Dados locais atualizados');
}

/**
 * Funções auxiliares
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current ? current[key] : undefined;
    }, obj);
}

function cleanForComparison(value) {
    if (typeof value !== 'string') {
        if (typeof value === 'number') return value.toString();
        return value || '';
    }
    return value.replace(/\D/g, '').trim();
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function isValidPhone(phone) {
    const cleanPhone = phone?.replace(/\D/g, '');
    return cleanPhone && cleanPhone.length >= 10 && cleanPhone.length <= 11;
}

function formatCNPJ(cnpj) {
    if (!cnpj) return '';
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return clean;

    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatPhone(phone) {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');

    if (clean.length <= 10) {
        return clean.replace(/^(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    } else {
        return clean.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
}

function formatCEP(cep) {
    if (!cep) return '';
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return clean;
    return clean.replace(/^(\d{5})(\d{3})/, "$1-$2");
}

/**
 * Gera geohash (simplificado - usar biblioteca em produção)
 */
async function generateGeohash(lat, lng) {
    // Implementação simplificada - usar ngeohash em produção
    const precision = 7;
    const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    let hash = "";
    let bits = 0;
    let bitCount = 0;

    let minLat = -90, maxLat = 90;
    let minLng = -180, maxLng = 180;

    while (hash.length < precision) {
        if (bitCount % 2 === 0) {
            const midLng = (minLng + maxLng) / 2;
            if (lng > midLng) {
                bits = (bits << 1) + 1;
                minLng = midLng;
            } else {
                bits = (bits << 1) + 0;
                maxLng = midLng;
            }
        } else {
            const midLat = (minLat + maxLat) / 2;
            if (lat > midLat) {
                bits = (bits << 1) + 1;
                minLat = midLat;
            } else {
                bits = (bits << 1) + 0;
                maxLat = midLat;
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

/**
 * Mostra/oculta loading
 */
function showLoading(show) {
    const loadingElement = document.getElementById('loading') ||
        document.querySelector('.loading');
    if (loadingElement) {
        loadingElement.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Mostra notificação
 */
function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.className = `app-notification app-notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' :
            type === 'error' ? '#ef4444' :
                type === 'info' ? '#3b82f6' : '#f59e0b'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease;
        max-width: 400px;
        word-wrap: break-word;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}