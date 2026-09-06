// Mirrors backend/routes/quranMemoRoutes.js exactly (same paths, methods,
// `protect` middleware) — only the controller implementation differs.
// Mounted at /api/quran-memo by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getMyMemoStats, updateMemoGoal, logPractice } from '../quranMemoController.js';

const router = Router();

router.get('/',       protect, getMyMemoStats);
router.put('/goal',   protect, updateMemoGoal);
router.post('/log',   protect, logPractice);

export default router;
