import { describe, expect, it } from 'vitest';
import { Deal } from './Deal';
import { DomainError } from './errors';

function makeDeal(overrides: Partial<ConstructorParameters<typeof Deal>[0]> = {}): Deal {
  return new Deal({
    id: 'deal-1',
    merchantId: 'merchant-1',
    title: 'Pizza grande',
    dealPrice: 30,
    originalPrice: 50,
    stockAvailable: 1,
    expiresAt: null,
    ...overrides,
  });
}

describe('Deal.reserveStock', () => {
  it('decrementa stockAvailable em 1 quando há estoque', () => {
    const deal = makeDeal({ stockAvailable: 2 });
    deal.reserveStock();
    expect(deal.stockAvailable).toBe(1);
  });

  it('lança DomainError OUT_OF_STOCK quando não há estoque', () => {
    const deal = makeDeal({ stockAvailable: 0 });
    expect(() => deal.reserveStock()).toThrow(DomainError);
    try {
      deal.reserveStock();
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('OUT_OF_STOCK');
    }
    expect(deal.stockAvailable).toBe(0);
  });

  it('lança DomainError DEAL_EXPIRED quando a oferta expirou, mesmo com estoque disponível', () => {
    const deal = makeDeal({ stockAvailable: 5, expiresAt: new Date('2020-01-01') });
    expect(() => deal.reserveStock()).toThrow(DomainError);
    try {
      deal.reserveStock();
    } catch (err) {
      expect((err as DomainError).code).toBe('DEAL_EXPIRED');
    }
    expect(deal.stockAvailable).toBe(5);
  });
});

describe('Deal.isExpired', () => {
  it('retorna false quando expiresAt é null (deal sem validade)', () => {
    const deal = makeDeal({ expiresAt: null });
    expect(deal.isExpired()).toBe(false);
  });

  it('retorna true quando expiresAt está no passado', () => {
    const deal = makeDeal({ expiresAt: new Date('2020-01-01') });
    expect(deal.isExpired(new Date('2025-01-01'))).toBe(true);
  });

  it('retorna false quando expiresAt está no futuro', () => {
    const deal = makeDeal({ expiresAt: new Date('2030-01-01') });
    expect(deal.isExpired(new Date('2025-01-01'))).toBe(false);
  });
});

describe('Deal.savings', () => {
  it('retorna originalPrice - dealPrice', () => {
    const deal = makeDeal({ originalPrice: 50, dealPrice: 30 });
    expect(deal.savings()).toBe(20);
  });
});
