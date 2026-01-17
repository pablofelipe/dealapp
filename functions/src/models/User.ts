export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  condominiumId?: string;
  isAdmin?: boolean;
  createdAt: Date;
}
