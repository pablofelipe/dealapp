import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Configurações do Radar
const getPreferredRadius = () => parseInt(localStorage.getItem('userRadius')) || 10;
const CATEGORY_EMOJIS = {
  butcher: '🥩', bakery: '🥖', 'home-gifts': '🏠', electronics: '💻',
  pharmacy: '💊', 'fruit-veg': '🍎', petshop: '🐾', pizzeria: '🍕',
  restaurant: '🍽️', services: '🛠️', supermarket: '🛒', clothing: '👕', other: '❓'
};

// Tradução dos IDs do banco para exibição ao público
const CATEGORY_LABELS = {
  butcher: 'Açougue',
  bakery: 'Padaria',
  'home-gifts': 'Casa & Presentes',
  electronics: 'Tecnologia',
  pharmacy: 'Farmácia',
  'fruit-veg': 'Hortifruti',
  petshop: 'Pet Shop',
  pizzeria: 'Pizzaria',
  restaurant: 'Restaurante',
  services: 'Serviços',
  supermarket: 'Supermercado',
  clothing: 'Moda & Vestuário',
  other: 'Outros'
};

const ALL_IDS = ['butcher', 'bakery', 'home-gifts', 'electronics', 'pharmacy', 'fruit-veg', 'petshop', 'pizzeria', 'restaurant', 'services', 'supermarket', 'clothing', 'other'];

const TIMEOUT_GPS = 5000; // 5 segundos para desistir do GPS

export async function loadNearbyDeals() {
  console.log('🚀 Iniciando loadNearbyDeals com filtros do usuário');
  const maxRadius = getPreferredRadius();
  let userInterests = localStorage.getItem('userInterests');

  if (!userInterests) {
    userInterests = ALL_IDS;
    localStorage.setItem('userInterests', JSON.stringify(userInterests));
  } else {
    userInterests = JSON.parse(userInterests);
  }

  // Limpa a lista atual para evitar duplicatas ao trocar de aba
  const dealsList = document.getElementById('deals-list');
  if (dealsList) dealsList.innerHTML = '';

  try {
    const position = await getCurrentLocation(TIMEOUT_GPS).catch(() => null);
    const dealsRef = collection(db, 'deals');
    const q = query(dealsRef, where('status', '==', 'active'), where('stockAvailable', '>', 0));
    const snapshot = await getDocs(q);

    let deals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) || [];

    // 1. Filtro de Validade (Mantendo sua lógica de Timezone Offset)
    deals = deals.filter(deal => {
      if (deal.isUnlimited) return true;
      if (!deal.expiresAt) return true;
      const nowUTC = new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60 * 1000));
      return deal.expiresAt.toDate() >= nowUTC;
    });

    // 2. Filtro de Interesses (Categorias)
    if (userInterests.length > 0) {
      deals = deals.filter(deal => userInterests.includes(deal.category));
    }

    // 3. Filtro de Distância Dinâmico
    if (position && deals.length > 0) {
      const { latitude, longitude } = position.coords;

      deals = deals.map(deal => {
        const loc = deal.merchantLocation || deal.location;
        if (!loc || !loc.latitude) return { ...deal, distance: 999 };

        const dist = calcularDistancia(latitude, longitude, loc.latitude, loc.longitude);
        return {
          ...deal,
          distance: dist,
          distanceText: dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`
        };
      }).filter(deal => deal.distance <= maxRadius); // Usa o raio do perfil aqui!

      //deals.sort((a, b) => a.distance - b.distance);

      // Ordena primariamente por data (mais nova primeiro)
      deals.sort((a, b) => {
        const dataA = a.createdAt?.toDate?.() || new Date(0);
        const dataB = b.createdAt?.toDate?.() || new Date(0);

        if (dataB - dataA !== 0) {
          return dataB - dataA; // Mais recente primeiro
        }
        // Se forem do mesmo segundo, desempata pela distância
        return a.distance - b.distance;
      });
    }

    renderDeals(deals);
  } catch (error) {
    console.error("❌ Erro crítico:", error);
    renderDeals([]);
  }
}

// Helper: Promessa de Localização com Timeout
function getCurrentLocation(timeout) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeout,
      maximumAge: 0
    });
  });
}

// Fórmula de Haversine para precisão matemática
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Renderizar lista de ofertas
 */
export function renderDeals(deals) {
  const dealsList = document.getElementById('deals-list');
  if (!dealsList) return;

  // Verifica se o usuário tem filtros de categoria ativos
  const savedInterests = JSON.parse(localStorage.getItem('userInterests') || '[]');
  const hasFilters = savedInterests.length > 0;

  // Proteção contra undefined ou lista vazia
  if (!deals || !Array.isArray(deals) || deals.length === 0) {

    // Mensagem personalizada dependendo do cenário
    let title = "Nada no Radar... ainda!";
    let message = "Ainda não encontramos ofertas nesta região.";
    let actionButton = '';

    if (hasFilters) {
      message = "Não encontramos ofertas nessas categorias. Que tal expandir sua busca?";
      actionButton = `<button onclick="window.clearFilters()" class="btn-outline">🧹 Limpar Filtros</button>`;
    } else {
      message = "Seja o primeiro a movimentar seu bairro! Indique sua loja favorita.";
      // Esse link abre o WhatsApp para o usuário mandar para o lojista ou para você
      actionButton = `<a href="https://wa.me/?text=Oi!%20Conheci%20o%20Radar%20da%20Oferta%20e%20queria%20ver%20sua%20loja%20lá.%20Cadastra%20aí:%20radardaoferta.com.br" target="_blank" class="btn-primary-small">📢 Indicar Comércio</a>`;
    }

    dealsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="empty-actions">
            ${actionButton}
            <button onclick="location.reload()" class="btn-text">🔄 Tentar atualizar</button>
        </div>
      </div>`;
    return;
  }

  // Se tiver ofertas, renderiza normalmente
  dealsList.innerHTML = ''; // Limpa antes de adicionar
  deals.forEach(deal => {
    const dealCard = createDealCard(deal);
    dealsList.appendChild(dealCard);
  });
}

// Pequena função auxiliar para o botão de limpar filtros funcionar
window.clearFilters = function () {
  localStorage.removeItem('userInterests');
  location.reload(); // Recarrega a página limpa
}
/**
 * Criar card de oferta
 */
function createDealCard(deal) {
  const card = document.createElement('div');
  card.className = 'deal-card';

  const options = deal.deliveryOptions || deal.merchantLocation?.deliveryOptions || [];

  const deliveryOptions = [];
  if (options.includes('pickup')) deliveryOptions.push('🏪 Retirada');
  if (options.includes('delivery')) deliveryOptions.push('🚚 Entrega');

  const stockDisplay = deal.isUnlimited
    ? `<span>♾️ Estoque Ilimitado</span>`
    : `<span>📦 ${deal.stockAvailable} disponíveis</span>`;

  const categoryName = CATEGORY_LABELS[deal.category] || deal.category;
  const categoryEmoji = CATEGORY_EMOJIS[deal.category] || '🏷️';

  card.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/300x200'}" alt="${deal.title}">
    <div class="deal-info">
      <div class="category-tag">
        <span class="category-icon">${categoryEmoji}</span>
        <span class="category-text">${categoryName}</span>
      </div>
      <h3>${deal.title}</h3>
      <p class="deal-description">${deal.description}</p>
      
      <div class="deal-location">
        <span class="distance-badge">📍 ${deal.distanceText ?? "Localização não definida"}</span>
        <span class="neighborhood">${deal.merchantLocation?.neighborhood || 'Localização'}</span>
      </div>
      
      <div class="deal-pricing">
        <span class="original-price">R$ ${deal.originalPrice.toFixed(2)}</span>
        <span class="deal-price">R$ ${deal.dealPrice.toFixed(2)}</span>
        <span class="discount-badge">${deal.discount}% OFF</span>
      </div>
      
      <div class="deal-stock">
        ${stockDisplay}
        ${deliveryOptions.length > 0 ? `<span>${deliveryOptions.join(' • ')}</span>` : ''}
      </div>
    </div>
  `;

  card.addEventListener('click', () => showDealModal(deal));
  return card;
}

/**
 * Mostrar modal com detalhes da oferta
 */
function showDealModal(deal) {
  const modal = document.getElementById('deal-modal');
  const details = document.getElementById('deal-details');

  if (!modal || !details) return;

  const deliveryInfo = [];
  if (deal.deliveryOptions?.includes('pickup')) deliveryInfo.push('Retirada no local');
  if (deal.deliveryOptions?.includes('delivery')) deliveryInfo.push('Entrega em domicílio');


  const stockDisplay = deal.isUnlimited
    ? `<span>♾️ Estoque Ilimitado</span>`
    : `<span>📦 Apenas ${deal.stockAvailable} unidades disponíveis</span>`;

  details.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/500x300'}" alt="${deal.title}">
    <h2>${deal.title}</h2>
    <div class="deal-location" style="margin-bottom: 16px;">
      <span class="distance-badge">📍 ${deal.distanceText ?? "Localização não definida"}</span>
      <span class="neighborhood">${deal.merchantLocation?.neighborhood || ''}</span>
    </div>
    <p style="margin-bottom: 16px;">${deal.description}</p>
    <div class="price-info" style="margin-bottom: 16px;">
      <span class="original" style="text-decoration: line-through; color: #94a3b8;">De R$ ${deal.originalPrice.toFixed(2)}</span>
      <span class="current" style="font-size: 28px; font-weight: bold; color: #2196F3;">Por R$ ${deal.dealPrice.toFixed(2)}</span>
      <span class="discount" style="background: #ff5722; color: white; padding: 4px 12px; border-radius: 6px; font-weight: bold;">${deal.discount}% OFF</span>
    </div>
    <p class="stock-info" style="color: #64748b; margin-bottom: 12px;">${stockDisplay}</p>
    ${deliveryInfo.length > 0 ? `<p style="color: #64748b; margin-bottom: 12px;">✅ ${deliveryInfo.join(' • ')}</p>` : ''}
    <p style="color: #64748b; font-size: 14px;">
      📍 ${deal.merchantLocation?.address ?
      `${deal.merchantLocation.address}${deal.merchantLocation?.number ? `, ${deal.merchantLocation.number}` : ''}${deal.merchantLocation?.complement ? ` - ${deal.merchantLocation.complement}` : ''} - ${deal.merchantLocation?.neighborhood || ''}, ${deal.merchantLocation?.city || ''} - ${deal.merchantLocation?.state || ''}` :
      'Ver localização no mapa'}
    </p>
</p>
  `;

  modal.classList.remove('hidden');

  const generateBtn = document.getElementById('generate-coupon-btn');
  if (generateBtn) {
    generateBtn.onclick = () => window.generateCouponFromModal(deal.id);
  }
}

// Exportar para uso global
window.showDealModal = showDealModal;
