import type { Coupon, CouponStatus } from '../types';

/** Define o estado do cupom baseado em tempo e ação. Expiração é checada antes do status. */
export function getCouponStatus(coupon: Coupon, now: Date = new Date()): CouponStatus {
  const expiresDate = coupon.expiresAt?.toDate();

  if (expiresDate && expiresDate < now) return 'expired';

  if (coupon.status === 'redeemed') return 'redeemed';

  // Regra de Urgência: Faltam menos de 24 horas
  const diffInHours = expiresDate ? (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60) : 0;
  if (diffInHours > 0 && diffInHours < 24) return 'urgent';

  return 'active';
}
