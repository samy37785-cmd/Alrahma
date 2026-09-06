import { Router } from 'express';
import Enrollment from '../../../models/Enrollment.js';
import { createCRUDController } from '../../../controllers/crudController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

const enrollments = createCRUDController(Enrollment, {
  resourceName:   'Enrollment',
  defaultLimit:   50,
  maxLimit:       500,
  searchFields:   ['name', 'email'],
  allowedFilters: ['status', 'plan', 'country'],
  sortable:       ['createdAt', 'updatedAt', 'name', 'status'],
});

router.get('/',        requirePermissions('enrollments:read'),  asyncHandler(enrollments.list));
router.get('/:id',     requirePermissions('enrollments:read'),  asyncHandler(enrollments.getOne));
router.post('/',       requirePermissions('enrollments:write'), asyncHandler(enrollments.create));
router.put('/:id',     requirePermissions('enrollments:write'), asyncHandler(enrollments.update));
router.delete('/:id',  requirePermissions('enrollments:write'), asyncHandler(enrollments.remove));

export default router;
