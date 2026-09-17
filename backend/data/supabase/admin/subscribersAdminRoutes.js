// Production-readiness audit follow-up (2026-09-17): closes the
// GET /api/v1/admin/subscribers gap under DATA_BACKEND=supabase — see
// subscribersAdminController.js's header comment. Same requirePermissions
// gate as the Mongo side's subscribersRoutes.js.
import { Router } from 'express';
import { list } from './subscribersAdminController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get('/', requirePermissions('users:read'), asyncHandler(list));

export default router;
