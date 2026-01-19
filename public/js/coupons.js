import { db, auth } from './firebase-config.js';
import { 
  collection, 
  addDoc,
  doc,
  getDoc,
  updateDoc,
  query, 
  where, 
  getDocs,
  orderBy,
  Timestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Gerar cupom para uma oferta
 */
export async function generateCoupon(dealId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      alert('Você precisa estar logado');
      return;
    }

    console.log('🎫 Gerando cupom para deal:', dealId);

    // Buscar deal
    const dealRef = doc(db, 'deals', dealId);
    const dealDoc = await getDoc(dealRef);

    if (!dealDoc.exists()) {
      alert('❌ Oferta não encontrada');
      return;
    }

    const deal = dealDoc.data();

    // Verificar estoque
    if (deal.stockAvailable <= 0) {
      alert('❌ Estoque esgotado');
      return;
    }

    // Verificar expiração
    if (deal.expiresAt.toDate() <= new Date()) {
      alert('❌ Oferta expirada');
      return;
    }

    // Gerar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Criar cupom
    const couponData = {
      code,
      dealId,
      userId: user.uid,
      status: 'pending',
      generatedAt: Timestamp.now(),
      expiresAt: deal.expiresAt,
      redeemedAt: null
    };

    const couponRef = await addDoc(collection(db, 'coupons'), couponData);

    // Decrementar estoque
    await updateDoc(dealRef, {
      stockAvailable: increment(-1)
    });

    alert(`✅ Cupom gerado com sucesso!\n\nCódigo: ${code}\n\nMostre este código ao estabelecimento.`);
    
    // Recarregar cupons
    await loadMyCoupons();
    closeModal();

    return {
      success: true,
      coupon: { id: couponRef.id, code, ...couponData }
    };

  } catch (error) {
    console.error('❌ Erro ao gerar cupom:', error);
    alert('❌ Erro ao gerar cupom: ' + error.message);
  }
}

// Função global para ser chamada pelo botão do modal
window.generateCouponFromModal = generateCoupon;

/**
 * Carregar cupons do usuário
 */
export async function loadMyCoupons() {
  try {
    const user = auth.currentUser;
    if (!user) return;
    
    const couponsRef = collection(db, 'coupons');
    const q = query(
      couponsRef,
      where('userId', '==', user.uid)
    );
    
    const snapshot = await getDocs(q);
    const coupons = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Ordenar por data (mais recente primeiro)
    coupons.sort((a, b) => {
      const dateA = a.generatedAt?.toDate() || new Date(0);
      const dateB = b.generatedAt?.toDate() || new Date(0);
      return dateB - dateA;
    });
    
    renderCoupons(coupons);
  } catch (error) {
    console.error('❌ Erro ao carregar cupons:', error);
  }
}

/**
 * Renderizar lista de cupons
 */
function renderCoupons(coupons) {
  const couponsList = document.getElementById('coupons-list');
  
  if (!couponsList) return;
  
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

/**
 * Criar card de cupom
 */
function createCouponCard(coupon) {
  const card = document.createElement('div');
  card.className = `coupon-card ${coupon.status}`;
  
  const expiresAt = coupon.expiresAt?.toDate();
  const isExpired = expiresAt && expiresAt < new Date();
  
  card.innerHTML = `
    <div class="coupon-code">${coupon.code}</div>
    <div class="coupon-status">${getStatusText(coupon.status)}</div>
    <div class="coupon-info">
      <p><strong>Gerado em:</strong> ${formatDate(coupon.generatedAt)}</p>
      <p><strong>Válido até:</strong> ${formatDate(coupon.expiresAt)}</p>
      ${coupon.status === 'redeemed' ? `<p><strong>Resgatado em:</strong> ${formatDate(coupon.redeemedAt)}</p>` : ''}
      ${isExpired ? '<p style="color: #ef4444; font-weight: bold;">⚠️ Cupom expirado</p>' : ''}
    </div>
  `;
  
  return card;
}

function getStatusText(status) {
  const statusMap = {
    'pending': '✅ Disponível',
    'redeemed': '✔️ Utilizado',
    'expired': '⏰ Expirado'
  };
  return statusMap[status] || status;
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function closeModal() {
  document.getElementById('deal-modal')?.classList.add('hidden');
}
