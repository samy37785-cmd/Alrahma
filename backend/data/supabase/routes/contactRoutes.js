// Mirrors backend/routes/contactRoutes.js exactly. Mounted at /api/contact
// by app.js only when DATA_BACKEND=supabase.
//
// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly — a regular customer session whose role claim
// said 'admin', not the real hardened admin + MFA session) is removed.
// Admin listing now lives at /api/v1/admin/contact (see
// data/supabase/admin/contactAdminRoutes.js).
import { Router } from 'express';
import { submitContact, contactValidation } from '../contactController.js';
import { contactLimiter } from '../../../config/rateLimit.js';

const router = Router();

router.post('/', contactLimiter, contactValidation, submitContact);

export default router;
