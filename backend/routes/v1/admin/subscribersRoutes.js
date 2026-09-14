// Auth hardening security batch: same gap and fix as trialsRoutes.js, for
// GET /api/newsletter (routes/subscriberRoutes.js) — also called by
// AdminDashboard.jsx via the plain `http` client.
import { Router } from 'express';
import { listSubscribers } from '../../../controllers/subscriberController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get('/', requirePermissions('users:read'), asyncHandler(listSubscribers));

export default router;
