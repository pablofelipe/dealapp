import { db, functions, auth } from './firebase-config.js';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// Setup do validador de cupons
export function setupCouponValidation() {
  const validateBtn = document.getElementById('validate-btn');
  const couponInput = document.getElementById('coupon-code');

  if (!validateBtn || !couponInput) return;

  validateBtn.addEventListener('click', async () => {
    const code = couponInput.value.trim();

    if (code.length !== 6) {
      alert('⚠️ O código deve ter 6 dígitos');
      return;
    }

    await validateCoupon(code);
  });

  // Permitir validar com Enter
  couponInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      validateBtn.click();
    }
  });

  // Aceitar apenas números
  couponInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
  });
}

// Validar cupom
async function validateCoupon(code) {
  try {
    console.log('🔍 Validando cupom:', code);

    const resultDiv = document.getElementById('validation-result');
    resultDiv.innerHTML = '<p style="text-align: center;">🔄 Validando...</p>';
    resultDiv.classList.remove('hidden', 'success', 'error');

    // Buscar cupom no Firestore
    const couponsRef = collection(db, 'coupons');
    const q = query(couponsRef, where('code', '==', code));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      showValidationError('❌ Cupom não encontrado');
      return;
    }

    const couponDoc = snapshot.docs[0];
    const coupon = { id: couponDoc.id, ...couponDoc.data() };

    // Verificar status
    if (coupon.status === 'redeemed') {
      showValidationError('⚠️ Este cupom já foi utilizado');
      return;
    }

    if (coupon.status === 'expired') {
      showValidationError('⚠️ Este cupom está expirado');
      return;
    }

    // Verificar expiração
    const expiresAt = coupon.expiresAt?.toDate();
    if (expiresAt && expiresAt < new Date()) {
      showValidationError('⚠️ Este cupom expirou em ' + expiresAt.toLocaleDateString('pt-BR'));
      return;
    }

    // Buscar informações do deal
    const dealDoc = await getDoc(doc(db, 'deals', coupon.dealId));
    const deal = dealDoc.exists() ? dealDoc.data() : null;

    // Mostrar informações do cupom válido
    showValidationSuccess(coupon, deal);

  } catch (error) {
    console.error('❌ Erro ao validar cupom:', error);
    showValidationError('❌ Erro ao validar cupom: ' + error.message);
  }
}

function showValidationSuccess(coupon, deal) {
  const resultDiv = document.getElementById('validation-result');

  const savings = deal ? (deal.originalPrice - deal.dealPrice).toFixed(2) : '0.00';

  resultDiv.className = 'validation-result success';
  resultDiv.innerHTML = `
    <h2 style="color: #10b981; margin-bottom: 16px;">✅ Cupom Válido!</h2>
    
    ${deal ? `
      <div style="margin-bottom: 20px; padding: 16px; background: #f0fdf4; border-radius: 8px;">
        <h3 style="margin-bottom: 8px;">${deal.title}</h3>
        <p style="color: #64748b; margin-bottom: 12px;">${deal.description}</p>
        <div style="display: flex; gap: 16px; font-size: 14px;">
          <span>💰 Economia: <strong>R$ ${savings}</strong></span>
          <span>🏷️ De R$ ${deal.originalPrice.toFixed(2)} por R$ ${deal.dealPrice.toFixed(2)}</span>
        </div>
      </div>
    ` : ''}
    
    <div style="margin-bottom: 20px; padding: 16px; background: #f8fafc; border-radius: 8px;">
      <p style="margin-bottom: 8px;"><strong>Código:</strong> ${coupon.code}</p>
      <p style="margin-bottom: 8px;"><strong>Status:</strong> ${getStatusText(coupon.status)}</p>
      <p><strong>Válido até:</strong> ${coupon.expiresAt?.toDate().toLocaleDateString('pt-BR')}</p>
    </div>
    
    <button class="btn-primary btn-large" onclick="confirmRedemption('${coupon.id}', '${coupon.code}')">
      ✅ Confirmar Uso do Cupom
    </button>
  `;
}

function showValidationError(message) {
  const resultDiv = document.getElementById('validation-result');
  resultDiv.className = 'validation-result error';
  resultDiv.innerHTML = `
    <h2 style="color: #ef4444; margin-bottom: 16px;">${message}</h2>
    <p style="color: #64748b;">Verifique o código e tente novamente.</p>
  `;
}

function getStatusText(status) {
  const statusMap = {
    'pending': '✅ Disponível',
    'redeemed': '✔️ Utilizado',
    'expired': '⏰ Expirado'
  };
  return statusMap[status] || status;
}

const REDEEM_ERROR_MESSAGES = {
  'failed-precondition': 'Cupom já foi utilizado, expirado ou não confere com a oferta.',
  'not-found': 'Cupom não encontrado.',
  'permission-denied': 'Você não tem permissão para resgatar este cupom.',
  'unauthenticated': 'Você precisa estar logado.',
};

function mapRedeemErrorToMessage(error) {
  return REDEEM_ERROR_MESSAGES[error.code] || 'Erro ao resgatar cupom. Tente novamente.';
}

// Confirmar resgate do cupom. A validação (status/expiração/permissão) e a atualização atômica
// de coupons + users são feitas pela Cloud Function `redeemCoupon` (server-authoritative).
window.confirmRedemption = async function (couponId, couponCode) {
  try {
    if (!confirm(`Confirmar o uso do cupom ${couponCode}?`)) {
      return;
    }

    console.log('🎫 Resgatando cupom:', couponCode);

    const redeemCoupon = httpsCallable(functions, 'redeemCoupon');
    const result = await redeemCoupon({ couponId, couponCode });
    const savings = result.data.savings;

    alert(`✅ Cupom resgatado com sucesso!\n\nEconomia gerada para o cliente: R$ ${savings.toFixed(2)}`);

    const codeInput = document.getElementById('coupon-code');
    const resultDiv = document.getElementById('validation-result');

    if (codeInput) codeInput.value = '';
    if (resultDiv) resultDiv.classList.add('hidden');

    const merchantId = auth.currentUser?.uid;
    if (merchantId) {
      await loadStats(merchantId);
    }

  } catch (error) {
    console.error('❌ Erro ao resgatar cupom:', error);
    alert('❌ ' + mapRedeemErrorToMessage(error));
  }
};

// Carregar estatísticas
export async function loadStats(merchantId) {
  try {
    console.log('📊 Carregando estatísticas...');

    // Buscar deals do lojista
    const dealsRef = collection(db, 'deals');
    const dealsQuery = query(dealsRef, where('merchantId', '==', merchantId));
    const dealsSnapshot = await getDocs(dealsQuery);

    const dealIds = dealsSnapshot.docs.map(doc => doc.id);

    // Estatísticas
    let activeDeals = 0;
    let totalCoupons = 0;
    let redeemedCoupons = 0;
    let totalRevenue = 0;

    // Contar deals ativos
    dealsSnapshot.docs.forEach(doc => {
      const deal = doc.data();
      if (deal.stockAvailable > 0 && deal.expiresAt?.toDate() > new Date()) {
        activeDeals++;
      }
    });

    // Buscar cupons
    if (dealIds.length > 0) {
      const couponsRef = collection(db, 'coupons');

      const allCouponsSnapshot = await getDocs(couponsRef);

      allCouponsSnapshot.docs.forEach(doc => {
        const coupon = doc.data();
        if (dealIds.includes(coupon.dealId)) {
          totalCoupons++;

          if (coupon.status === 'redeemed') {
            redeemedCoupons++;

            // Calcular receita (buscar deal price)
            const deal = dealsSnapshot.docs.find(d => d.id === coupon.dealId);
            if (deal) {
              totalRevenue += deal.data().dealPrice;
            }
          }
        }
      });
    }

    // Atualizar UI
    document.getElementById('stat-deals').textContent = activeDeals;
    document.getElementById('stat-coupons').textContent = totalCoupons;
    document.getElementById('stat-redeemed').textContent = redeemedCoupons;
    document.getElementById('stat-revenue').textContent = `R$ ${totalRevenue.toFixed(2)}`;

    console.log('✅ Estatísticas carregadas:', {
      activeDeals,
      totalCoupons,
      redeemedCoupons,
      totalRevenue
    });

  } catch (error) {
    console.error('❌ Erro ao carregar estatísticas:', error);
  }
}
