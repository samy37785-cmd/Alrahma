import { Router } from 'express';
import User from '../../../models/User.js';
import { createCRUDController } from '../../../controllers/crudController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

const users = createCRUDController(User, {
  resourceName:   'User',
  defaultLimit:   50,
  maxLimit:       500,
  searchFields:   ['name', 'email'],
  allowedFilters: ['role', 'subscription.status', 'subscription.plan'],
  sortable:       ['createdAt', 'updatedAt', 'name', 'email'],
});

router.get('/',    requirePermissions('users:read'),   asyncHandler(users.list));
router.get('/:id', requirePermissions('users:read'),   asyncHandler(users.getOne));
router.put('/:id', requirePermissions('users:write'),  asyncHandler(users.update));
router.delete('/:id', requirePermissions('users:delete'), asyncHandler(users.remove));

// Note: user creation is handled by the standard auth registration flow;
// admin-side user creation is intentionally omitted here to avoid bypassing
// email-verification and password-strength checks.

export default router;
