import { Router } from 'express';
import Enrollment from '../../../models/Enrollment.js';
import { createCRUDController } from '../../../controllers/crudController.js';
import { approveEnrollment } from '../../../controllers/enrollmentController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { buildAdminUpdatePatch } from '../../../utils/enrollmentValidation.js';

const router = Router();

const enrollments = createCRUDController(Enrollment, {
  resourceName:   'Enrollment',
  defaultLimit:   50,
  maxLimit:       500,
  searchFields:   ['name', 'email'],
  allowedFilters: ['status', 'plan', 'country'],
  sortable:       ['createdAt', 'updatedAt', 'name', 'status'],
  // Historical offline-payment-bookkeeping fields (agreedAmount/currency/
  // paymentMethodExternal/paidAt/renewalAt) stay on the schema for old
  // documents (never deleted), but the general-purpose admin list/read API
  // never surfaces them — see models/Enrollment.js. This does not mean
  // manual/offline payment bookkeeping itself is retired (see
  // docs/current-project-status.md) — only that this particular endpoint
  // doesn't expose it; manualPaymentController.js is the live path for it.
  excludeFields:  ['agreedAmount', 'currency', 'paymentMethodExternal', 'paidAt', 'renewalAt'],
  // Replaces crudController's default generic Object.assign(doc, req.body)
  // with an explicit allowlist + validation (status enum, whatsapp format)
  // — see utils/enrollmentValidation.js for the full rationale. No
  // financial field is in that allowlist, so no request body can write one
  // through this endpoint. A validation failure is a 422, not a 500:
  // crudController's update() awaits this and lets a thrown error fall
  // through to middleware/errorHandler.js, which reads err.statusCode.
  updateMiddleware: async (body) => {
    const { patch, error } = buildAdminUpdatePatch(body);
    if (error) {
      const err = new Error(error);
      err.statusCode = 422;
      throw err;
    }
    return patch;
  },
});

// Static sub-path registered before the generic '/:id' route below, same
// convention as routes/v1/admin/usersRoutes.js's own /:id/role, /:id/
// subscription sub-paths.
router.patch('/:id/approve', requirePermissions('enrollments:write'), asyncHandler(approveEnrollment));

router.get('/',        requirePermissions('enrollments:read'),  asyncHandler(enrollments.list));
router.get('/:id',     requirePermissions('enrollments:read'),  asyncHandler(enrollments.getOne));
router.post('/',       requirePermissions('enrollments:write'), asyncHandler(enrollments.create));
router.put('/:id',     requirePermissions('enrollments:write'), asyncHandler(enrollments.update));
router.delete('/:id',  requirePermissions('enrollments:write'), asyncHandler(enrollments.remove));

export default router;
