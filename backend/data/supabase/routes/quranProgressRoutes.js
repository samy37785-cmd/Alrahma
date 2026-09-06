// Mirrors backend/routes/quranProgressRoutes.js exactly (same paths, methods,
// `protect` middleware) — only the controller implementation differs.
// Mounted at /api/quran-progress by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyProgress, updatePosition, updateGoal, logReading } from '../quranProgressController.js';

const router = Router();

router.get('/',          protect, getMyProgress);
router.put('/position',  protect, updatePosition);
router.put('/goal',      protect, updateGoal);
router.post('/log',      protect, logReading);

export default router;
