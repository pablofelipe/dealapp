export type CouponStatus = 'pending' | 'redeemed' | 'expired';

export interface Coupon {
  id: string;
  code: string;
  dealId: string;
  userId: string;
  status: CouponStatus;
  generatedAt: Date;
  expiresAt: Date;
  redeemedAt?: Date;
  dealTitle: string;
  dealPrice: number;
}
