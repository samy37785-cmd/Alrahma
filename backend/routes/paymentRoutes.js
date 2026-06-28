import { Router } from 'express';
import { protect, adminOnly, softProtect } from '../middleware/auth.js';
import {
  createPaypalOrder,
  capturePaypalOrder,
  paypalWebhook,
} from '../controllers/paymentController.js';
import {
  createStripeSession,
  stripeWebhook,
} from '../controllers/stripeController.js';
import {
  getManualMethods,
  submitManualPayment,
  listManualPayments,
  reviewManualPayment,
} from '../controllers/manualPaymentController.js';

const router = Router();

// --- Stripe (cards + Apple Pay + Google Pay) ---
// Webhook must come before any body-parser; raw body is set in app.js
router.post('/stripe/webhook', stripeWebhook);
router.post('/stripe', softProtect, createStripeSession);

// --- PayPal API ---
router.post('/paypal/webhook', paypalWebhook);
router.post('/paypal', softProtect, createPaypalOrder);
router.post('/paypal/:orderId/capture', capturePaypalOrder);

// --- Manual payment methods (WU / MoneyGram / Payoneer / IBAN / etc.) ---
router.get('/manual-methods', getManualMethods);
router.post('/manual', softProtect, submitManualPayment);
router.get('/manual', protect, adminOnly, listManualPayments);
router.patch('/manual/:id', protect, adminOnly, reviewManualPayment);

export default router;
