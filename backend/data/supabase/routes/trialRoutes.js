// Mirrors backend/routes/trialRoutes.js exactly (same paths, methods,
// middleware) — only the controller implementation differs. Mounted at
// /api/trials by app.js only when DATA_BACKEND=supabase.
//
// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly — a regular customer session whose role claim
// said 'admin', not the real hardened admin + MFA session) is removed. No
// safe Supabase admin adapter exists yet for trials — the real
// /api/v1/admin/trials route returns an explicit 501 under
// DATA_BACKEND=supabase (see routes/v1/admin/index.js) rather than silently
// reintroducing this hole.
import { Router } from 'express';
import { createTrial, trialValidation } from '../trialController.js';
import { trialLimiter } from '../../../config/rateLimit.js';

const router = Router();

router.post('/', trialLimiter, trialValidation, createTrial); // public: anyone can submit the form

export default router;
