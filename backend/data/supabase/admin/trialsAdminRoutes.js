// Production-readiness audit follow-up (2026-09-17): closes the
// GET /api/v1/admin/trials gap under DATA_BACKEND=supabase — see
// trialsAdminController.js's header comment. Same requirePermissions
// gate as the Mongo side's trialsRoutes.js.
import { Router } from 'express';
import { list } from './trialsAdminController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get('/', requirePermissions('users:read'), asyncHandler(list));

export default router;
