import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyInvoices, getInvoice } from '../controllers/invoiceController.js';

const router = Router();

// Auth hardening security batch: the admin listing that used to live here
// (GET /admin, protect+adminOnly, zero live frontend consumer — see
// routes/v1/admin/invoicesRoutes.js's own header comment) is removed.
// Admin invoice listing lives at /api/v1/admin/invoices (MFA + RBAC).
//
// Review follow-up: removing that route outright let GET /admin fall
// through to the '/:id' route below instead, with id='admin' — an invalid
// ObjectId, so Invoice.findOne({ _id: 'admin', ... }) threw a Mongoose
// CastError before ever reaching getInvoice()'s own 404 check, surfacing as
// an opaque 500 to any stale client (bookmark, cached SPA bundle) still
// hitting the old admin URL. An explicit route wins the match over the
// param route (Express tries routes in registration order) and returns a
// clean, deliberate response instead — same "old client fails predictably"
// spirit as middleware/paymentsDisabled.js.
router.get('/admin', (req, res) => {
  res.status(410).json({
    error:   'ADMIN_ROUTE_MOVED',
    message: 'Admin invoice listing has moved to /api/v1/admin/invoices (requires a real AdminUser session with MFA).',
  });
});
router.get('/',      protect, getMyInvoices);               // student: own invoices
router.get('/:id',   protect, getInvoice);                  // student: one invoice

export default router;
