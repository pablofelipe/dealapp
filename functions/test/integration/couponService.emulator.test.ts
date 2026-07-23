import * as admin from 'firebase-admin';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateCouponForUser, redeemCoupon } from '../../src/application/couponService';
import { DomainError } from '../../src/domain/errors';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'dealapp-test' });
}
const db = admin.firestore();

async function clearCollections() {
  const collections = ['deals', 'coupons', 'users'];
  for (const name of collections) {
    const snapshot = await db.collection(name).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await clearCollections();
});

describe('generateCouponForUser (concorrência real)', () => {
  it('com 1 unidade de estoque, duas chamadas concorrentes: só uma tem sucesso', async () => {
    const dealRef = db.collection('deals').doc('deal-1');
    await dealRef.set({
      merchantId: 'merchant-1',
      title: 'Pizza grande',
      dealPrice: 30,
      originalPrice: 50,
      stockAvailable: 1,
      expiresAt: null,
    });

    const results = await Promise.allSettled([
      generateCouponForUser(db, 'deal-1', 'customer-a'),
      generateCouponForUser(db, 'deal-1', 'customer-b'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DomainError);
    expect(((rejected[0] as PromiseRejectedResult).reason as DomainError).code).toBe('OUT_OF_STOCK');

    const dealAfter = await dealRef.get();
    expect(dealAfter.data()?.stockAvailable).toBe(0);

    const couponsSnapshot = await db.collection('coupons').where('dealId', '==', 'deal-1').get();
    expect(couponsSnapshot.size).toBe(1);
  });

  it('o id retornado corresponde ao documento realmente criado (regressão do bug de id divergente)', async () => {
    const dealRef = db.collection('deals').doc('deal-2');
    await dealRef.set({
      merchantId: 'merchant-1',
      title: 'Combo lanche',
      dealPrice: 15,
      originalPrice: 25,
      stockAvailable: 5,
      expiresAt: null,
    });

    const { id, code } = await generateCouponForUser(db, 'deal-2', 'customer-a');

    const couponSnap = await db.collection('coupons').doc(id).get();
    expect(couponSnap.exists).toBe(true);
    expect(couponSnap.data()?.code).toBe(code);
  });
});

describe('redeemCoupon (concorrência real)', () => {
  async function seedRedeemableCoupon() {
    await db.collection('deals').doc('deal-3').set({
      merchantId: 'merchant-1',
      title: 'Corte de cabelo',
      dealPrice: 20,
      originalPrice: 40,
      stockAvailable: 3,
      expiresAt: null,
    });
    await db.collection('coupons').doc('coupon-3').set({
      code: '654321',
      dealId: 'deal-3',
      userId: 'customer-a',
      status: 'pending',
      expiresAt: null,
      redeemedAt: null,
      redeemedBy: null,
    });
  }

  it('duas chamadas concorrentes no mesmo cupom: só uma tem sucesso, savings incrementado 1x', async () => {
    await seedRedeemableCoupon();

    const results = await Promise.allSettled([
      redeemCoupon(db, 'coupon-3', 'merchant-1'),
      redeemCoupon(db, 'coupon-3', 'merchant-1'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(((rejected[0] as PromiseRejectedResult).reason as DomainError).code).toBe('COUPON_ALREADY_REDEEMED');

    const userSnap = await db.collection('users').doc('customer-a').get();
    expect(userSnap.data()?.totalSavings).toBe(20);
    expect(userSnap.data()?.dealsPurchased).toBe(1);
  });

  it('resgate por um terceiro (nem dono nem lojista) falha com FORBIDDEN e não altera nada', async () => {
    await seedRedeemableCoupon();

    await expect(redeemCoupon(db, 'coupon-3', 'stranger-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const couponSnap = await db.collection('coupons').doc('coupon-3').get();
    expect(couponSnap.data()?.status).toBe('pending');
    const userSnap = await db.collection('users').doc('customer-a').get();
    expect(userSnap.exists).toBe(false);
  });
});
