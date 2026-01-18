import { db, auth } from './firebase-config.js';
/*
import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
*/
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

import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

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

    // IMPORTANTE: Decrementar estoque
    await updateDoc(dealRef, {
      stockAvailable: increment(-1)
    });

    alert(`✅ Cupom gerado com sucesso!\n\nCódigo: ${code}`);

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

// Gerar novo cupom (via Cloud Function)
export async function generateCouponCloudFunction(dealId) {
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
