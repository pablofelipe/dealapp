import { describe, expect, it } from 'vitest';
import { Coupon } from './Coupon';
import { DomainError } from './errors';

function makeCoupon(overrides: Partial<ConstructorParameters<typeof Coupon>[0]> = {}): Coupon {
  return new Coupon({
    id: 'coupon-1',
    code: '123456',
    dealId: 'deal-1',
    userId: 'customer-1',
    status: 'pending',
    expiresAt: null,
    redeemedAt: null,
    redeemedBy: null,
    ...overrides,
  });
}

describe('Coupon.canBeRedeemedBy', () => {
  it('permite o dono do cupom', () => {
    const coupon = makeCoupon({ userId: 'customer-1' });
    expect(coupon.canBeRedeemedBy('customer-1', 'merchant-1')).toBe(true);
  });

  it('permite o lojista dono do deal', () => {
    const coupon = makeCoupon({ userId: 'customer-1' });
    expect(coupon.canBeRedeemedBy('merchant-1', 'merchant-1')).toBe(true);
  });

  it('nega um terceiro que não é dono nem lojista', () => {
    const coupon = makeCoupon({ userId: 'customer-1' });
    expect(coupon.canBeRedeemedBy('stranger-1', 'merchant-1')).toBe(false);
  });
});

describe('Coupon.redeem', () => {
  it('marca como redeemed quando resgatado pelo lojista do deal', () => {
    const coupon = makeCoupon({ status: 'pending' });
    const now = new Date('2025-06-01T10:00:00Z');
    coupon.redeem('merchant-1', 'merchant-1', now);
    expect(coupon.status).toBe('redeemed');
    expect(coupon.redeemedAt).toEqual(now);
    expect(coupon.redeemedBy).toBe('merchant-1');
  });

  it('lança FORBIDDEN quando quem resgata não é dono nem lojista, sem mutar o status', () => {
    const coupon = makeCoupon({ status: 'pending' });
    expect(() => coupon.redeem('stranger-1', 'merchant-1', new Date())).toThrow(DomainError);
    expect(coupon.status).toBe('pending');
    expect(coupon.redeemedAt).toBeNull();
  });

  it('lança COUPON_ALREADY_REDEEMED em cupom já resgatado, sem sobrescrever redeemedAt original', () => {
    const originalRedeemedAt = new Date('2025-01-01T00:00:00Z');
    const coupon = makeCoupon({ status: 'redeemed', redeemedAt: originalRedeemedAt, redeemedBy: 'merchant-1' });
    expect(() => coupon.redeem('merchant-1', 'merchant-1', new Date('2025-06-01T00:00:00Z'))).toThrow(DomainError);
    try {
      coupon.redeem('merchant-1', 'merchant-1', new Date('2025-06-01T00:00:00Z'));
    } catch (err) {
      expect((err as DomainError).code).toBe('COUPON_ALREADY_REDEEMED');
    }
    expect(coupon.redeemedAt).toEqual(originalRedeemedAt);
  });

  it('lança COUPON_EXPIRED e transiciona status para expired quando expiresAt já passou', () => {
    const coupon = makeCoupon({ status: 'pending', expiresAt: new Date('2020-01-01') });
    try {
      coupon.redeem('customer-1', 'merchant-1', new Date('2025-01-01'));
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('COUPON_EXPIRED');
    }
    expect(coupon.status).toBe('expired');
  });
});
