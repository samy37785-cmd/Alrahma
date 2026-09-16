import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as enrollments from './enrollmentsAdminController.js';

const router = Router();

// Static sub-path registered before the generic '/:id' route below, same
// convention as routes/v1/admin/enrollmentsRoutes.js's own /:id/approve.
router.patch('/:id/approve', requirePermissions('enrollments:write'), asyncHandler(enrollments.approve));

router.get('/',       requirePermissions('enrollments:read'),  asyncHandler(enrollments.list));
router.get('/:id',    requirePermissions('enrollments:read'),  asyncHandler(enrollments.getOne));
router.post('/',      requirePermissions('enrollments:write'), asyncHandler(enrollments.create));
router.put('/:id',    requirePermissions('enrollments:write'), asyncHandler(enrollments.update));
router.delete('/:id', requirePermissions('enrollments:write'), asyncHandler(enrollments.remove));

export default router;
