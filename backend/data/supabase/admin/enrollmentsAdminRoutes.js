import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { FINANCIAL_FIELDS } from '../../../utils/enrollmentValidation.js';
import * as enrollments from './enrollmentsAdminController.js';

const router = Router();

// Same extra-permission boundary as the Mongo backend's enrollmentsRoutes.js
// (see that file's own comment): financial fields need `payments:write` on
// top of the base `enrollments:write` — checked here via req.adminPermissions
// (the flat list verifyAccessToken computes for Supabase-mode admins; see
// middleware/rbac.js's hasAllPermissions()), not req.adminUser.hasPermission()
// (a Mongoose-document method this backend's plain row object doesn't have).
function requireFinancialPermissionIfTouched(req, res, next) {
  const touchesFinancials = FINANCIAL_FIELDS.some((f) => req.body?.[f] !== undefined);
  if (!touchesFinancials) return next();
  const granted = req.adminPermissions ?? [];
  if (!granted.includes('*') && !granted.includes('payments:write')) {
    return res.status(403).json({ message: 'Insufficient permissions', required: ['payments:write'] });
  }
  next();
}

router.get('/',       requirePermissions('enrollments:read'),  asyncHandler(enrollments.list));
router.get('/:id',    requirePermissions('enrollments:read'),  asyncHandler(enrollments.getOne));
router.post('/',      requirePermissions('enrollments:write'), asyncHandler(enrollments.create));
router.put(
  '/:id',
  requirePermissions('enrollments:write'),
  requireFinancialPermissionIfTouched,
  asyncHandler(enrollments.update),
);
router.delete('/:id', requirePermissions('enrollments:write'), asyncHandler(enrollments.remove));

export default router;
