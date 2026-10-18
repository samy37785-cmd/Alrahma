// Mirrors backend/routes/trialRoutes.js exactly (same paths, methods,
// middleware) — only the controller implementation differs. Mounted at
// /api/trials by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { createTrial, getTrials } from '../trialController.js';
import { protect, adminOnly } from '../../../middleware/auth.js';
import { trialLimiter } from '../../../config/rateLimit.js';
import { trialValidation, rejectInvalidTrial } from '../../../utils/trialValidation.js';

const router = Router();

// public: anyone can submit the form — same limiter + validation as Mongo
router.post('/', trialLimiter, trialValidation, rejectInvalidTrial, createTrial);
router.get('/', protect, adminOnly, getTrials); // admin: view submissions

export default router;
