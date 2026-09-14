// Auth hardening security batch: GET /api/trials used to be gated only by
// the legacy protect+adminOnly stack (routes/trialRoutes.js) — a regular
// User session whose `role` field said 'admin' was sufficient, no real
// AdminUser/MFA session required. AdminDashboard.jsx (the real, MFA-gated
// admin SPA) was actually calling that legacy endpoint via the plain `http`
// client, not `adminHttp` — a genuine live gap, not just a theoretical one.
// This is the real, hardened replacement; routes/trialRoutes.js's own GET /
// was removed once this was proven equivalent.
import { Router } from 'express';
import { getTrials } from '../../../controllers/trialController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get('/', requirePermissions('users:read'), asyncHandler(getTrials));

export default router;
