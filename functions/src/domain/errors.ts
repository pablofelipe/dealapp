export type DomainErrorCode =
  | 'DEAL_NOT_FOUND'
  | 'OUT_OF_STOCK'
  | 'DEAL_EXPIRED'
  | 'COUPON_NOT_FOUND'
  | 'COUPON_ALREADY_REDEEMED'
  | 'COUPON_EXPIRED'
  | 'COUPON_MISMATCH'
  | 'FORBIDDEN';

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
