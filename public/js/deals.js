import { db } from './firebase-config.js';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  orderBy,
  limit 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { generateCoupon } from './coupons.js';

// Buscar ofertas disponíveis
export async function getAvailableDeals(condominiumId) {
  try {
	  
    const dealsRef = collection(db, 'deals');
    const q = query(
      dealsRef,
      where('condominiumId', '==', condominiumId),
      where('stockAvailable', '>', 0),
      where('expiresAt', '>', new Date()),
      orderBy('expiresAt', 'asc'),
      limit(50)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Erro ao buscar ofertas:', error);
    return [];
  }
}

// Renderizar ofertas na tela
export function renderDeals(deals) {
  const dealsList = document.getElementById('deals-list');
  dealsList.innerHTML = '';
  
  if (deals.length === 0) {
    dealsList.innerHTML = '<p class="empty-state">Nenhuma oferta disponível no momento</p>';
    return;
  }
  
  deals.forEach(deal => {
    const dealCard = createDealCard(deal);
    dealsList.appendChild(dealCard);
  });
}

function createDealCard(deal) {
  const card = document.createElement('div');
  card.className = 'deal-card';
  card.innerHTML = `
    <img src="${deal.imageUrl || '/assets/images/placeholder.png'}" alt="${deal.title}">
    <div class="deal-info">
      <h3>${deal.title}</h3>
      <p class="deal-description">${deal.description}</p>
      <div class="deal-pricing">
        <span class="original-price">R$ ${deal.originalPrice.toFixed(2)}</span>
        <span class="deal-price">R$ ${deal.dealPrice.toFixed(2)}</span>
        <span class="discount-badge">${deal.discount}% OFF</span>
      </div>
      <div class="deal-stock">
        <span>Restam ${deal.stockAvailable} unidades</span>
      </div>
    </div>
  `;
  
  card.addEventListener('click', () => showDealModal(deal));
  return card;
}

function showDealModal(deal) {
  const modal = document.getElementById('deal-modal');
  const details = document.getElementById('deal-details');
  
  details.innerHTML = `
    <img src="${deal.imageUrl || '/assets/images/placeholder.png'}" alt="${deal.title}">
    <h2>${deal.title}</h2>
    <p>${deal.description}</p>
    <div class="price-info">
      <span class="original">De R$ ${deal.originalPrice.toFixed(2)}</span>
      <span class="current">Por R$ ${deal.dealPrice.toFixed(2)}</span>
    </div>
    <p class="stock-info">Apenas ${deal.stockAvailable} unidades disponíveis</p>
  `;
  
  modal.classList.remove('hidden');
  
  const generateBtn = document.getElementById('generate-coupon-btn');
  generateBtn.onclick = () => generateCoupon(deal.id);
}

// Exportar para uso global
window.showDealModal = showDealModal;
