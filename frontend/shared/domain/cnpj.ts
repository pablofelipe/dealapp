const CHECK_DIGIT_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CHECK_DIGIT_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Receita Federal's alphanumeric-CNPJ check-digit rule: each character maps to
 * charCode - 48 ('0'-'9' -> 0-9, 'A'-'Z' -> 17-42), then the same weighted mod-11
 * calculation used for the legacy numeric-only CNPJ applies unchanged.
 */
function charToValue(char: string): number {
  return char.charCodeAt(0) - 48;
}

function calcCheckDigit(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += charToValue(base[i]) * weights[i];
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/**
 * Validates a CNPJ, numeric or alphanumeric (Receita Federal's 2026 rollout allows letters in
 * the first 12 positions - the two check digits stay numeric either way).
 */
export function validateCNPJ(value: string): boolean {
  const cnpj = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();

  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(.)\1+$/.test(cnpj)) return false;

  const base = cnpj.slice(0, 12);
  const checkDigits = cnpj.slice(12);

  const dv1 = calcCheckDigit(base, CHECK_DIGIT_WEIGHTS_1);
  const dv2 = calcCheckDigit(base + dv1, CHECK_DIGIT_WEIGHTS_2);

  return checkDigits === `${dv1}${dv2}`;
}
