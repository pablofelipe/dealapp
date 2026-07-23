/** Código de 6 dígitos numéricos, compatível com a tela de validação já existente no painel do lojista. */
export function generateCouponCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
