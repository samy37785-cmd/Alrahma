// Mirrors backend/routes/certificateRoutes.js exactly. Mounted at
// /api/certificates by app.js only when DATA_BACKEND=supabase.
//
// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly — a regular customer session whose role claim
// said 'admin', not the real hardened admin + MFA session) is removed.
// Admin listing now lives at /api/v1/admin/certificates (see
// data/supabase/admin/adminRoutes.js's certificatesRouter).
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyCertificates } from '../certificateController.js';

const router = Router();

router.get('/mine', protect, getMyCertificates);

export default router;
