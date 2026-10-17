// Mirrors backend/routes/certificateRoutes.js exactly. Mounted at
// /api/certificates by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyCertificates } from '../certificateController.js';

const router = Router();

router.get('/mine', protect, getMyCertificates);

export default router;
