import { Router } from 'express';
import Enrollment from '../../../models/Enrollment.js';
import { createCRUDController } from '../../../controllers/crudController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { buildAdminUpdatePatch, FINANCIAL_FIELDS } from '../../../utils/enrollmentValidation.js';

const router = Router();

const enrollments = createCRUDController(Enrollment, {
  resourceName:   'Enrollment',
  defaultLimit:   50,
  maxLimit:       500,
  searchFields:   ['name', 'email'],
  allowedFilters: ['status', 'plan', 'country'],
  sortable:       ['createdAt', 'updatedAt', 'name', 'status'],
  // Replaces crudController's default generic Object.assign(doc, req.body)
  // with an explicit allowlist + validation (status enum + the enrolled/
  // agreedAmount cross-field rule, amount >= 0, ISO currency, valid dates,
  // whatsapp format) — see utils/enrollmentValidation.js for the full
  // rationale. A validation failure is a 422, not a 500: crudController's
  // update() awaits this and lets a thrown error fall through to
  // middleware/errorHandler.js, which reads err.statusCode.
  updateMiddleware: async (body, doc) => {
    const { patch, error } = buildAdminUpdatePatch(body, doc);
    if (error) {
      const err = new Error(error);
      err.statusCode = 422;
      throw err;
    }
    return patch;
  },
});

// Financial fields (agreedAmount/currency/paymentMethodExternal/paidAt/
// renewalAt) require `payments:write` on top of the base `enrollments:write`
// — 'editor' has enrollments:write but not payments:write (see
// ROLE_PERMISSIONS in models/AdminUser.js), so an editor can move a booking
// through its status/contact fields but cannot record what money changed
// hands; only admin/super-admin can. Mirrors the same extra-permission
// boundary already used for ManualPayment review.
function requireFinancialPermissionIfTouched(req, res, next) {
  const touchesFinancials = FINANCIAL_FIELDS.some((f) => req.body?.[f] !== undefined);
  if (!touchesFinancials) return next();
  if (!req.adminUser.hasPermission('payments:write')) {
    return res.status(403).json({ message: 'Insufficient permissions', required: ['payments:write'] });
  }
  next();
}

router.get('/',        requirePermissions('enrollments:read'),  asyncHandler(enrollments.list));
router.get('/:id',     requirePermissions('enrollments:read'),  asyncHandler(enrollments.getOne));
router.post('/',       requirePermissions('enrollments:write'), asyncHandler(enrollments.create));
router.put(
  '/:id',
  requirePermissions('enrollments:write'),
  requireFinancialPermissionIfTouched,
  asyncHandler(enrollments.update),
);
router.delete('/:id',  requirePermissions('enrollments:write'), asyncHandler(enrollments.remove));

export default router;
