import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyInvoices, getInvoice } from '../controllers/invoiceController.js';

const router = Router();

// The admin invoice list is GET /api/v1/admin/invoices (AR-04). This old path
// answers 404 itself so it is never read as GET /:id with id 'admin'.
router.get('/admin', (_req, res) => res.status(404).json({ message: 'Not found' }));
router.get('/',      protect, getMyInvoices);               // student: own invoices
router.get('/:id',   protect, getInvoice);                  // student: one invoice

export default router;
