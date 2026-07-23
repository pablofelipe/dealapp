import { describe, expect, it } from 'vitest';
import { generateCouponCode } from './couponCode';

describe('generateCouponCode', () => {
  it('gera um código numérico de 6 dígitos', () => {
    const code = generateCouponCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('gera códigos diferentes em chamadas sucessivas (checagem estatística frouxa)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateCouponCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
