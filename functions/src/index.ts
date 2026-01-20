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
    const dealDoc = await admin
      .firestore()
      .collection('deals')
      .doc(dealId)
      .get();

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
      expiresAt:
        deal.expiresAt ||
        admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ), // 30 dias padrão
      dealTitle: deal.title,
      dealPrice: deal.dealPrice,
    };

    // Usar transação para garantir atomicidade
    await admin.firestore().runTransaction(async (transaction) => {
      // Reduzir estoque
      transaction.update(dealDoc.ref, {
        stockAvailable: admin.firestore.FieldValue.increment(-1),
      });

      // Criar cupom
      const couponRef = admin.firestore().collection('coupons').doc();
      transaction.set(couponRef, coupon);
    });

    return {
      success: true,
      coupon: {
        code: couponCode,
        id: admin.firestore().collection('coupons').doc().id,
      },
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

  const { couponCode, couponId } = data; // Aceita tanto code quanto id
  const userId = context.auth.uid;

  try {
    let couponDoc;

    // Buscar cupom por código ou ID
    if (couponCode) {
      const couponsSnapshot = await admin
        .firestore()
        .collection('coupons')
        .where('code', '==', couponCode)
        .limit(1)
        .get();

      if (couponsSnapshot.empty) {
        return { success: false, error: 'Cupom não encontrado' };
      }

      couponDoc = couponsSnapshot.docs[0];
    } else if (couponId) {
      couponDoc = await admin
        .firestore()
        .collection('coupons')
        .doc(couponId)
        .get();
      if (!couponDoc.exists) {
        return { success: false, error: 'Cupom não encontrado' };
      }
    } else {
      return { success: false, error: 'Código ou ID do cupom não fornecido' };
    }

    const coupon = couponDoc.data()!;

    // Verificar se é o dono do cupom OU se é lojista do deal relacionado
    let canRedeem = coupon.userId === userId;

    if (!canRedeem) {
      // Verificar se é lojista do deal
      const dealDoc = await admin
        .firestore()
        .collection('deals')
        .doc(coupon.dealId)
        .get();
      if (dealDoc.exists) {
        const deal = dealDoc.data()!;
        canRedeem = deal.merchantId === userId;
      }
    }

    if (!canRedeem) {
      return {
        success: false,
        error: 'Você não tem permissão para resgatar este cupom',
      };
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
      redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Calcular economia
    const dealDoc = await admin
      .firestore()
      .collection('deals')
      .doc(coupon.dealId)
      .get();
    const deal = dealDoc.data()!;
    const savings = deal ? deal.originalPrice - deal.dealPrice : 0;

    return { success: true, savings };
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
    stockAvailable,
    imageUrl,
    expiresAt,
  } = data;

  try {
    const deal = {
      title,
      description,
      originalPrice,
      dealPrice,
      discount: Math.round(((originalPrice - dealPrice) / originalPrice) * 100),
      stockAvailable,
      imageUrl: imageUrl || '',
      expiresAt: expiresAt
        ? admin.firestore.Timestamp.fromDate(new Date(expiresAt))
        : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid,
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
      stockAvailable,
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
