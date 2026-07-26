import { describe, expect, it, vi } from 'vitest';

// calcularDistancia is pure and doesn't touch db - stub firebase-config.js so importing
// deals.js doesn't eagerly initialize the real Firebase SDK under Node.
vi.mock('./firebase-config.js', () => ({ db: {} }));

import type { Deal } from '../../shared/types.js';
import { calcularDistancia, createDealCard, filterDealsWithinRadius } from './deals.js';

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
  const center: [number, number] = [-23.561684, -46.655981]; // Av. Paulista, SP

  function makeDeal(overrides: Partial<Deal> = {}): Deal {
    return {
      id: 'deal-1',
      stockAvailable: 5,
      merchantLocation: { latitude: -23.561684, longitude: -46.655981 },
      ...overrides,
    } as Deal;
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

describe('createDealCard', () => {
  function makeDeal(overrides: Partial<Deal> = {}): Deal {
    return {
      id: 'deal-1',
      title: 'Combo Família',
      description: 'Dois quilos de picanha',
      originalPrice: 100,
      dealPrice: 70,
      discount: 30,
      stockAvailable: 5,
      category: 'butcher',
      merchantLocation: { latitude: -23.56, longitude: -46.65, neighborhood: 'Pinheiros' },
      ...overrides,
    } as Deal;
  }

  it('renderiza um card com a classe deal-card e os dados principais da oferta', () => {
    const card = createDealCard(makeDeal());
    expect(card.className).toBe('deal-card');
    expect(card.innerHTML).toContain('Combo Família');
    expect(card.innerHTML).toContain('Dois quilos de picanha');
    expect(card.innerHTML).toContain('R$ 100.00');
    expect(card.innerHTML).toContain('R$ 70.00');
    expect(card.innerHTML).toContain('30% OFF');
    expect(card.innerHTML).toContain('Açougue'); // CATEGORY_LABELS['butcher']
    expect(card.innerHTML).toContain('Pinheiros');
  });

  it('mostra a quantidade em estoque quando não é ilimitado', () => {
    const card = createDealCard(makeDeal({ stockAvailable: 3, isUnlimited: false }));
    expect(card.innerHTML).toContain('3 disponíveis');
    expect(card.innerHTML).not.toContain('Estoque Ilimitado');
  });

  it('mostra "Estoque Ilimitado" quando isUnlimited é true', () => {
    const card = createDealCard(makeDeal({ isUnlimited: true }));
    expect(card.innerHTML).toContain('Estoque Ilimitado');
  });

  it('usa "Localização não definida" quando não há distanceText', () => {
    const card = createDealCard(makeDeal({ distanceText: undefined }));
    expect(card.innerHTML).toContain('Localização não definida');
  });

  it('usa o distanceText quando presente', () => {
    const card = createDealCard(makeDeal({ distanceText: '850m' }));
    expect(card.innerHTML).toContain('850m');
  });
});
