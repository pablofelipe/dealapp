import { describe, expect, it, vi } from 'vitest';

// calcularDistancia is pure and doesn't touch db - stub firebase-config.js so importing
// deals.js doesn't eagerly initialize the real Firebase SDK under Node.
vi.mock('./firebase-config.js', () => ({ db: {} }));

import { calcularDistancia, filterDealsWithinRadius } from './deals.js';

describe('calcularDistancia', () => {
  it('retorna 0 para o mesmo ponto', () => {
    expect(calcularDistancia(-23.561684, -46.655981, -23.561684, -46.655981)).toBeCloseTo(0, 5);
  });

  it('calcula ~111km para 1 grau de diferença de latitude no equador (fato geográfico conhecido)', () => {
    const distancia = calcularDistancia(0, 0, 1, 0);
    expect(distancia).toBeCloseTo(111.19, 0);
  });

  it('é simétrica (distância de A a B == distância de B a A)', () => {
    const ab = calcularDistancia(-23.561684, -46.655981, -23.587416, -46.657634);
    const ba = calcularDistancia(-23.587416, -46.657634, -23.561684, -46.655981);
    expect(ab).toBeCloseTo(ba, 10);
  });
});

describe('filterDealsWithinRadius', () => {
  const center = [-23.561684, -46.655981]; // Av. Paulista, SP

  function makeDeal(overrides = {}) {
    return {
      id: 'deal-1',
      stockAvailable: 5,
      merchantLocation: { latitude: -23.561684, longitude: -46.655981 },
      ...overrides,
    };
  }

  it('exclui um deal sem merchantLocation', () => {
    const deal = makeDeal({ merchantLocation: undefined });
    expect(filterDealsWithinRadius([deal], center, 10)).toHaveLength(0);
  });

  it('exclui um deal sem estoque', () => {
    const deal = makeDeal({ stockAvailable: 0 });
    expect(filterDealsWithinRadius([deal], center, 10)).toHaveLength(0);
  });

  it('exclui um deal cuja caixa de geohash bateu mas a distância exata está fora do raio', () => {
    // ~2 graus de latitude de distância ≈ 222km, bem fora de qualquer raio razoável
    const deal = makeDeal({ merchantLocation: { latitude: -25.561684, longitude: -46.655981 } });
    expect(filterDealsWithinRadius([deal], center, 10)).toHaveLength(0);
  });

  it('inclui um deal dentro do raio, com distância e distanceText calculados', () => {
    const deal = makeDeal({ merchantLocation: { latitude: -23.57, longitude: -46.66 } });
    const result = filterDealsWithinRadius([deal], center, 10);
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBeGreaterThan(0);
    expect(result[0].distanceText).toMatch(/km|m$/);
  });
});
