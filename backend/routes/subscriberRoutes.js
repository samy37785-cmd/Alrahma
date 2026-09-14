import { Router } from 'express';
import { subscribe } from '../controllers/subscriberController.js';

const router = Router();

router.post('/', subscribe);

// Auth hardening security batch: the admin listing that used to live here
// (GET /, protect+adminOnly) is removed — AdminDashboard.jsx (the real,
// MFA-gated admin SPA) is its only consumer and now calls
// GET /api/v1/admin/subscribers instead (see routes/v1/admin/
// subscribersRoutes.js), behind the real hardened admin stack.

export default router;
