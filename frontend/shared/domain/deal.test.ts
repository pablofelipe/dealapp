import { describe, expect, it } from 'vitest';
import type { Deal } from '../types.js';
import { isDealAvailable, isDealExpired } from './deal.js';

/** Test fixtures only need the fields the function under test actually reads. */
function makeDeal(partial: Partial<Deal>): Deal {
  return partial as Deal;
}

describe('isDealExpired', () => {
  it('retorna false quando não há expiresAt (oferta sem validade definida)', () => {
    expect(isDealExpired(makeDeal({}))).toBe(false);
  });

  it('retorna true quando expiresAt está no passado', () => {
    const deal = makeDeal({ expiresAt: { toDate: () => new Date('2020-01-01') } });
    expect(isDealExpired(deal, new Date('2025-01-01'))).toBe(true);
  });

  it('retorna false quando expiresAt está no futuro', () => {
    const deal = makeDeal({ expiresAt: { toDate: () => new Date('2030-01-01') } });
    expect(isDealExpired(deal, new Date('2025-01-01'))).toBe(false);
  });
});

describe('isDealAvailable', () => {
  it('retorna false para estoque zerado', () => {
    const deal = makeDeal({ stockAvailable: 0 });
    expect(isDealAvailable(deal)).toBe(false);
  });

  it('retorna true para estoque positivo e sem expiração', () => {
    const deal = makeDeal({ stockAvailable: 3 });
    expect(isDealAvailable(deal)).toBe(true);
  });

  it('isUnlimited dispensa a checagem de estoque, mas não a de expiração (ex: Oferta Relâmpago de 24h)', () => {
    const expiredFlashDeal = makeDeal({
      isUnlimited: true,
      stockAvailable: 0,
      expiresAt: { toDate: () => new Date('2020-01-01') },
    });
    expect(isDealAvailable(expiredFlashDeal, new Date('2025-01-01'))).toBe(false);

    const activeFlashDeal = makeDeal({
      isUnlimited: true,
      stockAvailable: 0,
      expiresAt: { toDate: () => new Date('2030-01-01') },
    });
    expect(isDealAvailable(activeFlashDeal, new Date('2025-01-01'))).toBe(true);
  });

  it('retorna false quando expirado, mesmo com estoque disponível', () => {
    const deal = makeDeal({ stockAvailable: 5, expiresAt: { toDate: () => new Date('2020-01-01') } });
    expect(isDealAvailable(deal, new Date('2025-01-01'))).toBe(false);
  });
});
