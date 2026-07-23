import * as admin from 'firebase-admin';

admin.initializeApp();

export { generateCoupon, redeemCoupon } from './callable/coupons';
