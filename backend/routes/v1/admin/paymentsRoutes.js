import { Router } from 'express';
import { listManualPayments, reviewManualPayment } from '../../../controllers/manualPaymentController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { financialGuard } from '../../../middleware/maintenanceGuard.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get('/manual', requirePermissions('payments:read'), asyncHandler(listManualPayments));

// financialGuard is applied here, at the route level, not router-wide —
// it must only block the actual money-moving mutation (approve/reject),
// never the read-only list above. Super-admins bypass the freeze (see
// middleware/maintenanceGuard.js) so an emergency refund/approval can still
// go through while financials are otherwise locked.
router.patch(
  '/manual/:id',
  requirePermissions('payments:write'),
  financialGuard,
  asyncHandler(reviewManualPayment),
);

export default router;
