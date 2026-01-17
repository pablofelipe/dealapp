import { db, auth } from './firebase-config.js';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  orderBy 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

// Gerar novo cupom (via Cloud Function)
export async function generateCoupon(dealId) {
  try {
    const functions = getFunctions();
    const generateCouponFn = httpsCallable(functions, 'generateCoupon');
    
    const result = await generateCouponFn({ dealId });
    
    if (result.data.success) {
      alert(`Cupom gerado com sucesso!\nCódigo: ${result.data.coupon.code}`);
      loadMyCoupons();
      if (window.closeModal) {
        window.closeModal();
      }
    } else {
      alert('Erro ao gerar cupom: ' + result.data.error);
    }
  } catch (error) {
    console.error('Erro:', error);
    alert('Erro ao gerar cupom. Tente novamente.');
  }
}

// Buscar cupons do usuário
export async function loadMyCoupons() {
  try {
    const user = auth.currentUser;
    if (!user) return;
    
    const couponsRef = collection(db, 'coupons');
    const q = query(
      couponsRef,
      where('userId', '==', user.uid),
      orderBy('generatedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const coupons = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    renderCoupons(coupons);
  } catch (error) {
    console.error('Erro ao carregar cupons:', error);
  }
}

function renderCoupons(coupons) {
  const couponsList = document.getElementById('coupons-list');
  couponsList.innerHTML = '';
  
  if (coupons.length === 0) {
    couponsList.innerHTML = '<p class="empty-state">Você ainda não tem cupons</p>';
    return;
  }
  
  coupons.forEach(coupon => {
    const couponCard = createCouponCard(coupon);
    couponsList.appendChild(couponCard);
  });
}

function createCouponCard(coupon) {
  const card = document.createElement('div');
  card.className = `coupon-card ${coupon.status}`;
  
  card.innerHTML = `
    <div class="coupon-code">${coupon.code}</div>
    <div class="coupon-status">${getStatusText(coupon.status)}</div>
    <div class="coupon-info">
      <p>Válido até: ${formatDate(coupon.expiresAt)}</p>
    </div>
  `;
  
  return card;
}

function getStatusText(status) {
  const statusMap = {
    'pending': 'Disponível',
    'redeemed': 'Utilizado',
    'expired': 'Expirado'
  };
  return statusMap[status] || status;
}

function formatDate(timestamp) {
  return new Date(timestamp.seconds * 1000).toLocaleDateString('pt-BR');
}
