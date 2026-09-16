import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as users from './usersAdminController.js';
import { getUserHifz, getUserProgress } from './hifzProgressAdminController.js';

const router = Router();

// Static sub-paths registered before the generic '/:id' route — same
// ordering requirement as routes/v1/admin/usersRoutes.js.
router.get('/teachers', requirePermissions('users:read'), asyncHandler(users.listTeachers));
router.post('/',        requirePermissions('users:write'), asyncHandler(users.adminCreateUser));

router.patch('/:id/role',         requirePermissions('users:write'), asyncHandler(users.updateUserRole));
router.patch('/:id/subscription', requirePermissions('users:write'), asyncHandler(users.updateUserSubscription));
router.patch('/:id/teacher',      requirePermissions('users:write'), asyncHandler(users.assignTeacher));
router.patch('/:id/family',       requirePermissions('users:write'), asyncHandler(users.setFamilyName));

// Auth hardening security batch: mirrors routes/v1/admin/usersRoutes.js's
// own /:id/hifz and /:id/progress sub-routes exactly — closes the same gap
// on this backend (see data/supabase/routes/hifzRoutes.js,
// progressRoutes.js, and hifzProgressAdminController.js's own comment).
router.get('/:id/hifz',     requirePermissions('users:read'), asyncHandler((req, res, next) => {
  req.params.userId = req.params.id;
  return getUserHifz(req, res, next);
}));
router.get('/:id/progress', requirePermissions('users:read'), asyncHandler((req, res, next) => {
  req.params.userId = req.params.id;
  return getUserProgress(req, res, next);
}));

router.get('/',    requirePermissions('users:read'),   asyncHandler(users.list));
router.get('/:id', requirePermissions('users:read'),   asyncHandler(users.getOne));
router.put('/:id', requirePermissions('users:write'),  asyncHandler(users.update));
// Matches routes/v1/admin/usersRoutes.js's own gate exactly: 'users:delete'
// is not seeded to any role in role_permissions (0013_admin_rbac.sql), so
// this resolves the same way super-admin-only effectively does there —
// authorize()'s super-admin bypass (req.adminPermissions === ['*']) is the
// only path that ever satisfies it.
router.delete('/:id', requirePermissions('users:delete'), asyncHandler(users.remove));

export default router;
