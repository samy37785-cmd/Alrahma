// Mirrors backend/routes/trialRoutes.js exactly (same paths, methods,
// middleware) — only the controller implementation differs. Mounted at
// /api/trials by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { createTrial, getTrials } from '../trialController.js';
import { protect, adminOnly } from '../../../middleware/auth.js';

const router = Router();

router.post('/', createTrial); // public: anyone can submit the form
router.get('/', protect, adminOnly, getTrials); // admin: view submissions

export default router;
