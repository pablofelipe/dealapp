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

import { validateExpiryDate, validatePrices } from './deals.js';

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
