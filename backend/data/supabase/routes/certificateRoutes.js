// Mirrors backend/routes/certificateRoutes.js exactly. Mounted at
// /api/certificates by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { getMyCertificates, listCertificates } from '../certificateController.js';

const router = Router();

router.get('/mine', protect, getMyCertificates);
router.get('/', protect, adminOnly, listCertificates);

export default router;
