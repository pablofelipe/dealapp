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
  orderBy
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

    // Ordenar por data no cliente
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

  item.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/120'}" alt="${deal.title}">
    <div class="deal-item-content">
      <h3>${deal.title}</h3>
      <p style="color: #64748b; margin-bottom: 8px;">${deal.description}</p>
      <div style="color: #64748b; font-size: 13px; margin-bottom: 8px;">
        📍 ${deal.merchantLocation?.neighborhood || 'Sem localização'} 
        • Raio: ${deal.deliveryRadius || 0}km
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
      <button class="btn-icon" onclick="editDeal('${deal.id}')" title="Editar">
        ✏️ Editar
      </button>
      <button class="btn-icon" onclick="toggleDealStatus('${deal.id}', ${deal.stockAvailable})" title="Pausar/Ativar">
        ${deal.stockAvailable > 0 ? '⏸️ Pausar' : '▶️ Ativar'}
      </button>
      <button class="btn-icon" onclick="deleteDeal('${deal.id}', '${deal.title.replace(/'/g, "\\'")}')" 
              style="color: #ef4444;" title="Deletar">
        🗑️ Deletar
      </button>
    </div>
  `;

  return item;
}

// Setup do formulário
export function setupDealForm() {
  const form = document.getElementById('deal-form');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await createDeal();
  });
}

// Criar nova oferta
async function createDeal() {
  try {
    const merchantId = auth.currentUser?.uid;

    if (!merchantId) {
      alert('Você precisa estar logado');
      return;
    }

    // Coletar dados do formulário
    const title = document.getElementById('deal-title').value;
    const description = document.getElementById('deal-description').value;
    const originalPrice = parseFloat(document.getElementById('deal-original-price').value);
    const dealPrice = parseFloat(document.getElementById('deal-price').value);
    const stock = parseInt(document.getElementById('deal-stock').value);
    const category = document.getElementById('deal-category').value;
    const expiresDate = document.getElementById('deal-expires').value;
    const imageUrl = document.getElementById('deal-image').value;

    // Localização
    const address = document.getElementById('deal-address').value;
    const latitude = parseFloat(document.getElementById('deal-latitude').value);
    const longitude = parseFloat(document.getElementById('deal-longitude').value);
    const neighborhood = document.getElementById('deal-neighborhood').value;
    const deliveryRadius = parseFloat(document.getElementById('deal-radius').value);

    // Opções de entrega
    const hasPickup = document.getElementById('delivery-pickup').checked;
    const hasDelivery = document.getElementById('delivery-home').checked;

    // Validações
    if (dealPrice >= originalPrice) {
      alert('❌ O preço com desconto deve ser menor que o preço original');
      return;
    }

    if (!latitude || !longitude) {
      alert('❌ Busque as coordenadas do endereço primeiro');
      return;
    }

    if (!hasPickup && !hasDelivery) {
      alert('❌ Selecione pelo menos uma opção de entrega');
      return;
    }

    const expiresAt = new Date(expiresDate);
    if (expiresAt <= new Date()) {
      alert('❌ A data de validade deve ser no futuro');
      return;
    }

    // Calcular desconto
    const discount = Math.round(((originalPrice - dealPrice) / originalPrice) * 100);

    // Montar opções de entrega
    const deliveryOptions = [];
    if (hasPickup) deliveryOptions.push('pickup');
    if (hasDelivery) deliveryOptions.push('delivery');

    // Criar documento
    const dealData = {
      title,
      description,
      originalPrice,
      dealPrice,
      discount,
      stockTotal: stock,
      stockAvailable: stock,
      category,
      merchantId,
      merchantLocation: {
        latitude,
        longitude,
        address,
        neighborhood
      },
      deliveryRadius,
      deliveryOptions,
      imageUrl: imageUrl || 'https://via.placeholder.com/500',
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now()
    };

    console.log('📝 Criando oferta:', dealData);

    const docRef = await addDoc(collection(db, 'deals'), dealData);

    console.log('✅ Oferta criada com ID:', docRef.id);
    alert('✅ Oferta criada com sucesso!');

    // Limpar formulário
    document.getElementById('deal-form').reset();

    // Voltar para lista
    showView('deals');

    // Recarregar lista
    await loadMerchantDeals(merchantId);

  } catch (error) {
    console.error('❌ Erro ao criar oferta:', error);
    alert('❌ Erro ao criar oferta: ' + error.message);
  }
}

// Geocoding - Buscar coordenadas do endereço
window.getLocationFromAddress = async function () {
  const address = document.getElementById('deal-address').value;

  if (!address) {
    alert('❌ Digite um endereço primeiro');
    return;
  }

  try {
    console.log('📍 Buscando coordenadas para:', address);

    // Usar Nominatim (OpenStreetMap) - GRÁTIS
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=br&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DealApp/1.0'
      }
    });

    const data = await response.json();

    if (data.length > 0) {
      const location = data[0];

      console.log('✅ Localização encontrada:', location);

      // Preencher coordenadas
      document.getElementById('deal-latitude').value = location.lat;
      document.getElementById('deal-longitude').value = location.lon;

      // Tentar extrair bairro se ainda não preenchido
      const currentNeighborhood = document.getElementById('deal-neighborhood').value;
      if (!currentNeighborhood && location.address) {
        const neighborhood = location.address.suburb ||
          location.address.neighbourhood ||
          location.address.quarter ||
          location.address.district || '';

        if (neighborhood) {
          document.getElementById('deal-neighborhood').value = neighborhood;
        }
      }

      alert('✅ Coordenadas encontradas!\n\nLatitude: ' + location.lat + '\nLongitude: ' + location.lon);
    } else {
      alert('❌ Endereço não encontrado.\n\nVerifique se digitou corretamente:\n- Rua, número\n- Bairro\n- Cidade - Estado');
    }

  } catch (error) {
    console.error('❌ Erro ao buscar coordenadas:', error);
    alert('❌ Erro ao buscar coordenadas. Tente novamente.');
  }
};

// Editar oferta
window.editDeal = async function (dealId) {
  alert('Função de edição em desenvolvimento. Deal ID: ' + dealId);
};

// Pausar/Ativar oferta
window.toggleDealStatus = async function (dealId, currentStock) {
  try {
    const newStock = currentStock > 0 ? 0 : 1;
    const action = newStock > 0 ? 'ativar' : 'pausar';

    if (!confirm(`Tem certeza que deseja ${action} esta oferta?`)) {
      return;
    }

    const dealRef = doc(db, 'deals', dealId);
    await updateDoc(dealRef, {
      stockAvailable: newStock
    });

    console.log(`✅ Oferta ${action}da`);
    alert(`✅ Oferta ${action}da com sucesso!`);

    const merchantId = auth.currentUser?.uid;
    await loadMerchantDeals(merchantId);

  } catch (error) {
    console.error('❌ Erro:', error);
    alert('❌ Erro ao alterar status');
  }
};

// Deletar oferta
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


// Upload de Imagem
document.addEventListener('DOMContentLoaded', function () {
  const imageFileInput = document.getElementById('deal-image-file');
  const imageUrlInput = document.getElementById('deal-image-url');
  const imagePreview = document.getElementById('image-preview');
  const previewImage = document.getElementById('preview-image');
  const uploadContainer = document.getElementById('upload-container');
  const removeImageBtn = document.getElementById('remove-image-btn');
  const uploadStatus = document.getElementById('upload-status');

  let currentImageUrl = '';

  // Preview da imagem do arquivo
  if (imageFileInput) {
    imageFileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        // Verifica tamanho (máx 2MB)
        if (file.size > 2 * 1024 * 1024) {
          alert('A imagem deve ter no máximo 2MB');
          this.value = '';
          return;
        }

        // Verifica tipo
        if (!file.type.match('image.*')) {
          alert('Por favor, selecione apenas imagens');
          this.value = '';
          return;
        }

        // Mostra status de processamento
        uploadStatus.style.display = 'block';

        // Cria preview
        const reader = new FileReader();
        reader.onload = function (e) {
          // Simula upload (em produção, você enviaria para Firebase Storage)
          setTimeout(() => {
            currentImageUrl = e.target.result;
            previewImage.src = currentImageUrl;
            imagePreview.style.display = 'block';
            uploadContainer.style.display = 'none';
            uploadStatus.style.display = 'none';

            // Limpa campo URL
            if (imageUrlInput) imageUrlInput.value = '';
          }, 1000);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Preview da imagem via URL
  if (imageUrlInput) {
    imageUrlInput.addEventListener('blur', function () {
      const url = this.value.trim();
      if (url && isValidUrl(url)) {
        uploadStatus.style.display = 'block';

        // Testa se a URL é uma imagem válida
        const testImage = new Image();
        testImage.onload = function () {
          setTimeout(() => {
            currentImageUrl = url;
            previewImage.src = url;
            imagePreview.style.display = 'block';
            uploadContainer.style.display = 'none';
            uploadStatus.style.display = 'none';

            // Limpa campo arquivo
            if (imageFileInput) imageFileInput.value = '';
          }, 500);
        };
        testImage.onerror = function () {
          alert('URL da imagem inválida. Verifique o link.');
          uploadStatus.style.display = 'none';
        };
        testImage.src = url;
      }
    });
  }

  // Remove imagem
  if (removeImageBtn) {
    removeImageBtn.addEventListener('click', function () {
      currentImageUrl = '';
      imagePreview.src = '';
      imagePreview.style.display = 'none';
      uploadContainer.style.display = 'block';

      // Limpa campos
      if (imageFileInput) imageFileInput.value = '';
      if (imageUrlInput) imageUrlInput.value = '';
    });
  }

  // Valida URL
  function isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Atualiza cálculo de desconto
  const originalPriceInput = document.getElementById('deal-original-price');
  const priceInput = document.getElementById('deal-price');
  const discountInput = document.getElementById('deal-discount');

  function calculateDiscount() {
    if (originalPriceInput && priceInput && discountInput) {
      const original = parseFloat(originalPriceInput.value) || 0;
      const discounted = parseFloat(priceInput.value) || 0;

      if (original > 0 && discounted > 0) {
        const discount = ((original - discounted) / original) * 100;
        discountInput.value = discount.toFixed(0);
      } else {
        discountInput.value = '';
      }
    }
  }

  if (originalPriceInput && priceInput) {
    originalPriceInput.addEventListener('input', calculateDiscount);
    priceInput.addEventListener('input', calculateDiscount);
  }

  // Geocodificação automática do endereço
  const addressInput = document.getElementById('deal-address');
  const neighborhoodInput = document.getElementById('deal-neighborhood');

  if (addressInput) {
    let geocodeTimeout;

    addressInput.addEventListener('input', function () {
      clearTimeout(geocodeTimeout);

      // Espera o usuário parar de digitar (500ms)
      geocodeTimeout = setTimeout(async () => {
        const address = this.value.trim();
        if (address.length > 10) { // Mínimo de caracteres
          await geocodeAddress(address);
        }
      }, 500);
    });
  }

  // Função de geocodificação (usando Nominatim - OpenStreetMap)
  async function geocodeAddress(address) {
    try {
      console.log('Geocodificando endereço:', address);

      // Em produção, use Firebase Functions ou outro serviço
      // Esta é uma implementação básica com Nominatim
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`
      );

      if (response.ok) {
        const data = await response.json();

        if (data && data.length > 0) {
          const result = data[0];

          // Preenche bairro se disponível
          if (neighborhoodInput && !neighborhoodInput.value) {
            // Tenta extrair bairro do resultado
            const neighborhood = result.address.suburb ||
              result.address.neighbourhood ||
              result.address.city_district;

            if (neighborhood) {
              neighborhoodInput.value = neighborhood;
            }
          }

          // Aqui você poderia preencher campos ocultos com lat/long
          console.log('Coordenadas encontradas:', result.lat, result.lon);

          // Exemplo: Armazena em variáveis globais ou campos ocultos
          window.dealLatitude = parseFloat(result.lat);
          window.dealLongitude = parseFloat(result.lon);

          // Feedback visual
          showToast('📍 Endereço reconhecido com sucesso!', 'success');
        } else {
          showToast('⚠️ Endereço não encontrado. Verifique o formato.', 'warning');
        }
      }
    } catch (error) {
      console.error('Erro na geocodificação:', error);
      showToast('❌ Erro ao processar endereço. Tente novamente.', 'error');
    }
  }

  // Função auxiliar para mostrar toast
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};
            color: white;
            border-radius: 8px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Adiciona estilos CSS para animações
  const style = document.createElement('style');
  style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        .spinner-small {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
  document.head.appendChild(style);
});