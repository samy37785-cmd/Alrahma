// Scope correction (see docs/current-project-status.md): mirrors
// backend/routes/invoiceRoutes.js exactly - invoices are archival billing
// records, not an online card-gateway feature, so the customer's own
// invoices stay live under DATA_BACKEND=supabase too. GET /admin stays
// mounted to getAdminInvoices, which - unlike the Mongo controller of the
// same name - never touches the database: it always returns a structured
// 400 pointing callers at the real /api/v1/admin/invoices endpoint (no AAL2
// concept exists under this customer-session router), so restoring it here
// reopens no data-leak risk. Mongo's equivalent GET /admin route is NOT
// restored (see routes/invoiceRoutes.js) because its controller has no
// internal auth check at all and previously relied on route-level
// protect+adminOnly that the "Auth hardening security batch" deliberately
// removed - an asymmetry that is intentional, not an oversight.
import { Router } from 'express';
import { getAdminInvoices, getMyInvoices, getInvoice } from '../invoiceController.js';
import { protect } from '../../../middleware/auth.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get('/admin', asyncHandler(getAdminInvoices));
router.get('/',    protect, asyncHandler(getMyInvoices));
router.get('/:id', protect, asyncHandler(getInvoice));

export default router;
