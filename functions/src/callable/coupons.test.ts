import * as admin from 'firebase-admin';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', async () => {
  const actual = await vi.importActual<typeof admin>('firebase-admin');
  return {
    ...actual,
    firestore: vi.fn(() => ({})),
  };
});

const generateCouponForUserMock = vi.fn();
const redeemCouponMock = vi.fn();

vi.mock('../application/couponService', () => ({
  generateCouponForUser: (...args: unknown[]) => generateCouponForUserMock(...args),
  redeemCoupon: (...args: unknown[]) => redeemCouponMock(...args),
}));

import functionsTest from 'firebase-functions-test';
import { DomainError } from '../domain/errors';

const test = functionsTest();

describe('generateCoupon (callable)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lança unauthenticated quando não há contexto de auth', async () => {
    const { generateCoupon } = await import('./coupons');
    const wrapped = test.wrap(generateCoupon);
    await expect(wrapped({ dealId: 'deal-1' }, {} as any)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('lança invalid-argument quando dealId não é enviado', async () => {
    const { generateCoupon } = await import('./coupons');
    const wrapped = test.wrap(generateCoupon);
    await expect(
      wrapped({}, { auth: { uid: 'customer-1' } } as any),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('mapeia DomainError OUT_OF_STOCK para failed-precondition', async () => {
    generateCouponForUserMock.mockRejectedValue(new DomainError('OUT_OF_STOCK', 'Oferta esgotada'));
    const { generateCoupon } = await import('./coupons');
    const wrapped = test.wrap(generateCoupon);
    await expect(
      wrapped({ dealId: 'deal-1' }, { auth: { uid: 'customer-1' } } as any),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('retorna { id, code } em caso de sucesso', async () => {
    generateCouponForUserMock.mockResolvedValue({ id: 'coupon-1', code: '123456' });
    const { generateCoupon } = await import('./coupons');
    const wrapped = test.wrap(generateCoupon);
    const result = await wrapped({ dealId: 'deal-1' }, { auth: { uid: 'customer-1' } } as any);
    expect(result).toEqual({ id: 'coupon-1', code: '123456' });
    expect(generateCouponForUserMock).toHaveBeenCalledWith(expect.anything(), 'deal-1', 'customer-1');
  });
});

describe('redeemCoupon (callable)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lança unauthenticated quando não há contexto de auth', async () => {
    const { redeemCoupon } = await import('./coupons');
    const wrapped = test.wrap(redeemCoupon);
    await expect(wrapped({ couponId: 'coupon-1' }, {} as any)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('mapeia DomainError FORBIDDEN para permission-denied', async () => {
    redeemCouponMock.mockRejectedValue(new DomainError('FORBIDDEN', 'Sem permissão'));
    const { redeemCoupon } = await import('./coupons');
    const wrapped = test.wrap(redeemCoupon);
    await expect(
      wrapped({ couponId: 'coupon-1' }, { auth: { uid: 'stranger-1' } } as any),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('retorna { savings } em caso de sucesso', async () => {
    redeemCouponMock.mockResolvedValue({ savings: 20 });
    const { redeemCoupon } = await import('./coupons');
    const wrapped = test.wrap(redeemCoupon);
    const result = await wrapped(
      { couponId: 'coupon-1', couponCode: '123456' },
      { auth: { uid: 'merchant-1' } } as any,
    );
    expect(result).toEqual({ savings: 20 });
    expect(redeemCouponMock).toHaveBeenCalledWith(expect.anything(), 'coupon-1', 'merchant-1', '123456');
  });
});
