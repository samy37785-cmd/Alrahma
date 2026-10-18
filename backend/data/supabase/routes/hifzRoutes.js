// Mirrors backend/routes/hifzRoutes.js exactly. Mounted at /api/hifz by
// app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { getMyHifz, markMemorized, getUserHifz } from '../hifzController.js';

const router = Router();

router.get('/', protect, getMyHifz);
router.put('/:chapterId', protect, markMemorized);
router.get('/user/:userId', protect, adminOnly, getUserHifz);

export default router;
