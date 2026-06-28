import { Router } from 'express';
import { protect, adminOnly, softProtect } from '../middleware/auth.js';
import {
  createPaymobPayment,
  paymobWebhook,
  createPaypalOrder,
  capturePaypalOrder,
} from '../controllers/paymentController.js';
import {
  getManualMethods,
  submitManualPayment,
  listManualPayments,
  reviewManualPayment,
} from '../controllers/manualPaymentController.js';

const router = Router();

// --- PayMob (cards + Vodafone Cash / wallets + Fawry) ---
router.post('/paymob', softProtect, createPaymobPayment);
router.post('/paymob/webhook', paymobWebhook);

// --- PayPal API ---
router.post('/paypal', softProtect, createPaypalOrder);
router.post('/paypal/:orderId/capture', capturePaypalOrder);

// --- Manual payment methods (WU / MoneyGram / Payoneer / IBAN / etc.) ---
router.get('/manual-methods', getManualMethods);
router.post('/manual', softProtect, submitManualPayment);
router.get('/manual', protect, adminOnly, listManualPayments);
router.patch('/manual/:id', protect, adminOnly, reviewManualPayment);

export default router;
