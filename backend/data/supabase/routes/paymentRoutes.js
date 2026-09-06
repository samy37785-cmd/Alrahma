// Mirrors backend/routes/paymentRoutes.js. Stripe/PayPal checkout-session
// creation, webhook handling, and capture are implemented (test/mock mode
// only — see stripeController.js/paypalController.js's module comments);
// manual payments (submit-only; admin review lives at /api/v1/admin/payments)
// have been implemented since Stage 2E.
import { Router } from 'express';
import { softProtect } from '../../../middleware/auth.js';
import { getManualMethods, submitManualPayment } from '../manualPaymentController.js';
import { createStripeSession, stripeWebhook } from '../stripeController.js';
import { createPaypalOrder, capturePaypalOrder, paypalWebhook } from '../paypalController.js';

const router = Router();

router.get('/manual-methods', getManualMethods);
router.post('/manual', softProtect, submitManualPayment);

// Webhook must come before any body-parser; raw body is set in app.js
// exactly like the Mongo path's route (same raw-body middleware wiring is
// keyed off the path, not the backend).
router.post('/stripe/webhook', stripeWebhook);
router.post('/stripe', softProtect, createStripeSession);

router.post('/paypal/webhook', paypalWebhook);
router.post('/paypal', softProtect, createPaypalOrder);
router.post('/paypal/:orderId/capture', capturePaypalOrder);

export default router;
