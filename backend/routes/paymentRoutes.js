import { Router } from 'express';
import { softProtect } from '../middleware/auth.js';
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

// Admin review of manual payments now lives at /api/v1/admin/payments/manual
// (MFA + RBAC + financialGuard protected — see routes/v1/admin/paymentsRoutes.js).

export default router;
