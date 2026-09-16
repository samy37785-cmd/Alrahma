import { Router } from 'express';
import { cardPaymentsDisabled } from '../middleware/cardPaymentsDisabled.js';
import { getManualMethods, submitManualPayment } from '../controllers/manualPaymentController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Scope correction (see docs/current-project-status.md): only ONLINE CARD
// GATEWAY execution is cancelled — Stripe checkout/webhook and PayPal's real
// Orders-API checkout/capture/webhook (controllers/stripeController.js,
// paymentController.js) stay closed with a fixed, side-effect-free 410.
// Manual/offline payment (bank transfer, Western Union, MoneyGram,
// Payoneer, PayPal-as-a-manual-transfer-address) is NOT a gateway — no SDK,
// no card, no automated capture — and is restored below.
router.post('/stripe/webhook', cardPaymentsDisabled);
router.post('/stripe', cardPaymentsDisabled);

router.post('/paypal/webhook', cardPaymentsDisabled);
router.post('/paypal', cardPaymentsDisabled);
router.post('/paypal/:orderId/capture', cardPaymentsDisabled);

router.get('/manual-methods', getManualMethods);
router.post('/manual', asyncHandler(submitManualPayment));

export default router;
