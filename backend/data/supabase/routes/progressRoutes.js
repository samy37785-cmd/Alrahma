// Mirrors backend/routes/progressRoutes.js exactly. Mounted at /api/progress
// by app.js only when DATA_BACKEND=supabase.
//
// Auth hardening security batch: the admin lookup that used to live here
// (GET /user/:userId, protect+adminOnly — a regular customer session whose
// role claim said 'admin', not the real hardened admin + MFA session) is
// removed. Admin lookup now lives at /api/v1/admin/users/:id/progress (see
// data/supabase/admin/hifzProgressAdminController.js).
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getCourseProgress, toggleProgress } from '../courseProgressController.js';

const router = Router();

router.get('/:courseId', protect, getCourseProgress);
router.put('/:courseId', protect, toggleProgress);

export default router;
