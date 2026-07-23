import { DomainError } from './errors';

export type CouponStatus = 'pending' | 'redeemed' | 'expired';

export interface CouponProps {
  id: string;
  code: string;
  dealId: string;
  userId: string;
  status: CouponStatus;
  expiresAt: Date | null;
  redeemedAt: Date | null;
  redeemedBy: string | null;
}

export class Coupon {
  readonly id: string;
  readonly code: string;
  readonly dealId: string;
  readonly userId: string;
  readonly expiresAt: Date | null;
  status: CouponStatus;
  redeemedAt: Date | null;
  redeemedBy: string | null;

  constructor(props: CouponProps) {
    this.id = props.id;
    this.code = props.code;
    this.dealId = props.dealId;
    this.userId = props.userId;
    this.status = props.status;
    this.expiresAt = props.expiresAt;
    this.redeemedAt = props.redeemedAt;
    this.redeemedBy = props.redeemedBy;
  }

  static create(params: { id: string; code: string; dealId: string; userId: string; expiresAt: Date | null }): Coupon {
    return new Coupon({
      id: params.id,
      code: params.code,
      dealId: params.dealId,
      userId: params.userId,
      status: 'pending',
      expiresAt: params.expiresAt,
      redeemedAt: null,
      redeemedBy: null,
    });
  }

  static fromFirestoreData(id: string, data: FirebaseFirestore.DocumentData): Coupon {
    return new Coupon({
      id,
      code: data.code,
      dealId: data.dealId,
      userId: data.userId,
      status: data.status,
      expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt ?? null,
      redeemedAt: data.redeemedAt?.toDate ? data.redeemedAt.toDate() : data.redeemedAt ?? null,
      redeemedBy: data.redeemedBy ?? null,
    });
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt !== null && this.expiresAt < now;
  }

  canBeRedeemedBy(uid: string, dealMerchantId: string): boolean {
    return this.userId === uid || dealMerchantId === uid;
  }

  /** Lança DomainError; em sucesso muta status/redeemedAt/redeemedBy em memória. */
  redeem(by: string, dealMerchantId: string, now: Date = new Date()): void {
    if (this.status === 'redeemed') {
      throw new DomainError('COUPON_ALREADY_REDEEMED', 'Cupom já utilizado');
    }
    if (this.isExpired(now)) {
      this.status = 'expired';
      throw new DomainError('COUPON_EXPIRED', 'Cupom expirado');
    }
    if (!this.canBeRedeemedBy(by, dealMerchantId)) {
      throw new DomainError('FORBIDDEN', 'Sem permissão para resgatar este cupom');
    }
    this.status = 'redeemed';
    this.redeemedAt = now;
    this.redeemedBy = by;
  }
}
