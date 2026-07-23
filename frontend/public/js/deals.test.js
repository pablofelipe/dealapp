import { describe, expect, it, vi } from 'vitest';

// calcularDistancia is pure and doesn't touch db - stub firebase-config.js so importing
// deals.js doesn't eagerly initialize the real Firebase SDK under Node.
vi.mock('./firebase-config.js', () => ({ db: {} }));

import { calcularDistancia } from './deals.js';

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
