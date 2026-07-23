import * as admin from 'firebase-admin';
import { Coupon } from '../domain/Coupon';
import { Deal } from '../domain/Deal';
import { generateCouponCode } from '../domain/couponCode';
import { DomainError } from '../domain/errors';

export async function generateCouponForUser(
  db: FirebaseFirestore.Firestore,
  dealId: string,
  userId: string,
): Promise<{ id: string; code: string }> {
  return db.runTransaction(async (tx) => {
    const dealRef = db.collection('deals').doc(dealId);
    const dealSnap = await tx.get(dealRef);
    if (!dealSnap.exists) {
      throw new DomainError('DEAL_NOT_FOUND', 'Oferta não encontrada');
    }
    const deal = Deal.fromFirestoreData(dealSnap.id, dealSnap.data()!);
    deal.reserveStock();

    const code = generateCouponCode();
    const couponRef = db.collection('coupons').doc();
    const coupon = Coupon.create({ id: couponRef.id, code, dealId, userId, expiresAt: deal.expiresAt });

    tx.update(dealRef, { stockAvailable: deal.stockAvailable });
    tx.set(couponRef, {
      code: coupon.code,
      dealId: coupon.dealId,
      userId: coupon.userId,
      status: coupon.status,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: coupon.expiresAt,
      redeemedAt: null,
      dealTitle: deal.title,
      dealPrice: deal.dealPrice,
    });

    return { id: couponRef.id, code };
  });
}

export async function redeemCoupon(
  db: FirebaseFirestore.Firestore,
  couponId: string,
  requesterUid: string,
  expectedCode?: string,
): Promise<{ savings: number }> {
  return db.runTransaction(async (tx) => {
    const couponRef = db.collection('coupons').doc(couponId);
    const couponSnap = await tx.get(couponRef);
    if (!couponSnap.exists) {
      throw new DomainError('COUPON_NOT_FOUND', 'Cupom não encontrado');
    }
    const coupon = Coupon.fromFirestoreData(couponSnap.id, couponSnap.data()!);
    if (expectedCode && coupon.code !== expectedCode) {
      throw new DomainError('COUPON_MISMATCH', 'Código não confere');
    }

    const dealRef = db.collection('deals').doc(coupon.dealId);
    const dealSnap = await tx.get(dealRef);
    const deal = dealSnap.exists ? Deal.fromFirestoreData(dealSnap.id, dealSnap.data()!) : null;

    coupon.redeem(requesterUid, deal?.merchantId ?? '', new Date());

    tx.update(couponRef, {
      status: coupon.status,
      redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
      redeemedBy: coupon.redeemedBy,
    });

    const savings = deal ? deal.savings() : 0;
    const userRef = db.collection('users').doc(coupon.userId);
    tx.set(
      userRef,
      {
        totalSavings: admin.firestore.FieldValue.increment(savings),
        dealsPurchased: admin.firestore.FieldValue.increment(1),
        lastActivity: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { savings };
  });
}
