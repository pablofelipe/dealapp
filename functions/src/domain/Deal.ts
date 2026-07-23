import { DomainError } from './errors';

export interface DealProps {
  id: string;
  merchantId: string;
  title: string;
  dealPrice: number;
  originalPrice: number;
  stockAvailable: number;
  expiresAt: Date | null;
}

export class Deal {
  readonly id: string;
  readonly merchantId: string;
  readonly title: string;
  readonly dealPrice: number;
  readonly originalPrice: number;
  readonly expiresAt: Date | null;
  stockAvailable: number;

  constructor(props: DealProps) {
    this.id = props.id;
    this.merchantId = props.merchantId;
    this.title = props.title;
    this.dealPrice = props.dealPrice;
    this.originalPrice = props.originalPrice;
    this.stockAvailable = props.stockAvailable;
    this.expiresAt = props.expiresAt;
  }

  static fromFirestoreData(id: string, data: FirebaseFirestore.DocumentData): Deal {
    return new Deal({
      id,
      merchantId: data.merchantId,
      title: data.title,
      dealPrice: data.dealPrice,
      originalPrice: data.originalPrice,
      stockAvailable: data.stockAvailable,
      expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt ?? null,
    });
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt !== null && this.expiresAt < now;
  }

  /** Lança DomainError se não for possível reservar; senão decrementa o estoque em memória. */
  reserveStock(now: Date = new Date()): void {
    if (this.stockAvailable <= 0) {
      throw new DomainError('OUT_OF_STOCK', 'Oferta esgotada');
    }
    if (this.isExpired(now)) {
      throw new DomainError('DEAL_EXPIRED', 'Oferta expirada');
    }
    this.stockAvailable -= 1;
  }

  savings(): number {
    return this.originalPrice - this.dealPrice;
  }
}
