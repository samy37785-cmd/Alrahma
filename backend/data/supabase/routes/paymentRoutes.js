// Booking-First Enrollment — WhatsApp + offline payment, admin activates
// manually; see docs/current-project-status.md. Mirrors
// backend/routes/paymentRoutes.js's shutdown exactly: every customer-
// reachable payment-initiation/execution endpoint returns 410
// PAYMENTS_DISABLED at the route level, on BOTH backends, since app.js
// mounts this file instead of the Mongo one whenever DATA_BACKEND=supabase
// — closing only the Mongo path would leave the Supabase deployment mode
// fully exploitable. The gateway controllers themselves
// (createStripeSession, createPaypalOrder, capturePaypalOrder,
// getManualMethods, submitManualPayment) are untouched here — kept as
// legacy/deferred code, still exercised by the webhook safety-net paths
// below and available if this decision is ever reversed.
import { Router } from 'express';
import { stripeWebhook } from '../stripeController.js';
import { paypalWebhook } from '../paypalController.js';
import { paymentsDisabled } from '../../../middleware/paymentsDisabled.js';

const router = Router();

// Webhook must come before any body-parser; raw body is set in app.js
// exactly like the Mongo path's route (same raw-body middleware wiring is
// keyed off the path, not the backend). Kept live: it only ever reacts to
// Stripe's/PayPal's own server-to-server calls for payments that were
// already created before this change, never something a customer can
// trigger themselves.
router.post('/stripe/webhook', stripeWebhook);
router.post('/stripe', paymentsDisabled);

router.post('/paypal/webhook', paypalWebhook);
router.post('/paypal', paymentsDisabled);
router.post('/paypal/:orderId/capture', paymentsDisabled);

router.get('/manual-methods', paymentsDisabled);
router.post('/manual', paymentsDisabled);

export default router;
