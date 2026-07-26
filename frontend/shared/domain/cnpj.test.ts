import { describe, expect, it } from 'vitest';
import { validateCNPJ } from './cnpj.js';

describe('validateCNPJ', () => {
  it('aceita um CNPJ numérico válido, formatado', () => {
    expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
  });

  it('aceita um CNPJ numérico válido, sem formatação', () => {
    expect(validateCNPJ('11222333000181')).toBe(true);
  });

  it('rejeita um CNPJ numérico com dígitos verificadores errados', () => {
    expect(validateCNPJ('11.222.333/0001-82')).toBe(false);
  });

  it('rejeita um CNPJ com todos os caracteres repetidos', () => {
    expect(validateCNPJ('11.111.111/1111-11')).toBe(false);
  });

  it('rejeita um valor muito curto', () => {
    expect(validateCNPJ('123')).toBe(false);
  });

  it('aceita um CNPJ alfanumérico válido, sem formatação', () => {
    // Base "12ABC34501DE" com DVs calculados pelo mesmo algoritmo de módulo 11,
    // convertendo cada caractere para valor via charCode - 48 (letras não ficam em 0-9).
    expect(validateCNPJ('12ABC34501DE35')).toBe(true);
  });

  it('aceita um CNPJ alfanumérico válido, formatado como o numérico', () => {
    expect(validateCNPJ('12.ABC.345/01DE-35')).toBe(true);
  });

  it('rejeita um CNPJ alfanumérico com dígitos verificadores errados', () => {
    expect(validateCNPJ('12ABC34501DE00')).toBe(false);
  });

  it('normaliza letras minúsculas antes de validar', () => {
    expect(validateCNPJ('12abc34501de35')).toBe(true);
  });
});
