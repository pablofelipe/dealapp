import { describe, expect, it, vi } from 'vitest';

// validateExpiryDate/validatePrices are pure and don't touch db/auth/storage - stub
// firebase-config.js and firebase/storage so importing deals.js doesn't eagerly initialize
// the real Firebase SDK under Node (getStorage() with no app throws without one).
vi.mock('./firebase-config.js', () => ({ db: {}, auth: {} }));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  uploadBytes: () => Promise.resolve(),
  getDownloadURL: () => Promise.resolve(''),
}));

import type { Deal, FirestoreTimestamp } from '../../shared/types.js';
import { createDealItem, validateExpiryDate, validatePrices } from './deals.js';

function timestamp(date: Date): FirestoreTimestamp {
  return { toDate: () => date };
}

describe('validateExpiryDate', () => {
  it('lança erro se a data não for informada', () => {
    expect(() => validateExpiryDate('')).toThrow('obrigatória');
  });

  it('lança erro se a data for inválida', () => {
    expect(() => validateExpiryDate('not-a-date')).toThrow('inválida');
  });

  it('lança erro se a data estiver no passado', () => {
    expect(() => validateExpiryDate('2020-01-01')).toThrow('passado');
  });

  it('aceita uma data futura e retorna um Date no final do dia (23:59:59.999)', () => {
    const result = validateExpiryDate('2099-12-31');
    expect(result).toBeInstanceOf(Date);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
  });
});

describe('validatePrices', () => {
  it('lança erro se o preço original for zero ou negativo', () => {
    expect(() => validatePrices(0, 10)).toThrow('Preço original');
    expect(() => validatePrices(-5, 10)).toThrow('Preço original');
  });

  it('lança erro se o preço com desconto for zero ou negativo', () => {
    expect(() => validatePrices(50, 0)).toThrow('Preço com desconto');
  });

  it('lança erro se o preço com desconto não for menor que o original', () => {
    expect(() => validatePrices(50, 50)).toThrow('menor que o preço original');
    expect(() => validatePrices(50, 60)).toThrow('menor que o preço original');
  });

  it('não lança erro para preços válidos', () => {
    expect(() => validatePrices(50, 30)).not.toThrow();
  });
});

describe('createDealItem', () => {
  function makeDeal(overrides: Partial<Deal> = {}): Deal {
    const inOneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return {
      id: 'deal-1',
      title: 'Combo Família',
      description: 'Dois quilos de picanha',
      originalPrice: 100,
      dealPrice: 70,
      discount: 30,
      stockAvailable: 20,
      stockTotal: 50,
      status: 'active',
      expiresAt: timestamp(inOneWeek),
      merchantLocation: { latitude: -23.56, longitude: -46.65, neighborhood: 'Pinheiros', city: 'São Paulo', deliveryRadius: 5 },
      ...overrides,
    } as Deal;
  }

  it('renderiza um item com a classe deal-item e os dados principais da oferta', () => {
    const item = createDealItem(makeDeal());
    expect(item.className).toBe('deal-item');
    expect(item.innerHTML).toContain('Combo Família');
    expect(item.innerHTML).toContain('Dois quilos de picanha');
    expect(item.innerHTML).toContain('R$ 70.00');
    expect(item.innerHTML).toContain('30% OFF');
    expect(item.innerHTML).toContain('Pinheiros');
    expect(item.innerHTML).toContain('20/50 restantes');
  });

  it('mostra "Estoque Ilimitado" quando isUnlimited é true', () => {
    const item = createDealItem(makeDeal({ isUnlimited: true }));
    expect(item.innerHTML).toContain('Estoque Ilimitado');
  });

  it('mostra "Expirado" quando a oferta já passou da validade', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const item = createDealItem(makeDeal({ expiresAt: timestamp(yesterday) }));
    expect(item.innerHTML).toContain('Expirado');
  });

  it('mostra a data de validade formatada quando a oferta ainda não expirou', () => {
    const item = createDealItem(makeDeal());
    expect(item.innerHTML).toContain('Até ');
    expect(item.innerHTML).not.toContain('>Expirado<');
  });

  it('mostra "Ativar" no botão de status quando a oferta está pausada', () => {
    const item = createDealItem(makeDeal({ status: 'paused' }));
    expect(item.innerHTML).toContain('▶️ Ativar');
  });

  it('mostra "Pausar" no botão de status quando a oferta está ativa', () => {
    const item = createDealItem(makeDeal({ status: 'active' }));
    expect(item.innerHTML).toContain('⏸️ Pausar');
  });
});
