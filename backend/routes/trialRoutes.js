import { Router } from 'express';
import { createTrial } from '../controllers/trialController.js';

const router = Router();

router.post('/', createTrial); // public: anyone can submit the form

// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly) is removed — AdminDashboard.jsx (the real,
// MFA-gated admin SPA) is its only consumer and now calls
// GET /api/v1/admin/trials instead (see routes/v1/admin/trialsRoutes.js),
// behind the real hardened admin stack.

export default router;
