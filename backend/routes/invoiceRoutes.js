import { Router } from 'express';
import { getMyInvoices, getInvoice } from '../controllers/invoiceController.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Scope correction (see docs/current-project-status.md): invoices are
// archival billing records (created by manual-payment approval / booking
// activation), not an online card-gateway feature — the customer's own
// invoices stay live here. The legacy GET /admin listing (protect+adminOnly,
// reachable with nothing but a regular User session whose `role` field said
// 'admin') is deliberately NOT restored — same "Auth hardening security
// batch" reasoning already applied to routes/enrollmentRoutes.js: the real,
// hardened admin listing lives at /api/v1/admin/invoices (MFA + RBAC +
// audit-logged — see routes/v1/admin/invoicesRoutes.js).
router.get('/',    protect, asyncHandler(getMyInvoices));
router.get('/:id', protect, asyncHandler(getInvoice));

export default router;
