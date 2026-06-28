import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyInvoices, getInvoice } from '../controllers/invoiceController.js';

const router = Router();

router.get('/', protect, getMyInvoices);
router.get('/:id', protect, getInvoice);

export default router;
