import type { Deal } from '../types';

/** Firestore Timestamps are absolute instants; comparing against `now` needs no timezone math. */
export function isDealExpired(deal: Deal, now: Date = new Date()): boolean {
  if (!deal.expiresAt) return false;
  return deal.expiresAt.toDate() < now;
}

/**
 * `isUnlimited` means unlimited stock, not "never expires" - a flash deal ("Oferta Relâmpago")
 * sets isUnlimited: true and a real 24h expiresAt, and must still expire on schedule.
 */
export function isDealAvailable(deal: Deal, now: Date = new Date()): boolean {
  if (isDealExpired(deal, now)) return false;
  if (deal.isUnlimited) return true;
  return deal.stockAvailable > 0;
}
