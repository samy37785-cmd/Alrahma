import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { financialGuard } from '../../../middleware/maintenanceGuard.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { listManualPayments, reviewManualPayment, recordRefund } from './paymentsAdminController.js';

const router = Router();

router.get('/manual', requirePermissions('payments:read'), asyncHandler(listManualPayments));

// financialGuard applied at the route level only — must never block the
// read-only list above (see routes/v1/admin/paymentsRoutes.js's identical
// reasoning for the Mongo path).
router.patch('/manual/:id', requirePermissions('payments:write'), financialGuard, asyncHandler(reviewManualPayment));
router.post('/:id/refund', requirePermissions('payments:write'), financialGuard, asyncHandler(recordRefund));

export default router;
