import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Configurações do Radar
const RAIO_MAXIMO_KM = 15; // Alcance do radar
const TIMEOUT_GPS = 5000; // 5 segundos para desistir do GPS

export async function loadNearbyDeals() {
  console.log('🚀 Iniciando loadNearbyDeals');
  showLoading(true);

  try {
    // 1. Tenta obter localização
    const position = await getCurrentLocation(TIMEOUT_GPS).catch(err => {
      console.warn("⚠️ GPS falhou ou expirou. Usando fallback.");
      return null;
    });

    const dealsRef = collection(db, 'deals');
    let q;

    // Lógica de Query
    if (position) {
      q = query(
        dealsRef,
        where('status', '==', 'active'));
    } else {
      q = query(
        dealsRef,
        where('status', '==', 'active')
      );
      console.log('🔍 Buscando todas as ofertas ativas (Fallback)');
    }

    const snapshot = await getDocs(q);

    let deals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) || [];

    deals = deals.filter(deal => {
      if (!deal.expiresAt) return true;

      try {
        // Converter Timestamp do Firestore para Date
        let expiresDate;
        if (deal.expiresAt.toDate) {
          expiresDate = deal.expiresAt.toDate();
        } else if (deal.expiresAt instanceof Date) {
          expiresDate = deal.expiresAt;
        } else {
          expiresDate = new Date(deal.expiresAt);
        }

        // Data atual
        const now = new Date();

        // ✅ CORREÇÃO: Usar timezone offset dinâmico
        // O Firestore Timestamp é em UTC, precisamos ajustar para o fuso local
        const timezoneOffsetMinutes = now.getTimezoneOffset();

        // Converter expiresDate (UTC) para horário local
        const expiresLocal = new Date(expiresDate.getTime() - (timezoneOffsetMinutes * 60 * 1000));

        // Converter now para UTC para comparação correta
        const nowUTC = new Date(now.getTime() + (timezoneOffsetMinutes * 60 * 1000));

        // Debug para verificar
        console.log(`📍 ${deal.title || deal.id}:`);
        console.log(`   expiresDate (UTC): ${expiresDate.toISOString()}`);
        console.log(`   expiresLocal: ${expiresLocal.toISOString()}`);
        console.log(`   nowUTC: ${nowUTC.toISOString()}`);
        console.log(`   timezoneOffset: ${timezoneOffsetMinutes}min`);
        console.log(`   válida? ${expiresDate >= nowUTC}`);

        // Comparar ambos em UTC
        return expiresDate >= nowUTC;

      } catch (e) {
        console.error(`❌ Erro ao verificar data da oferta ${deal.id}:`, e);
        return false;
      }
    });

    console.log(`✅ ${deals.length} ofertas válidas após filtro de data`);

    if (position && deals.length > 0) {
      const { latitude, longitude } = position.coords;

      deals = deals.map(deal => {

        const loc = deal.merchantLocation || deal.location;
        if (!loc || !loc.latitude) return { ...deal, distance: 999 };

        //console.log(`latitude: ${latitude}, longitude: ${longitude}, loc.latitude: ${loc.latitude}, loc.longitude: ${loc.longitude}`);

        console.log(`oferta: ${JSON.stringify(deal)}`);

        console.log(`position: ${JSON.stringify(position)}`);

        const dist = calcularDistancia(latitude, longitude, loc.latitude, loc.longitude);
        return {
          ...deal,
          distance: dist,
          distanceText: dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`
        };
      }).filter(deal => deal.distance <= RAIO_MAXIMO_KM);

      deals.sort((a, b) => a.distance - b.distance);
    }

    //console.log(`position: ${JSON.stringify(position)}`);

    console.log(`✅ ${deals.length} ofertas válidas após coordenadas`);

    // Só chama o render se deals for um array (mesmo que vazio)
    renderDeals(deals);

  } catch (error) {
    console.error("❌ Erro crítico:", error);
    renderDeals([]); // Mostra estado vazio em caso de erro
  } finally {
    showLoading(false);
  }
}

function showLoading(loading) { }

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

  // Proteção contra undefined ou null
  if (!deals || !Array.isArray(deals) || deals.length === 0) {
    dealsList.innerHTML = `
      <div class="empty-state">
        <p>📍 Nenhuma oferta encontrada nesta região.</p>
        <button onclick="location.reload()" class="btn-primary">Tentar Novamente</button>
      </div>`;
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

  console.log(`deal: ${Array.isArray(deal)}, deal.deliveryOptions: ${deal.deliveryOptions}`);

  const deliveryOptions = [];
  if (deal.deliveryOptions?.includes('pickup')) deliveryOptions.push('🏪 Retirada');
  if (deal.deliveryOptions?.includes('delivery')) deliveryOptions.push('🚚 Entrega');

  card.innerHTML = `
    <img src="${deal.imageUrl || 'https://via.placeholder.com/300x200'}" alt="${deal.title}">
    <div class="deal-info">
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
      <span class="distance-badge">📍 ${deal.distanceText ?? "Localização não definida"}</span>
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
