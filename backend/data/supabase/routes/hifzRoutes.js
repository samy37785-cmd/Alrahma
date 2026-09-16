// Mirrors backend/routes/hifzRoutes.js exactly. Mounted at /api/hifz by
// app.js only when DATA_BACKEND=supabase.
//
// Auth hardening security batch: the admin lookup that used to live here
// (GET /user/:userId, protect+adminOnly — a regular customer session whose
// role claim said 'admin', not the real hardened admin + MFA session) is
// removed. Admin lookup now lives at /api/v1/admin/users/:id/hifz (see
// data/supabase/admin/hifzProgressAdminController.js).
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyHifz, markMemorized } from '../hifzController.js';

const router = Router();

router.get('/', protect, getMyHifz);
router.put('/:chapterId', protect, markMemorized);

export default router;
