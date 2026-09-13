import { Router } from 'express';
import { paypalWebhook } from '../controllers/paymentController.js';
import { stripeWebhook } from '../controllers/stripeController.js';
import { paymentsDisabled } from '../middleware/paymentsDisabled.js';

const router = Router();

// Booking-First Enrollment — WhatsApp + offline payment, admin activates
// manually; see docs/current-project-status.md. Every customer-reachable
// payment-initiation/execution endpoint below now returns 410
// PAYMENTS_DISABLED instead of running the real gateway controller — this
// is a server-side close, not just a frontend UI removal, so a stale
// client/bookmarked link/direct API call can never start or complete an
// online payment. The gateway controllers themselves (createStripeSession,
// createPaypalOrder, capturePaypalOrder, getManualMethods,
// submitManualPayment) are untouched in controllers/ — kept as legacy/
// deferred code, still exercised by the webhook safety-net paths below and
// available if this decision is ever reversed. Historical Payment/Invoice/
// ManualPayment records and their admin review UI are unaffected.

// --- Stripe (cards + Apple Pay + Google Pay) ---
// Webhook must come before any body-parser; raw body is set in app.js.
// Kept live: it only ever reacts to Stripe's own server-to-server calls for
// payments that were already created before this change, never something a
// customer can trigger themselves.
router.post('/stripe/webhook', stripeWebhook);
router.post('/stripe', paymentsDisabled);

// --- PayPal API ---
// Webhook kept live for the same reason as Stripe's above. Both the
// order-creation AND the browser-driven capture step are disabled — an
// order can no longer be created, so there is nothing legitimate left to
// capture from a customer request either.
router.post('/paypal/webhook', paypalWebhook);
router.post('/paypal', paymentsDisabled);
router.post('/paypal/:orderId/capture', paymentsDisabled);

// --- Manual payment methods (WU / MoneyGram / Payoneer / IBAN / etc.) ---
router.get('/manual-methods', paymentsDisabled);
router.post('/manual', paymentsDisabled);

// Admin review of manual payments now lives at /api/v1/admin/payments/manual
// (MFA + RBAC + financialGuard protected — see routes/v1/admin/paymentsRoutes.js).

export default router;
