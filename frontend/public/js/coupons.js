import { db, auth } from './firebase-config.js';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const COUPON_ERROR_MESSAGES = {
  'failed-precondition': 'Esta oferta não está mais disponível (esgotada ou expirada).',
  'not-found': 'Oferta não encontrada.',
  'unauthenticated': 'Você precisa estar logado.',
};

function mapErrorToMessage(error) {
  return COUPON_ERROR_MESSAGES[error.code] || ('Erro ao gerar cupom: ' + error.message);
}

/**
 * Gerar cupom para uma oferta.
 * A validação de estoque/expiração e a baixa de estoque são feitas pela Cloud Function
 * `generateCoupon` (server-authoritative, transação atômica) - este arquivo só chama a função
 * e mostra o resultado.
 */
export async function generateCoupon(dealId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      alert('Você precisa estar logado');
      return;
    }

    console.log('🎫 Gerando cupom para deal:', dealId);

    const functions = getFunctions();
    const call = httpsCallable(functions, 'generateCoupon');
    const result = await call({ dealId });
    const { id, code } = result.data;

    alert(`✅ Cupom gerado com sucesso!\n\nCódigo: ${code}\n\nMostre este código ao estabelecimento.`);

    // Recarregar cupons
    await loadMyCoupons();
    closeModal();

    return { success: true, coupon: { id, code } };

  } catch (error) {
    console.error('❌ Erro ao gerar cupom:', error);
    alert('❌ ' + mapErrorToMessage(error));
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

    // Filtro de 3 dias para não poluir o MVP com itens muito antigos
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const couponsRef = collection(db, 'coupons');
    const q = query(couponsRef, where('userId', '==', user.uid));

    const snapshot = await getDocs(q);
    let coupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filtragem: Ativos sempre aparecem; Resgatados/Expirados só se forem recentes
    coupons = coupons.filter(c => {
      const status = getStatusLogic(c);
      if (status === 'active' || status === 'urgent') return true;
      const genDate = c.generatedAt?.toDate() || new Date(0);
      return genDate >= threeDaysAgo;
    });

    // Busca detalhes da oferta (merchantName e endereço)
    const couponsWithDetails = await Promise.all(coupons.map(async (coupon) => {
      const dealDoc = await getDoc(doc(db, 'deals', coupon.dealId));
      return {
        ...coupon,
        dealInfo: dealDoc.exists() ? dealDoc.data() : null
      };
    }));

    // Ordenação: Mais recentes primeiro
    couponsWithDetails.sort((a, b) => (b.generatedAt?.toDate() || 0) - (a.generatedAt?.toDate() || 0));

    renderCoupons(couponsWithDetails);
  } catch (error) {
    console.error('❌ Erro ao carregar cupons:', error);
  }
}

/**
 * Define o estado do cupom baseado em tempo e ação
 */
function getStatusLogic(coupon) {

  const now = new Date();
  const expiresDate = coupon.expiresAt?.toDate();

  if (expiresDate && expiresDate < now) return 'expired';

  if (coupon.status === 'redeemed') return 'redeemed';

  // Regra de Urgência: Faltam menos de 24 horas
  const diffInHours = (expiresDate - now) / (1000 * 60 * 60);
  if (diffInHours > 0 && diffInHours < 24) return 'urgent';

  return 'active';
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
 * Cria o card visual com foco na urgência e localização
 */
function createCouponCard(coupon) {
  const deal = coupon.dealInfo;
  const status = getStatusLogic(coupon);

  const card = document.createElement('div');
  card.className = `coupon-card status-${status}`;

  const statusLabels = {
    active: '✅ ATIVO',
    urgent: '⚠️ ÚLTIMA CHANCE',
    expired: '❌ EXPIRADO',
    redeemed: '✔️ UTILIZADO'
  };

  const addressHtml = deal?.merchantLocation ?
    `${deal.merchantLocation.address}${deal.merchantLocation.number ? `, ${deal.merchantLocation.number}` : ''}${deal.merchantLocation.complement ? ` - ${deal.merchantLocation.complement}` : ''}${deal.merchantLocation.neighborhood ? ` - ${deal.merchantLocation.neighborhood}` : ''}, ${deal.merchantLocation.city || ''} - ${deal.merchantLocation.state || ''}`
    : 'Endereço não disponível';

  card.innerHTML = `
    <div class="coupon-header">
      <div class="merchant-info">
        <span class="merchant-name">🏢 ${deal?.merchantName || 'Loja Local'}</span>
        <h2 class="product-title">${deal?.title || 'Oferta'}</h2>
      </div>
      ${deal?.businessHours ?
      `<div class="coupon-info-item">
        <span>🕒 Horário:</span>
        <strong>${deal.businessHours}</strong>
      </div>` : ''}
      <div class="status-badge badge-${status}">${statusLabels[status]}</div>
    </div>

    <div class="coupon-main">
      <div class="code-container">
        <span class="code-label">APRESENTE ESTE CÓDIGO NO CAIXA</span>
        <div class="code-value">${coupon.code}</div>
      </div>
    </div>

    <div class="coupon-details">
      <p class="address-text">📍 <strong>Local:</strong> ${addressHtml}</p>
      <div class="date-footer">
        <span class="${status === 'urgent' || status === 'expired' ? 'text-highlight' : ''}">
           🕒 Válido até: ${formatDate(coupon.expiresAt)}
        </span>
      </div>
      ${status === 'redeemed' ?
      `<div class="redeemed-note">✅ Resgatado em: ${formatDate(coupon.redeemedAt)}</div>` : ''}
    </div>
  `;

  return card;
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
