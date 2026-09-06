import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { getAdminInvoices, getMyInvoices, getInvoice } from '../controllers/invoiceController.js';

const router = Router();

router.get('/admin', protect, adminOnly, getAdminInvoices); // admin: all invoices
router.get('/',      protect, getMyInvoices);               // student: own invoices
router.get('/:id',   protect, getInvoice);                  // student: one invoice

export default router;
