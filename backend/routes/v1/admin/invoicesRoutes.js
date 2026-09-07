// Mongo-mode admin invoices, mounted under the real hardened admin router
// (verifyAccessToken + maintenanceGuard already ran — see index.js) instead
// of the customer-session protect+adminOnly path that routes/invoiceRoutes.js
// still uses. Reuses the same, already-correct query logic — the fix here is
// entirely about WHERE this is mounted, not what it queries.
import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { getAdminInvoices } from '../../../controllers/invoiceController.js';

const router = Router();

router.get('/', requirePermissions('payments:read'), asyncHandler(getAdminInvoices));

export default router;
