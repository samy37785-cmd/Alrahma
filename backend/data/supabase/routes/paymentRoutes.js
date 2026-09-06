// Mirrors backend/routes/paymentRoutes.js — but Stripe/PayPal checkout-
// session creation and webhook handling are deliberately NOT implemented in
// this pass (see docs/option-a-mongo-supabase-parity-map.md, "Payment"
// section): correctly reimplementing gateway signature verification,
// idempotency, and the transactional payments/subscriptions/invoices writes
// against a fundamentally different RLS/RPC model is a substantial, high-
// risk piece of work that deserves its own dedicated, carefully-reviewed
// follow-up rather than being rushed alongside the rest of Stage 2E. Manual
// payments (submit-only; admin review is AAL2-blocked) are implemented.
import { Router } from 'express';
import { softProtect } from '../../../middleware/auth.js';
import { getManualMethods, submitManualPayment } from '../manualPaymentController.js';

const router = Router();

router.get('/manual-methods', getManualMethods);
router.post('/manual', softProtect, submitManualPayment);

// Not implemented under DATA_BACKEND=supabase — see module comment above.
const notImplemented = (_req, res) => {
  res.status(501).json({
    message:
      'Stripe/PayPal checkout is not implemented under DATA_BACKEND=supabase yet — see docs/option-a-mongo-supabase-parity-map.md.',
  });
};
router.post('/stripe/webhook', notImplemented);
router.post('/stripe', notImplemented);
router.post('/paypal/webhook', notImplemented);
router.post('/paypal', notImplemented);
router.post('/paypal/:orderId/capture', notImplemented);

export default router;
