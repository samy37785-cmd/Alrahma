import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMyHifz, markMemorized } from '../controllers/hifzController.js';

const router = Router();

router.get('/', protect, getMyHifz);
router.put('/:chapterId', protect, markMemorized);

// Auth hardening security batch: the admin report that used to live here
// (GET /user/:userId, protect+adminOnly) is removed — AdminProgressModal.jsx
// (the real, MFA-gated admin SPA) is its only consumer and now calls
// GET /api/v1/admin/users/:id/hifz instead (see routes/v1/admin/
// usersRoutes.js), behind the real hardened admin stack.

export default router;
