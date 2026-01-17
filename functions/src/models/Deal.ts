export interface Deal {
  id: string;
  title: string;
  description: string;
  originalPrice: number;
  dealPrice: number;
  discount: number;
  condominiumId: string;
  stockAvailable: number;
  imageUrl?: string;
  expiresAt?: Date;
  createdAt: Date;
  createdBy: string;
}
