import { Router } from 'express';
import {
  createPaymobPayment,
  paymobWebhook,
  createPaypalOrder,
  capturePaypalOrder,
} from '../controllers/paymentController.js';

const router = Router();

// --- PayMob (cards + Vodafone Cash / wallets + Fawry) ---
router.post('/paymob', createPaymobPayment); // start a payment
router.post('/paymob/webhook', paymobWebhook); // server-to-server callback (HMAC verified)

// --- PayPal (international) ---
router.post('/paypal', createPaypalOrder); // create order -> approval link
router.post('/paypal/:orderId/capture', capturePaypalOrder); // capture after approval

export default router;
