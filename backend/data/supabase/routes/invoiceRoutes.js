// Mirrors backend/routes/invoiceRoutes.js exactly.
//
// Auth hardening security batch: GET /admin (protect+adminOnly) removed —
// same fix as the Mongo file. Admin invoice listing lives at
// /api/v1/admin/invoices (data/supabase/admin/invoicesAdminRoutes.js).
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyInvoices, getInvoice } from '../invoiceController.js';

const router = Router();

// Review follow-up: same fix as the Mongo file — without an explicit route,
// GET /admin used to fall through to '/:id' with id='admin', which is not a
// valid UUID, surfacing as an opaque 500 instead of a clean, deliberate
// response for a stale client still hitting the old admin URL.
router.get('/admin', (req, res) => {
  res.status(410).json({
    error:   'ADMIN_ROUTE_MOVED',
    message: 'Admin invoice listing has moved to /api/v1/admin/invoices (requires a real AdminUser session with MFA).',
  });
});
router.get('/', protect, getMyInvoices);
router.get('/:id', protect, getInvoice);

export default router;
