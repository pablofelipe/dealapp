import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Gera um cupom para uma oferta
export const generateCoupon = functions.https.onCall(async (data, context) => {
  // Verificar autenticação
  if (!context.auth) {
    return { success: false, error: 'Usuário não autenticado' };
  }

  const { dealId } = data;
  const userId = context.auth.uid;

  try {
    // Buscar a oferta
    const dealDoc = await admin.firestore().collection('deals').doc(dealId).get();
    
    if (!dealDoc.exists) {
      return { success: false, error: 'Oferta não encontrada' };
    }

    const deal = dealDoc.data()!;

    // Verificar estoque
    if (deal.stockAvailable <= 0) {
      return { success: false, error: 'Oferta esgotada' };
    }

    // Verificar validade
    const expiresAt = deal.expiresAt?.toDate();
    if (expiresAt && expiresAt < new Date()) {
      return { success: false, error: 'Oferta expirada' };
    }

    // Gerar código do cupom
    const couponCode = generateCouponCode();

    // Criar cupom
    const coupon = {
      code: couponCode,
      dealId,
      userId,
      status: 'pending',
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: deal.expiresAt || admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // 30 dias padrão
      dealTitle: deal.title,
      dealPrice: deal.dealPrice
    };

    // Usar transação para garantir atomicidade
    await admin.firestore().runTransaction(async (transaction) => {
      // Reduzir estoque
      transaction.update(dealDoc.ref, {
        stockAvailable: admin.firestore.FieldValue.increment(-1)
      });

      // Criar cupom
      const couponRef = admin.firestore().collection('coupons').doc();
      transaction.set(couponRef, coupon);
    });

    return {
      success: true,
      coupon: {
        code: couponCode,
        id: admin.firestore().collection('coupons').doc().id
      }
    };
  } catch (error) {
    console.error('Erro ao gerar cupom:', error);
    return { success: false, error: 'Erro ao gerar cupom' };
  }
});

// Resgatar cupom
export const redeemCoupon = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    return { success: false, error: 'Usuário não autenticado' };
  }

  const { couponId } = data;
  const userId = context.auth.uid;

  try {
    const couponDoc = await admin.firestore().collection('coupons').doc(couponId).get();

    if (!couponDoc.exists) {
      return { success: false, error: 'Cupom não encontrado' };
    }

    const coupon = couponDoc.data()!;

    // Verificar se o cupom pertence ao usuário
    if (coupon.userId !== userId) {
      return { success: false, error: 'Cupom não pertence a este usuário' };
    }

    // Verificar status
    if (coupon.status !== 'pending') {
      return { success: false, error: 'Cupom já utilizado ou expirado' };
    }

    // Verificar validade
    const expiresAt = coupon.expiresAt?.toDate();
    if (expiresAt && expiresAt < new Date()) {
      await couponDoc.ref.update({ status: 'expired' });
      return { success: false, error: 'Cupom expirado' };
    }

    // Marcar como resgatado
    await couponDoc.ref.update({
      status: 'redeemed',
      redeemedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('Erro ao resgatar cupom:', error);
    return { success: false, error: 'Erro ao resgatar cupom' };
  }
});

// Criar oferta (admin)
export const createDeal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    return { success: false, error: 'Usuário não autenticado' };
  }

  // TODO: Verificar se usuário é admin

  const {
    title,
    description,
    originalPrice,
    dealPrice,
    condominiumId,
    stockAvailable,
    imageUrl,
    expiresAt
  } = data;

  try {
    const deal = {
      title,
      description,
      originalPrice,
      dealPrice,
      discount: Math.round(((originalPrice - dealPrice) / originalPrice) * 100),
      condominiumId,
      stockAvailable,
      imageUrl: imageUrl || '',
      expiresAt: expiresAt ? admin.firestore.Timestamp.fromDate(new Date(expiresAt)) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    };

    const dealRef = await admin.firestore().collection('deals').add(deal);

    return { success: true, dealId: dealRef.id };
  } catch (error) {
    console.error('Erro ao criar oferta:', error);
    return { success: false, error: 'Erro ao criar oferta' };
  }
});

// Atualizar estoque (admin)
export const updateStock = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    return { success: false, error: 'Usuário não autenticado' };
  }

  // TODO: Verificar se usuário é admin

  const { dealId, stockAvailable } = data;

  try {
    await admin.firestore().collection('deals').doc(dealId).update({
      stockAvailable
    });

    return { success: true };
  } catch (error) {
    console.error('Erro ao atualizar estoque:', error);
    return { success: false, error: 'Erro ao atualizar estoque' };
  }
});

// Função auxiliar para gerar código do cupom
function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
