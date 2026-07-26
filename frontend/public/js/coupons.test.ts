import { describe, expect, it, vi } from 'vitest';

// createCouponCard is pure (creates and returns a detached DOM node) but coupons.js also
// exports functions that touch db/auth - stub firebase-config.js so importing it doesn't
// eagerly initialize the real Firebase SDK under Node.
vi.mock('./firebase-config.js', () => ({ db: {}, auth: {} }));

import type { Coupon, Deal, FirestoreTimestamp } from '../../shared/types.js';
import { createCouponCard } from './coupons.js';

function timestamp(date: Date): FirestoreTimestamp {
  return { toDate: () => date };
}

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-1',
    title: 'Combo Família',
    originalPrice: 100,
    dealPrice: 70,
    stockAvailable: 5,
    merchantName: 'Açougue do Zé',
    merchantLocation: {
      latitude: -23.56,
      longitude: -46.65,
      address: 'Rua das Flores',
      number: '123',
      neighborhood: 'Pinheiros',
      city: 'São Paulo',
      state: 'SP',
    },
    ...overrides,
  } as Deal;
}

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  const inOneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: 'coupon-1',
    code: '123456',
    dealId: 'deal-1',
    userId: 'user-1',
    status: 'pending',
    expiresAt: timestamp(inOneWeek),
    dealInfo: makeDeal(),
    ...overrides,
  } as Coupon;
}

describe('createCouponCard', () => {
  it('renderiza um cupom ativo com o código e os dados da oferta', () => {
    const card = createCouponCard(makeCoupon());
    expect(card.className).toBe('coupon-card status-active');
    expect(card.innerHTML).toContain('123456');
    expect(card.innerHTML).toContain('Combo Família');
    expect(card.innerHTML).toContain('Açougue do Zé');
    expect(card.innerHTML).toContain('ATIVO');
  });

  it('marca como urgente quando faltam menos de 24h para expirar', () => {
    const in2h = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const card = createCouponCard(makeCoupon({ expiresAt: timestamp(in2h) }));
    expect(card.className).toBe('coupon-card status-urgent');
    expect(card.innerHTML).toContain('ÚLTIMA CHANCE');
  });

  it('marca como expirado quando a data de expiração já passou, mesmo com status pending', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const card = createCouponCard(makeCoupon({ expiresAt: timestamp(yesterday) }));
    expect(card.className).toBe('coupon-card status-expired');
    expect(card.innerHTML).toContain('EXPIRADO');
    expect(card.innerHTML).not.toContain('Resgatado em');
  });

  it('marca como utilizado e mostra a data de resgate quando status é redeemed', () => {
    const inOneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const redeemedAt = new Date();
    const card = createCouponCard(makeCoupon({
      status: 'redeemed',
      expiresAt: timestamp(inOneWeek),
      redeemedAt: timestamp(redeemedAt),
    }));
    expect(card.className).toBe('coupon-card status-redeemed');
    expect(card.innerHTML).toContain('UTILIZADO');
    expect(card.innerHTML).toContain('Resgatado em');
  });

  it('usa "Endereço não disponível" quando a oferta não tem merchantLocation', () => {
    const card = createCouponCard(makeCoupon({ dealInfo: makeDeal({ merchantLocation: undefined }) }));
    expect(card.innerHTML).toContain('Endereço não disponível');
  });

  it('usa "Loja Local" e "Oferta" como fallback quando não há dealInfo', () => {
    const card = createCouponCard(makeCoupon({ dealInfo: null }));
    expect(card.innerHTML).toContain('Loja Local');
    expect(card.innerHTML).toContain('>Oferta<');
  });
});
