// Scope correction (see docs/current-project-status.md): mirrors
// backend/routes/paymentRoutes.js exactly. Only online card-gateway
// execution (Stripe, PayPal's real Orders-API checkout/capture/webhook —
// data/supabase/paypalController.js) stays closed; manual/offline payment
// submission is restored, since app.js mounts this file instead of the
// Mongo one whenever DATA_BACKEND=supabase.
import { Router } from 'express';
import { cardPaymentsDisabled } from '../../../middleware/cardPaymentsDisabled.js';
import { getManualMethods, submitManualPayment } from '../manualPaymentController.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.post('/stripe/webhook', cardPaymentsDisabled);
router.post('/stripe', cardPaymentsDisabled);

router.post('/paypal/webhook', cardPaymentsDisabled);
router.post('/paypal', cardPaymentsDisabled);
router.post('/paypal/:orderId/capture', cardPaymentsDisabled);

router.get('/manual-methods', getManualMethods);
router.post('/manual', asyncHandler(submitManualPayment));

export default router;
