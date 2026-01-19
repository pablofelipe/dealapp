import { db } from './firebase-config.js';
import { calculateDistance, formatDistance } from './utils.js';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Buscar ofertas próximas baseado na localização do usuário
 * @param {Object} userLocation - {latitude, longitude}
 * @param {number} maxDistance - Distância máxima em km
 */
export async function getNearbyDeals(userLocation, maxDistance = 10) {
  try {
    console.log('🔍 Buscando ofertas próximas:', userLocation);
    console.log('📏 Raio máximo:', maxDistance, 'km');
    
    const dealsRef = collection(db, 'deals');
    
    // Query básica - filtro de distância será no cliente
    const q = query(
      dealsRef,
      where('stockAvailable', '>', 0),
      limit(100)
    );
    
    const snapshot = await getDocs(q);
    console.log('📦 Total de deals no banco:', snapshot.size);
    
    const now = new Date();
    const dealsWithDistance = [];
    
    snapshot.docs.forEach(doc => {
      const deal = { id: doc.id, ...doc.data() };
      
      // Verificar se deal tem localização
      if (!deal.merchantLocation?.latitude || !deal.merchantLocation?.longitude) {
        console.warn('⚠️ Deal sem localização:', deal.id);
        return;
      }
      
      // Verificar expiração
      const expiresAt = deal.expiresAt?.toDate();
      if (expiresAt && expiresAt <= now) {
        return; // Deal expirado
      }
      
      // Calcular distância entre usuário e loja
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        deal.merchantLocation.latitude,
        deal.merchantLocation.longitude
      );
      
      console.log(`📍 ${deal.title}: ${distance.toFixed(2)}km (raio: ${deal.deliveryRadius}km)`);
      
      // Verificar se está dentro do raio de entrega da loja E do raio de busca do usuário
      if (distance <= deal.deliveryRadius && distance <= maxDistance) {
        dealsWithDistance.push({
          ...deal,
          distance,
          distanceText: formatDistance(distance)
        });
      }
    });
    
    // Ordenar por distância (mais próximo primeiro)
    dealsWithDistance.sort((a, b) => a.distance - b.distance);
    
    console.log('✅ Deals próximos encontrados:', dealsWithDistance.length);
    return dealsWithDistance;
    
  } catch (error) {
    console.error('❌ Erro ao buscar ofertas:', error);
    return [];
  }
}

/**
 * Renderizar lista de ofertas
 */
export function renderDeals(deals) {
  const dealsList = document.getElementById('deals-list');
  
  if (!dealsList) {
    console.error('Elemento deals-list não encontrado');
    return;
  }
  
  dealsList.innerHTML = '';
  
  if (deals.length === 0) {
    dealsList.innerHTML = `
      <div class="empty-state">
        <p style="font-size: 18px; margin-bottom: 12px;">📍 Nenhuma oferta disponível próxima a você</p>
        <p style="color: #64748b;">Tente aumentar o raio de busca ou explore outras regiões</p>
      </div>
    `;
    return;
  }
  
  deals.forEach(deal => {
    const dealCard = createDealCard(deal);
    dealsList.appendChild(dealCard);
  });
}

/**
 * Criar card de oferta
 */
function createDealCard(deal) {
  const card = document.createElement('div');
  card.className = 'deal-card';
  
  const deliveryOptions = [];
  if (deal.deliveryOptions?.includes('pickup')) deliveryOptions.push('🏪 Retirada');
  if (deal.deliveryOptions?.includes('delivery')) deliveryOptions.push('🚚 Entrega');
  
  card.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/300x200'}" alt="${deal.title}">
    <div class="deal-info">
      <h3>${deal.title}</h3>
      <p class="deal-description">${deal.description}</p>
      
      <div class="deal-location">
        <span class="distance-badge">📍 ${deal.distanceText}</span>
        <span class="neighborhood">${deal.merchantLocation?.neighborhood || 'Localização'}</span>
      </div>
      
      <div class="deal-pricing">
        <span class="original-price">R$ ${deal.originalPrice.toFixed(2)}</span>
        <span class="deal-price">R$ ${deal.dealPrice.toFixed(2)}</span>
        <span class="discount-badge">${deal.discount}% OFF</span>
      </div>
      
      <div class="deal-stock">
        <span>📦 ${deal.stockAvailable} disponíveis</span>
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
  
  details.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/500x300'}" alt="${deal.title}">
    <h2>${deal.title}</h2>
    <div class="deal-location" style="margin-bottom: 16px;">
      <span class="distance-badge">📍 ${deal.distanceText} de você</span>
      <span class="neighborhood">${deal.merchantLocation?.neighborhood || ''}</span>
    </div>
    <p style="margin-bottom: 16px;">${deal.description}</p>
    <div class="price-info" style="margin-bottom: 16px;">
      <span class="original" style="text-decoration: line-through; color: #94a3b8;">De R$ ${deal.originalPrice.toFixed(2)}</span>
      <span class="current" style="font-size: 28px; font-weight: bold; color: #2196F3;">Por R$ ${deal.dealPrice.toFixed(2)}</span>
      <span class="discount" style="background: #ff5722; color: white; padding: 4px 12px; border-radius: 6px; font-weight: bold;">${deal.discount}% OFF</span>
    </div>
    <p class="stock-info" style="color: #64748b; margin-bottom: 12px;">📦 Apenas ${deal.stockAvailable} unidades disponíveis</p>
    ${deliveryInfo.length > 0 ? `<p style="color: #64748b; margin-bottom: 12px;">✅ ${deliveryInfo.join(' • ')}</p>` : ''}
    <p style="color: #64748b; font-size: 14px;">📍 ${deal.merchantLocation?.address || 'Ver localização no mapa'}</p>
  `;
  
  modal.classList.remove('hidden');
  
  const generateBtn = document.getElementById('generate-coupon-btn');
  if (generateBtn) {
    generateBtn.onclick = () => window.generateCouponFromModal(deal.id);
  }
}

// Exportar para uso global
window.showDealModal = showDealModal;
