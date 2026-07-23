import { describe, expect, it } from 'vitest';
import { isDealAvailable, isDealExpired } from './deal.js';

describe('isDealExpired', () => {
  it('retorna false quando não há expiresAt (oferta sem validade definida)', () => {
    expect(isDealExpired({})).toBe(false);
  });

  it('retorna true quando expiresAt está no passado', () => {
    const deal = { expiresAt: { toDate: () => new Date('2020-01-01') } };
    expect(isDealExpired(deal, new Date('2025-01-01'))).toBe(true);
  });

  it('retorna false quando expiresAt está no futuro', () => {
    const deal = { expiresAt: { toDate: () => new Date('2030-01-01') } };
    expect(isDealExpired(deal, new Date('2025-01-01'))).toBe(false);
  });
});

describe('isDealAvailable', () => {
  it('retorna false para estoque zerado', () => {
    const deal = { stockAvailable: 0 };
    expect(isDealAvailable(deal)).toBe(false);
  });

  it('retorna true para estoque positivo e sem expiração', () => {
    const deal = { stockAvailable: 3 };
    expect(isDealAvailable(deal)).toBe(true);
  });

  it('isUnlimited dispensa a checagem de estoque, mas não a de expiração (ex: Oferta Relâmpago de 24h)', () => {
    const expiredFlashDeal = {
      isUnlimited: true,
      stockAvailable: 0,
      expiresAt: { toDate: () => new Date('2020-01-01') },
    };
    expect(isDealAvailable(expiredFlashDeal, new Date('2025-01-01'))).toBe(false);

    const activeFlashDeal = {
      isUnlimited: true,
      stockAvailable: 0,
      expiresAt: { toDate: () => new Date('2030-01-01') },
    };
    expect(isDealAvailable(activeFlashDeal, new Date('2025-01-01'))).toBe(true);
  });

  it('retorna false quando expirado, mesmo com estoque disponível', () => {
    const deal = { stockAvailable: 5, expiresAt: { toDate: () => new Date('2020-01-01') } };
    expect(isDealAvailable(deal, new Date('2025-01-01'))).toBe(false);
  });
});
