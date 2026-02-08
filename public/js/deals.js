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
  adega: '🍷',
  butcher: '🥩',
  automotive: '🚗',
  drinks: '🥤',
  toys: '🧸',
  fitness: '🥣',
  frozen: '❄️',
  electronics: '💻',
  pharmacy: '💊',
  dairy: '🧀',
  florist: '🌻',
  cleaning: '🧼',
  hortifruti: '🥦',
  grocery: '🥫',
  bakery: '🥐',
  stationery: '📝',
  fishmonger: '🐟',
  petshop: '🐾',
  pizzeria: '🍕',
  restaurant: '🍽️',
  services: '🛠️',
  home_utilities: '🏠',
  clothing: '👕',
  other: '✨'
};

const CATEGORY_LABELS = {
  adega: 'Adega',
  butcher: 'Açougue',
  automotive: 'Automotivo',
  drinks: 'Bebidas',
  toys: 'Brinquedos',
  fitness: 'Cereais e Fitness',
  frozen: 'Congelados',
  electronics: 'Eletrônicos',
  pharmacy: 'Farmácia',
  dairy: 'Frios e Laticínios',
  florist: 'Floricultura',
  cleaning: 'Higiene e Limpeza',
  hortifruti: 'Hortifruti',
  grocery: 'Mercearia',
  bakery: 'Padaria/Confeitaria',
  stationery: 'Papelaria',
  fishmonger: 'Peixaria',
  petshop: 'Pet Shop',
  pizzeria: 'Pizzaria',
  restaurant: 'Restaurante',
  services: 'Serviços',
  home_utilities: 'Utilidades Domésticas',
  clothing: 'Vestuário',
  other: 'Outros'
};

const ALL_IDS = Object.keys(CATEGORY_LABELS);

const TIMEOUT_GPS = 5000; // 5 segundos para desistir do GPS

let allDeals = []; // Armazena todas as ofertas carregadas
let currentFilter = 'all'; // Filtro atual

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

  const dealsList = document.getElementById('deals-list');
  if (dealsList) dealsList.innerHTML = '';

  try {
    const position = await getCurrentLocation(TIMEOUT_GPS).catch(() => null);
    const dealsRef = collection(db, 'deals');
    const q = query(dealsRef, where('status', '==', 'active'), where('stockAvailable', '>', 0));
    const snapshot = await getDocs(q);

    let deals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) || [];

    // 1. Filtro de Validade
    deals = deals.filter(deal => {
      if (deal.isUnlimited) return true;
      if (!deal.expiresAt) return true;
      const nowUTC = new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60 * 1000));
      return deal.expiresAt.toDate() >= nowUTC;
    });

    // 2. Filtro de Interesses (Categorias do perfil)
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
      }).filter(deal => deal.distance <= maxRadius);

      deals.sort((a, b) => {
        const dataA = a.createdAt?.toDate?.() || new Date(0);
        const dataB = b.createdAt?.toDate?.() || new Date(0);

        if (dataB - dataA !== 0) {
          return dataB - dataA;
        }
        return a.distance - b.distance;
      });
    }

    console.log(`✅ Ofertas carregadas: ${deals.length} ofertas encontradas após aplicação de filtros`);

    // Armazena todas as ofertas para filtragem
    allDeals = deals;

    // Popula o dropdown de filtro
    populateCategoryFilter(deals);

    // Aplica filtros iniciais
    applyFilters();

  } catch (error) {
    console.error("❌ Erro crítico:", error);
    renderDeals([]);
  }
}

// Modifique a função renderDeals para mostrar o estado do filtro
export function renderDeals(deals) {
  const dealsList = document.getElementById('deals-list');
  if (!dealsList) return;

  const savedInterests = JSON.parse(localStorage.getItem('userInterests') || '[]');
  const hasFilters = savedInterests.length > 0;
  const filterSelect = document.getElementById('category-filter');
  const currentCategory = filterSelect ? filterSelect.options[filterSelect.selectedIndex].text : '';

  if (!deals || !Array.isArray(deals) || deals.length === 0) {
    let title = "Nada no Radar... ainda!";
    let message = "Ainda não encontramos ofertas nesta região.";
    let actionButton = '';

    if (currentFilter !== 'all') {
      title = `Nenhuma oferta encontrada`;
      message = `Não encontramos ofertas na categoria "${currentCategory.split(' ')[1] || currentFilter}".`;
      actionButton = `<button onclick="window.showAllCategories()" class="btn-outline">📂 Ver todas as categorias</button>`;
    } else if (hasFilters) {
      message = "Não encontramos ofertas nessas categorias. Que tal expandir sua busca?";
      actionButton = `<button onclick="window.clearFilters()" class="btn-outline">🧹 Limpar Filtros</button>`;
    } else {
      message = "Seja o primeiro a movimentar seu bairro! Indique sua loja favorita.";
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

  dealsList.innerHTML = "";

  deals.forEach(deal => {
    const dealCard = createDealCard(deal);
    dealsList.appendChild(dealCard);
  });
}

function extractUniqueCategories(deals) {
  const categories = new Set();
  deals.forEach(deal => {
    if (deal.category && CATEGORY_LABELS[deal.category]) {
      categories.add(deal.category);
    }
  });
  return Array.from(categories).sort((a, b) =>
    CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b])
  );
}

function populateCategoryFilter(deals) {
  const filterSelect = document.getElementById('category-filter');
  if (!filterSelect) return;

  // Limpa opções existentes (exceto "TODAS")
  while (filterSelect.options.length > 1) {
    filterSelect.remove(1);
  }

  const uniqueCategories = extractUniqueCategories(deals);

  // Adiciona cada categoria como opção
  uniqueCategories.forEach(categoryId => {
    const option = document.createElement('option');
    option.value = categoryId;
    option.textContent = `${CATEGORY_EMOJIS[categoryId] || '🏷️'} ${CATEGORY_LABELS[categoryId] || categoryId}`;
    filterSelect.appendChild(option);
  });

  // Adiciona evento de mudança
  filterSelect.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    applyFilters();
  });
}

// Adicione esta função para aplicar os filtros
function applyFilters() {
  let filteredDeals = [...allDeals];

  // Aplica filtro de categoria
  if (currentFilter !== 'all') {
    filteredDeals = filteredDeals.filter(deal => deal.category === currentFilter);
  }

  // Renderiza as ofertas filtradas
  renderDeals(filteredDeals);
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

  const precoOriginal = deal.originalPrice ? deal.originalPrice.toFixed(2) : "0.00";
  const precoOferta = deal.dealPrice ? deal.dealPrice.toFixed(2) : (deal.price ? deal.price.toFixed(2) : "0.00");

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
        <span class="original-price">R$ ${precoOriginal}</span>
        <span class="deal-price">R$ ${precoOferta}</span>
        <span class="discount-badge">${deal.discount || 0}% OFF</span>
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

  const precoOriginal = deal.originalPrice ? deal.originalPrice.toFixed(2) : "0.00";
  const precoOferta = deal.dealPrice ? deal.dealPrice.toFixed(2) : (deal.price ? deal.price.toFixed(2) : "0.00");

  details.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/500x300'}" alt="${deal.title}">
    <h2>${deal.title}</h2>
    <div class="deal-location" style="margin-bottom: 16px;">
      <span class="distance-badge">📍 ${deal.distanceText ?? "Localização não definida"}</span>
      <span class="neighborhood">${deal.merchantLocation?.neighborhood || ''}</span>
    </div>
    <p style="margin-bottom: 16px;">${deal.description}</p>
    <div class="price-info" style="margin-bottom: 16px;">
      <span class="original" style="text-decoration: line-through; color: #94a3b8;">De R$ ${precoOriginal}</span>
      <span class="current" style="font-size: 28px; font-weight: bold; color: #2196F3;">Por R$ ${precoOferta}</span>
      <span class="discount" style="background: #ff5722; color: white; padding: 4px 12px; border-radius: 6px; font-weight: bold;">${deal.discount || 0}% OFF</span>
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
