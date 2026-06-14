import { Router } from 'express';
import { softProtect } from '../middleware/auth.js';
import {
  createPaymobPayment,
  paymobWebhook,
  createPaypalOrder,
  capturePaypalOrder,
} from '../controllers/paymentController.js';

const router = Router();

// --- PayMob (cards + Vodafone Cash / wallets + Fawry) ---
router.post('/paymob', softProtect, createPaymobPayment);
router.post('/paymob/webhook', paymobWebhook); // server-to-server, no auth header

// --- PayPal (international) ---
router.post('/paypal', softProtect, createPaypalOrder);
router.post('/paypal/:orderId/capture', capturePaypalOrder);

export default router;
