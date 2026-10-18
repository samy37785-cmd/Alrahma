import { Router } from 'express';
import {
  adminListClasses, adminCreateClass, adminUpdateClass, adminDeleteClass,
} from '../../../controllers/liveClassAdminController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// The admin console's Classes tab. Reading names students and teachers, so it
// takes users:read (viewer and admin); changing classes takes live_classes:write
// (admin and super-admin).
router.get('/',       requirePermissions('users:read'),         asyncHandler(adminListClasses));
router.post('/',      requirePermissions('live_classes:write'), asyncHandler(adminCreateClass));
router.patch('/:id',  requirePermissions('live_classes:write'), asyncHandler(adminUpdateClass));
router.delete('/:id', requirePermissions('live_classes:write'), asyncHandler(adminDeleteClass));

export default router;
