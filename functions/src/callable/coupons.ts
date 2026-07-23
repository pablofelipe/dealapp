import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { generateCouponForUser, redeemCoupon as redeemCouponService } from '../application/couponService';
import { DomainError, DomainErrorCode } from '../domain/errors';

const ERROR_CODE_MAP: Record<DomainErrorCode, functions.https.FunctionsErrorCode> = {
  DEAL_NOT_FOUND: 'not-found',
  OUT_OF_STOCK: 'failed-precondition',
  DEAL_EXPIRED: 'failed-precondition',
  COUPON_NOT_FOUND: 'not-found',
  COUPON_ALREADY_REDEEMED: 'failed-precondition',
  COUPON_EXPIRED: 'failed-precondition',
  COUPON_MISMATCH: 'invalid-argument',
  FORBIDDEN: 'permission-denied',
};

function toHttpsError(err: unknown): functions.https.HttpsError {
  if (err instanceof DomainError) {
    return new functions.https.HttpsError(ERROR_CODE_MAP[err.code], err.message);
  }
  functions.logger.error(err);
  return new functions.https.HttpsError('internal', 'Erro interno');
}

export const generateCoupon = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }
  const { dealId } = data;
  if (!dealId) {
    throw new functions.https.HttpsError('invalid-argument', 'dealId é obrigatório');
  }
  try {
    return await generateCouponForUser(admin.firestore(), dealId, context.auth.uid);
  } catch (err) {
    throw toHttpsError(err);
  }
});

export const redeemCoupon = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
  }
  const { couponId, couponCode } = data;
  if (!couponId) {
    throw new functions.https.HttpsError('invalid-argument', 'couponId é obrigatório');
  }
  try {
    return await redeemCouponService(admin.firestore(), couponId, context.auth.uid, couponCode);
  } catch (err) {
    throw toHttpsError(err);
  }
});
