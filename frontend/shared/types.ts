/** Minimal shape of a Firestore Timestamp - enough for the read-only checks done client-side. */
export interface FirestoreTimestamp {
  toDate(): Date;
}

export interface MerchantLocation {
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  fullAddress?: string;
  latitude: number;
  longitude: number;
  geohash?: string;
  deliveryRadius?: number;
  deliveryOptions?: string[];
}

export type DealStatus = 'active' | 'paused';

export interface Deal {
  id?: string;
  title: string;
  description?: string;
  originalPrice: number;
  dealPrice: number;
  discount?: number;
  stockAvailable: number;
  stockTotal?: number;
  isUnlimited?: boolean;
  category?: string;
  merchantId?: string;
  merchantName?: string;
  merchantCategory?: string;
  merchantPhone?: string;
  merchantLocation?: MerchantLocation;
  /** Legacy alias some older documents use instead of merchantLocation. */
  location?: MerchantLocation;
  imageUrl?: string;
  expiresAt?: FirestoreTimestamp | null;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  status?: DealStatus;
  views?: number;
  couponsGenerated?: number;
  couponsRedeemed?: number;
  revenueGenerated?: number;
  distance?: number;
  distanceText?: string;
  /** Top-level alias some call sites use instead of merchantLocation.deliveryOptions. */
  deliveryOptions?: string[];
  /** Legacy alias some older documents use instead of dealPrice. */
  price?: number;
}

export type CouponStatus = 'pending' | 'active' | 'urgent' | 'redeemed' | 'expired';

export interface Coupon {
  id?: string;
  code: string;
  dealId: string;
  userId: string;
  status: CouponStatus;
  generatedAt?: FirestoreTimestamp;
  expiresAt?: FirestoreTimestamp | null;
  redeemedAt?: FirestoreTimestamp | null;
  redeemedBy?: string | null;
  dealTitle?: string;
  dealPrice?: number;
  dealInfo?: Deal | null;
}
