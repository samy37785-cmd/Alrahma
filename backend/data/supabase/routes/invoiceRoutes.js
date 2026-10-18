// Mirrors backend/routes/invoiceRoutes.js exactly.
import { Router } from 'express';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { getAdminInvoices, getMyInvoices, getInvoice } from '../invoiceController.js';

const router = Router();

router.get('/admin', protect, adminOnly, getAdminInvoices);
router.get('/', protect, getMyInvoices);
router.get('/:id', protect, getInvoice);

export default router;
