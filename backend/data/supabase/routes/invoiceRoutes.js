// Mirrors backend/routes/invoiceRoutes.js exactly.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyInvoices, getInvoice } from '../invoiceController.js';

const router = Router();

// Same 404 as the Mongo file: the admin list is GET /api/v1/admin/invoices (AR-04).
router.get('/admin', (_req, res) => res.status(404).json({ message: 'Not found' }));
router.get('/', protect, getMyInvoices);
router.get('/:id', protect, getInvoice);

export default router;
