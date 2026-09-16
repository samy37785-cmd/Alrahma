// Mirrors backend/routes/subscriberRoutes.js exactly (same paths, methods,
// middleware) — only the controller implementation differs. Mounted at
// /api/newsletter by app.js only when DATA_BACKEND=supabase.
//
// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly — a regular customer session whose role claim
// said 'admin', not the real hardened admin + MFA session) is removed. No
// safe Supabase admin adapter exists yet for subscribers — the real
// /api/v1/admin/subscribers route returns an explicit 501 under
// DATA_BACKEND=supabase (see routes/v1/admin/index.js) rather than silently
// reintroducing this hole.
import { Router } from 'express';
import { subscribe, subscribeValidation } from '../subscriberController.js';
import { newsletterLimiter } from '../../../config/rateLimit.js';

const router = Router();

router.post('/', newsletterLimiter, subscribeValidation, subscribe);

export default router;
