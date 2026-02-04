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
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

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

  const stockDisplay = deal.isUnlimited
    ? `<span class="stock-unlimited">♾️ Estoque Ilimitado</span>`
    : `📦 ${deal.stockAvailable || 0}/${deal.stockTotal || 0} restantes`;

  const dateDisplay = deal.isUnlimited
    ? `<span class="badge-permanent">♾️ Oferta por tempo indeterminado</span>`
    : `📅 ${isExpired ? 'Expirado' : 'Até ' + expiresAt.toLocaleDateString('pt-BR')}`;

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
          <div class="deal-stock">${stockDisplay}</div>
        </span>
        <span style="color: ${isExpired ? '#ef4444' : '#64748b'}">
          <div class="deal-validity">${dateDisplay}</div>
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

    const selectConcierge = document.getElementById('select-lojista');

    const merchantIdFinal = (selectConcierge.value) ? selectConcierge.value : auth.currentUser?.uid;
    // 1. Verificar autenticação
    /*
    const merchantId = auth.currentUser?.uid;
    */
    const merchantId = merchantIdFinal;
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
    const category = getSelectValue('deal-category', 'Categoria');
    //const stock = getNumberValue('deal-stock', 'Estoque', true, 1);
    const isUnlimited = document.getElementById('unlimited-stock').checked;
    const stock = isUnlimited ? 999999 : parseInt(document.getElementById('deal-stock').value);

    // 4. Validações de preço
    validatePrices(originalPrice, dealPrice);

    // 5. Data de expiração
    const expiresDate = getInputValue('deal-expires', 'Data de validade');
    const expiresAt = validateExpiryDate(expiresDate);

    // 6. Imagem (opcional)
    let imageUrl = await getDealImage();

    if (!imageUrl) {
      imageUrl = '/public/assets/img-ind.png';
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
      isUnlimited: isUnlimited,
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
    window.closePreview();
    window.resetDealForm();

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

function showView(viewId) { }

async function handleFileUpload(blob) {
  const fileName = `deals/${auth.currentUser.uid}/${Date.now()}.jpg`;
  const storageRef = ref(storage, fileName);

  const metadata = {
    contentType: 'image/jpeg'
  };

  const snapshot = await uploadBytes(storageRef, blob, metadata);
  return await getDownloadURL(snapshot.ref);
}

// Função simples para comprimir a imagem
async function compressImage(file) {
  if (!file) return null;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Tamanho ideal para web
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.7); // 70% de qualidade é perfeito
      };
    };
  });
}

// Obter imagem da oferta
async function getDealImage() {
  try {
    // Tenta pegar da URL primeiro
    const urlInput = document.getElementById('deal-image-url');
    if (urlInput && urlInput.value.trim()) {
      const urlValue = urlInput.value.trim();
      if (isValidUrl(urlValue)) {
        return urlValue;
      } else {
        console.warn('⚠️ URL de imagem inválida:', urlValue);
      }
    }
  } catch (error) {
    console.warn('⚠️ Erro ao processar URL da imagem:', error.message);
  }

  // No momento de criar a oferta (dentro do seu createDeal)
  const imageInput = document.getElementById('deal-image-input');

  const imageFile = imageInput ? imageInput.files[0] : null; // Pega o arquivo se existir
  let imageUrl = '';

  if (imageFile) {
    try {
      console.log("📸 Processando imagem...");
      // 1. Comprime a imagem (opcional, mas bom)
      const compressedFile = await compressImage(imageFile);

      // 2. Faz o upload com o metadata correto (JPG)
      imageUrl = await handleFileUpload(compressedFile);
      console.log("✅ Imagem pronta:", imageUrl);
    } catch (error) {
      console.error("⚠️ Falha na imagem, usando padrão:", error);
      imageUrl = '/public/assets/img-ind.png';
    }
  } else {
    // Se o lojista não tirou foto, usa a padrão sem dar erro
    imageUrl = '/public/assets/img-ind.png';
    console.log('📷 Nenhuma imagem fornecida, usando imagem padrão');
  }

  return imageUrl;
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

    const previewContainer = document.getElementById('preview-card-container');
    if (previewContainer) previewContainer.innerHTML = "";

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
  return new Promise((resolve, reject) => {
    try {
      // Para DEMONSTRAÇÃO: Cria um URL local temporário
      // Em produção, substitua por upload real para Firebase Storage
      console.log('📤 Simulando upload de imagem:', file.name, file.size);

      // Cria um URL local para a imagem
      const reader = new FileReader();
      reader.onload = (e) => {
        console.log('✅ Imagem convertida para base64');

        // Em produção:
        // 1. Fazer upload para Firebase Storage
        // 2. Obter URL de download
        // 3. Retornar URL real

        // Por enquanto, retornamos um placeholder ou URL local
        resolve(e.target.result); // base64 data URL
      };

      reader.onerror = (error) => {
        console.error('❌ Erro ao ler arquivo:', error);
        reject(error);
      };

      reader.readAsDataURL(file);

      // Simula tempo de upload
      setTimeout(() => {
        console.log('⏱️ Upload simulado concluído');
      }, 1000);

    } catch (error) {
      console.error('❌ Erro no upload de imagem:', error);
      reject(error);
    }
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

window.resetDealForm = function () {
  if (confirm('Deseja descartar as alterações desta oferta?')) {
    const form = document.getElementById('deal-form');
    if (form) form.reset();

    // Limpa o badge de desconto (se for span ou input)
    const discountField = document.getElementById('deal-discount');
    if (discountField) {
      discountField.value = '';
      discountField.textContent = '0%';
    }

    showView('deals'); // Volta para a lista de ofertas
  }
};

let isPreviewLoading = false;

window.openDealPreview = function () {
  if (isPreviewLoading) return;
  isPreviewLoading = true;

  try {
    console.log('🔍 Iniciando Preview Seguro...');

    const title = document.getElementById('deal-title').value || 'Título da Oferta';
    const description = document.getElementById('deal-description').value || 'Descrição da oferta...';
    const priceOld = parseFloat(document.getElementById('deal-original-price').value) || 0;
    const priceNew = parseFloat(document.getElementById('deal-price').value) || 0;
    // Dentro de openDealPreview no deals.js
    const discountVal = document.getElementById('deal-discount').value || '0';
    const discountDisplay = discountVal.includes('%') ? discountVal : `${parseFloat(discountVal).toFixed(0)}%`;

    const imgUrl = document.getElementById('deal-image-url').value.trim();

    // 2. Imagem de segurança (Indisponivel)
    const finalImg = imgUrl ? imgUrl : '/public/assets/img-ind.png';

    const previewContainer = document.getElementById('preview-card-container');

    // 3. HTML com o Estilo do deals_public.js (Injetando CSS direto para evitar conflito)
    previewContainer.innerHTML = `
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; font-family: 'Inter', sans-serif;">
            <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); max-width: 340px; margin: 0 auto;">
                
                <div style="position: relative; height: 180px; background: #eee;">
                    <img src="${finalImg}" style="width: 100%; height: 100%; object-fit: cover;" 
                         onerror="this.onerror=null; this.src='/public/assets/icons/icon-192.png';">
                    <div style="position: absolute; top: 12px; right: 12px; background: #ff5722; color: white; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                        ${discountDisplay}
                    </div>
                </div>

                <div style="padding: 16px; text-align: left;">
                    <div style="display: flex; align-items: center; gap: 5px; color: #2196F3; font-weight: bold; font-size: 12px; margin-bottom: 8px;">
                        <span>🏢</span> ${window.currentMerchant?.tradingName || 'Sua Loja'}
                    </div>
                    
                    <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e293b;">${title}</h3>
                    <p style="font-size: 14px; color: #64748b; line-height: 1.4; margin-bottom: 16px;">${description}</p>

                    <div style="display: flex; flex-direction: column;">
                        <span style="text-decoration: line-through; color: #94a3b8; font-size: 14px;">De R$ ${priceOld.toFixed(2)}</span>
                        <span style="font-size: 24px; font-weight: bold; color: #2196F3;">Por R$ ${priceNew.toFixed(2)}</span>
                    </div>

                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b;">
                        <p style="margin-bottom: 4px;">🕒 <strong>Horário:</strong> ${window.currentMerchant?.businessHours || 'Não informado'}</p>
                        <p>📍 <strong>Local:</strong> ${window.currentMerchant?.location?.address || 'Endereço cadastrado'}, ${window.currentMerchant?.location?.number || ''}</p>
                    </div>
                </div>
            </div>
            <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 15px;">Visualização modo cliente</p>
        </div>
    `;

    // 4. Abrir Modal
    const modal = document.getElementById('preview-modal');
    if (modal) modal.classList.remove('hidden');

  } catch (error) {
    console.error('❌ Erro ao gerar preview:', error);
  } finally {
    // Libera para o próximo clique
    isPreviewLoading = false;
  }
};

// ========== CONECTA EVENTO DE SUBMIT ==========

export function setupDealForm() {
  try {
    const form = getElement('deal-form', 'Formulário de oferta');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await createDeal();
    });
    console.log('✅ Formulário de oferta configurado.');

    const unlimitedCheckbox = document.getElementById('unlimited-stock');
    const stockInput = document.getElementById('deal-stock');

    if (unlimitedCheckbox && stockInput) {
      unlimitedCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          stockInput.value = 999999;
          stockInput.disabled = true;
          stockInput.style.opacity = "0.5";
          stockInput.removeAttribute('required');
        } else {
          stockInput.value = "";
          stockInput.disabled = false;
          stockInput.style.opacity = "1";
          stockInput.setAttribute('required', '');
        }
      });
    }

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

// 1. Função para Fechar o Modal (Visualização)
window.closePreview = function () {
  const modal = document.getElementById('preview-modal');
  if (modal) {
    modal.classList.add('hidden');
    console.log('🙈 Preview fechado');
  }
};

// 2. Função para Cancelar/Resetar
window.resetDealForm = function () {
  // Primeiro fecha a visualização se estiver aberta
  window.closePreview();

  const form = document.getElementById('deal-form');
  if (form) {
    form.reset();
    // Força a limpeza do campo de desconto
    const discountInput = document.getElementById('deal-discount');
    if (discountInput) discountInput.value = '';

    console.log('🧹 Formulário resetado');
    showView('deals'); // Volta para a listagem
  }
};