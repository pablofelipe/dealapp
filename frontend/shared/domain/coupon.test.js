import { describe, expect, it } from 'vitest';
import { getCouponStatus } from './coupon.js';

function makeCoupon(overrides = {}) {
  return {
    status: 'pending',
    expiresAt: { toDate: () => new Date('2030-01-01T00:00:00Z') },
    ...overrides,
  };
}

describe('getCouponStatus', () => {
  it('retorna "redeemed" quando o cupom já foi resgatado', () => {
    const coupon = makeCoupon({ status: 'redeemed' });
    expect(getCouponStatus(coupon)).toBe('redeemed');
  });

  it('retorna "expired" quando a data de expiração já passou, mesmo com status pending', () => {
    const coupon = makeCoupon({ expiresAt: { toDate: () => new Date('2020-01-01T00:00:00Z') } });
    expect(getCouponStatus(coupon)).toBe('expired');
  });

  it('retorna "urgent" quando faltam menos de 24 horas para expirar', () => {
    const in12Hours = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const coupon = makeCoupon({ expiresAt: { toDate: () => in12Hours } });
    expect(getCouponStatus(coupon)).toBe('urgent');
  });

  it('retorna "active" quando falta mais de 24 horas para expirar', () => {
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const coupon = makeCoupon({ expiresAt: { toDate: () => in3Days } });
    expect(getCouponStatus(coupon)).toBe('active');
  });

  it('checa expiração antes do status: cupom expirado e marcado redeemed retorna "expired"', () => {
    const coupon = makeCoupon({
      status: 'redeemed',
      expiresAt: { toDate: () => new Date('2020-01-01T00:00:00Z') },
    });
    expect(getCouponStatus(coupon)).toBe('expired');
  });
});
