import { db, auth } from './firebase-config.js';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  orderBy,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Carregar ofertas do lojista
export async function loadMerchantDeals(merchantId) {
  try {
    console.log('📦 Carregando ofertas do lojista:', merchantId);

    const dealsRef = collection(db, 'deals');
    const q = query(
      dealsRef,
      where('merchantId', '==', merchantId)
    );

    const snapshot = await getDocs(q);
    console.log('📊 Total de ofertas:', snapshot.size);

    const deals = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    deals.sort((a, b) => {
      const dateA = a.createdAt?.toDate() || new Date(0);
      const dateB = b.createdAt?.toDate() || new Date(0);
      return dateB - dateA;
    });

    renderMerchantDeals(deals);
    return deals;

  } catch (error) {
    console.error('❌ Erro ao carregar ofertas:', error);
    return [];
  }
}

// Buscar dados do merchant
async function getMerchantData(merchantId) {
  try {
    const merchantRef = doc(db, 'merchants', merchantId);
    const merchantSnap = await getDoc(merchantRef);

    if (!merchantSnap.exists()) {
      throw new Error('Perfil do lojista não encontrado. Complete seu cadastro primeiro.');
    }

    return merchantSnap.data();
  } catch (error) {
    console.error('❌ Erro ao buscar dados do merchant:', error);
    throw error;
  }
}

// Atualizar informações do merchant na UI
export async function updateMerchantUI(merchantData) {
  try {
    // Atualizar badge do merchant na sidebar
    const merchantBadge = document.getElementById('merchant-name-badge');
    if (merchantBadge && merchantData.tradingName) {
      merchantBadge.textContent = merchantData.tradingName;
      merchantBadge.title = merchantData.businessName || merchantData.tradingName;
    }

    // Atualizar informações de localização na view de criar oferta
    const locationInfo = document.getElementById('merchant-location-info');
    if (locationInfo && merchantData.location) {
      const loc = merchantData.location;
      const addressParts = [];

      if (loc.address) addressParts.push(loc.address);
      if (loc.number) addressParts.push(loc.number);
      if (loc.complement) addressParts.push(loc.complement);
      if (loc.neighborhood) addressParts.push(loc.neighborhood);
      if (loc.city) addressParts.push(loc.city);
      if (loc.state) addressParts.push(loc.state);

      locationInfo.textContent = addressParts.join(', ');

      if (loc.deliveryRadius) {
        locationInfo.textContent += ` • Raio: ${loc.deliveryRadius} km`;
      }
    }

  } catch (error) {
    console.error('❌ Erro ao atualizar UI do merchant:', error);
  }
}

// Renderizar ofertas
function renderMerchantDeals(deals) {
  const dealsList = document.getElementById('deals-list');

  if (!dealsList) return;

  dealsList.innerHTML = '';

  if (deals.length === 0) {
    dealsList.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #64748b;">
        <p style="font-size: 18px; margin-bottom: 12px;">📦 Nenhuma oferta criada ainda</p>
        <p>Clique em "Nova Oferta" para começar</p>
      </div>
    `;
    return;
  }

  deals.forEach(deal => {
    const dealItem = createDealItem(deal);
    dealsList.appendChild(dealItem);
  });
}

function createDealItem(deal) {
  const item = document.createElement('div');
  item.className = 'deal-item';

  const expiresAt = deal.expiresAt?.toDate() || new Date();
  const isExpired = expiresAt < new Date();
  const isLowStock = deal.stockAvailable < 10;
  const isPaused = deal.status === 'paused';

  // Formatar localização
  const locationInfo = deal.merchantLocation ?
    `${deal.merchantLocation.neighborhood || ''} • ${deal.merchantLocation.city || ''} • Raio: ${deal.merchantLocation.deliveryRadius || 0}km` :
    'Sem localização';

  item.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/120'}" alt="${deal.title}">
    <div class="deal-item-content">
      <h3>${deal.title}</h3>
      <p style="color: #64748b; margin-bottom: 8px;">${deal.description}</p>
      <div style="color: #64748b; font-size: 13px; margin-bottom: 8px;">
        📍 ${locationInfo}
      </div>
      <div class="deal-item-meta">
        <span>💰 R$ ${deal.dealPrice.toFixed(2)} (${deal.discount}% OFF)</span>
        <span style="color: ${isLowStock ? '#f59e0b' : '#10b981'}">
          📦 ${deal.stockAvailable}/${deal.stockTotal} restantes
        </span>
        <span style="color: ${isExpired ? '#ef4444' : '#64748b'}">
          📅 ${isExpired ? 'Expirado' : 'Até ' + expiresAt.toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
    <div class="deal-item-actions">
      <button class="btn-icon" onclick="toggleDealStatus('${deal.id}', ${deal.stockAvailable})" 
              title="${isPaused ? 'Ativar' : 'Pausar'}">
        ${isPaused ? '▶️ Ativar' : '⏸️ Pausar'}
      </button>
      <button class="btn-icon" onclick="deleteDeal('${deal.id}', '${deal.title.replace(/'/g, "\\'")}')" 
              style="color: #ef4444;" title="Deletar">
        🗑️ Deletar
      </button>
    </div>
  `;

  return item;
}

window.reactivateExpiredDeal = async function (dealId) {
  try {
    if (!confirm('Deseja reativar esta oferta expirada?\n\nSerá necessário definir uma nova data de validade.')) {
      return;
    }

    const newExpiryDate = prompt('Digite a nova data de validade (YYYY-MM-DD):');
    if (!newExpiryDate) return;

    const newExpiresAt = validateExpiryDate(newExpiryDate);

    const dealRef = doc(db, 'deals', dealId);
    await updateDoc(dealRef, {
      status: 'active',
      expiresAt: Timestamp.fromDate(newExpiresAt),
      stockAvailable: dealData.stockTotal,
      updatedAt: Timestamp.now()
    });

    showNotification('success', '✅ Oferta reativada com sucesso!');

    const merchantId = auth.currentUser?.uid;
    await loadMerchantDeals(merchantId);

  } catch (error) {
    console.error('❌ Erro ao reativar oferta:', error);
    showNotification('error', '❌ Erro ao reativar oferta');
  }
};

// ========== FUNÇÕES AUXILIARES ==========

function getElement(id, fieldName) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`❌ Campo "${fieldName}" (ID: ${id}) não encontrado no HTML. Verifique se o elemento existe.`);
  }
  return element;
}

function getInputValue(id, fieldName, required = true) {
  const element = getElement(id, fieldName);
  const value = element.value.trim();

  if (required && !value) {
    throw new Error(`❌ Campo "${fieldName}" é obrigatório.`);
  }

  return value;
}

function getNumberValue(id, fieldName, required = true, min = 0) {
  const value = getInputValue(id, fieldName, required);

  if (value === '' && !required) {
    return 0;
  }

  const number = parseFloat(value);

  if (isNaN(number)) {
    throw new Error(`❌ Campo "${fieldName}" deve ser um número válido.`);
  }

  if (number < min) {
    throw new Error(`❌ Campo "${fieldName}" deve ser no mínimo ${min}.`);
  }

  return number;
}

function getSelectValue(id, fieldName, required = true) {
  const element = getElement(id, fieldName);
  const value = element.value;

  if (required && !value) {
    throw new Error(`❌ Selecione uma opção para "${fieldName}".`);
  }

  return value;
}

function validateExpiryDate(dateString) {
  if (!dateString) {
    throw new Error('❌ Data de validade é obrigatória.');
  }

  console.log(`validateExpiryDate. dateString: ${dateString}`);

  const expiresAt = new Date(dateString + 'T00:00:00');

  if (isNaN(expiresAt.getTime())) {
    throw new Error('❌ Data de validade inválida.');
  }

  expiresAt.setHours(23, 59, 59, 999);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiresDateOnly = new Date(expiresAt);
  expiresDateOnly.setHours(0, 0, 0, 0);

  console.log(`expiresDateOnly: ${expiresDateOnly}, today: ${today}`);
  console.log('expiresDateOnly timestamp:', expiresDateOnly.getTime());
  console.log('today timestamp:', today.getTime());

  if (expiresDateOnly.getTime() < today.getTime()) {
    console.log(`expiresDateOnly: ${expiresDateOnly}, today: ${today}`);
    const diffDays = (today.getTime() - expiresDateOnly.getTime()) / (1000 * 60 * 60 * 24);
    console.log(`Diferença: ${diffDays} dias`);
    throw new Error('❌ Data de validade não pode ser no passado.');
  }

  return expiresAt;
}

function validatePrices(originalPrice, dealPrice) {
  if (originalPrice <= 0) {
    throw new Error('❌ Preço original deve ser maior que zero.');
  }

  if (dealPrice <= 0) {
    throw new Error('❌ Preço com desconto deve ser maior que zero.');
  }

  if (dealPrice >= originalPrice) {
    throw new Error('❌ Preço com desconto deve ser menor que o preço original.');
  }
}

// ========== CRIAÇÃO DE OFERTA ==========

let isCreatingDeal = false;

// Criar nova oferta
async function createDeal() {
  try {
    if (isCreatingDeal) return;
    isCreatingDeal = true;

    console.log('🔄 Iniciando criação de oferta...');

    // 1. Verificar autenticação
    const merchantId = auth.currentUser?.uid;
    if (!merchantId) {
      throw new Error('Você precisa estar logado para criar ofertas.');
    }

    // 2. Buscar dados do merchant (com localização)
    console.log('🔍 Buscando dados do lojista...');
    const merchantData = await getMerchantData(merchantId);

    if (!merchantData.location || !merchantData.location.latitude) {
      throw new Error('❌ Localização do estabelecimento não configurada. Atualize seu cadastro primeiro.');
    }

    // 3. Coletar dados da oferta
    const title = getInputValue('deal-title', 'Título da oferta');
    const description = getInputValue('deal-description', 'Descrição');
    const originalPrice = getNumberValue('deal-original-price', 'Preço original', true, 0.01);
    const dealPrice = getNumberValue('deal-price', 'Preço com desconto', true, 0.01);
    const stock = getNumberValue('deal-stock', 'Estoque', true, 1);
    const category = getSelectValue('deal-category', 'Categoria');

    // 4. Validações de preço
    validatePrices(originalPrice, dealPrice);

    // 5. Data de expiração
    const expiresDate = getInputValue('deal-expires', 'Data de validade');
    const expiresAt = validateExpiryDate(expiresDate);

    // 6. Imagem (opcional)
    let imageUrl = await getDealImage();

    if (!imageUrl) {
      imageUrl = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&h=300&fit=crop';
    }

    // 7. Usar localização do merchant
    const merchantLocation = merchantData.location;

    // 8. Calcular desconto
    const discount = Math.round(((originalPrice - dealPrice) / originalPrice) * 100);

    // 9. Montar dados da oferta (SIMPLIFICADO - sem campos de localização no form)
    const dealData = {
      // Dados básicos
      title,
      description,
      originalPrice,
      dealPrice,
      discount,
      stockTotal: stock,
      stockAvailable: stock,
      category,

      // Referência ao merchant
      merchantId,
      merchantName: merchantData.tradingName || merchantData.businessName,
      merchantCategory: merchantData.category,
      merchantPhone: merchantData.phone,

      // Localização REUTILIZADA do merchant (SEMPRE a mesma)
      merchantLocation: {
        // Dados completos do endereço
        address: merchantLocation.address,
        number: merchantLocation.number,
        complement: merchantLocation.complement || '',
        neighborhood: merchantLocation.neighborhood,
        city: merchantLocation.city,
        state: merchantLocation.state,
        cep: merchantLocation.cep,
        fullAddress: merchantLocation.fullAddress || `${merchantLocation.address}, ${merchantLocation.number} - ${merchantLocation.neighborhood}, ${merchantLocation.city} - ${merchantLocation.state}`,

        // Coordenadas (já calculadas no cadastro)
        latitude: merchantLocation.latitude,
        longitude: merchantLocation.longitude,
        geohash: merchantLocation.geohash,

        // Configurações de entrega
        deliveryRadius: merchantLocation.deliveryRadius || 5,
        deliveryOptions: merchantLocation.deliveryOptions || ['pickup']
      },

      // Dados da oferta
      imageUrl,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now(),
      status: 'active',
      views: 0,
      couponsGenerated: 0,
      couponsRedeemed: 0,
      revenueGenerated: 0
    };

    console.log('📝 Dados da oferta:', dealData);

    // 10. Salvar no Firebase
    console.log('💾 Salvando oferta...');
    const docRef = await addDoc(collection(db, 'deals'), dealData);

    console.log('✅ Oferta criada com ID:', docRef.id);
    showNotification('success', '🎉 Oferta criada com sucesso!');

    // 11. Limpar formulário
    resetDealForm();

    // 12. Voltar para lista e recarregar
    showView('deals');
    await loadMerchantDeals(merchantId);

  } catch (error) {
    console.error('❌ Erro ao criar oferta:', error);
    showNotification('error', error.message);
  } finally {
    isCreatingDeal = false;
  }
}

// Obter imagem da oferta
async function getDealImage() {
  try {
    // Tenta pegar da URL primeiro
    const urlValue = getInputValue('deal-image-url', 'URL da imagem', false);
    if (urlValue && isValidUrl(urlValue)) {
      return urlValue;
    }
  } catch (error) {
    // Se não tem URL, verifica arquivo
    try {
      const imageFile = getElement('deal-image-file', 'Arquivo de imagem');
      if (imageFile.files && imageFile.files[0]) {
        return await uploadImageToStorage(imageFile.files[0], auth.currentUser?.uid);
      }
    } catch (uploadError) {
      console.log('📷 Nenhuma imagem fornecida');
    }
  }
  return '';
}

// Resetar formulário
function resetDealForm() {
  try {
    const form = getElement('deal-form', 'Formulário');
    form.reset();

    // Limpar preview de imagem
    const imagePreview = document.getElementById('image-preview');
    if (imagePreview) imagePreview.style.display = 'none';

    const uploadContainer = document.getElementById('upload-container');
    if (uploadContainer) uploadContainer.style.display = 'block';

    // Limpar URL da imagem
    const imageUrlInput = document.getElementById('deal-image-url');
    if (imageUrlInput) imageUrlInput.value = '';

  } catch (error) {
    console.warn('⚠️ Não foi possível limpar o formulário:', error.message);
  }
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// ========== FUNÇÕES DE SUPORTE ==========

async function uploadImageToStorage(file, merchantId) {
  // Em produção, implemente com Firebase Storage
  return new Promise((resolve) => {
    setTimeout(() => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    }, 500);
  });
}

function showNotification(type, message) {
  const existing = document.querySelector('.deal-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `deal-notification deal-notification-${type}`;
  notification.textContent = message;

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};
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

// ========== CONECTA EVENTO DE SUBMIT ==========

export function setupDealForm() {
  try {
    const form = getElement('deal-form', 'Formulário de oferta');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await createDeal();
    });
    console.log('✅ Formulário de oferta configurado.');
  } catch (error) {
    console.warn('⚠️ Formulário de oferta não encontrado:', error.message);
  }
}

// Quando a view de criar oferta for carregada, atualize as informações do merchant
document.addEventListener('DOMContentLoaded', function () {
  // Observar quando a view de criar oferta for mostrada
  const observer = new MutationObserver(() => {
    const createDealView = document.getElementById('view-create-deal');
    if (createDealView && createDealView.classList.contains('active')) {
      // Atualizar informações do merchant se disponíveis
      if (window.currentMerchant) {
        updateMerchantUI(window.currentMerchant);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});

// ========== FUNÇÕES GLOBAIS ==========

window.editDeal = async function (dealId) {
  alert('Função de edição em desenvolvimento. Deal ID: ' + dealId);
};

window.toggleDealStatus = async function (dealId, currentStock) {
  try {
    // Buscar a oferta atual para saber o estoque total
    const dealRef = doc(db, 'deals', dealId);
    const dealSnap = await getDoc(dealRef);

    if (!dealSnap.exists()) {
      throw new Error('Oferta não encontrada');
    }

    const dealData = dealSnap.data();
    const isActive = dealData.status === 'active';
    const actionVerb = isActive ? 'pausar' : 'ativar';
    const actionPast = isActive ? 'pausada' : 'ativada';
    const confirmationMsg = isActive
      ? 'Ao pausar, a oferta não será mais visível para os clientes.\nTem certeza que deseja pausar esta oferta?'
      : 'Ao ativar, a oferta ficará visível para os clientes.\nTem certeza que deseja ativar esta oferta?';

    if (!confirm(confirmationMsg)) {
      return;
    }

    // Determinar novo status e estoque
    const newStatus = isActive ? 'paused' : 'active';
    const newStock = isActive ? 0 : dealData.stockTotal;

    await updateDoc(dealRef, {
      status: newStatus,
      stockAvailable: newStock,
      updatedAt: Timestamp.now()
    });

    console.log(`✅ Oferta ${actionPast} com sucesso!`);

    // Mensagem mais amigável
    const successMsg = isActive
      ? '⏸️ Oferta pausada com sucesso!\n\nEla não será mais visível para os clientes até ser ativada novamente.'
      : '▶️ Oferta ativada com sucesso!\n\nEla está agora visível para os clientes dentro do raio de atendimento.';

    showNotification('success', successMsg);

    // Recarregar ofertas
    const merchantId = auth.currentUser?.uid;
    await loadMerchantDeals(merchantId);

  } catch (error) {
    console.error('❌ Erro:', error);

    // Mensagem de erro mais específica
    let errorMsg = '❌ Erro ao alterar status da oferta';
    if (error.message.includes('permission')) {
      errorMsg = '❌ Permissão negada. Você não tem permissão para modificar esta oferta.';
    } else if (error.message.includes('network')) {
      errorMsg = '❌ Erro de conexão. Verifique sua internet e tente novamente.';
    }

    showNotification('error', errorMsg);
  }
};

window.deleteDeal = async function (dealId, dealTitle) {
  try {
    if (!confirm(`Tem certeza que deseja DELETAR "${dealTitle}"?\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }

    await deleteDoc(doc(db, 'deals', dealId));

    console.log('✅ Oferta deletada');
    alert('✅ Oferta deletada!');

    const merchantId = auth.currentUser?.uid;
    await loadMerchantDeals(merchantId);

  } catch (error) {
    console.error('❌ Erro:', error);
    alert('❌ Erro ao deletar');
  }
};