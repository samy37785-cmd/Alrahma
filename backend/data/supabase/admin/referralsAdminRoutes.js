import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { convertReferral } from './referralsAdminController.js';

const router = Router();

router.patch('/:id/convert', requirePermissions('referrals:write'), asyncHandler(convertReferral));

export default router;
