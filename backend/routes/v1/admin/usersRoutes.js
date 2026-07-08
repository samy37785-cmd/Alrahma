import { Router } from 'express';
import User from '../../../models/User.js';
import { createCRUDController } from '../../../controllers/crudController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Explicit allowlist of fields an admin may edit via the generic PUT /:id
// endpoint. This MUST stay an allowlist, not a denylist: `update()` in
// crudController.js does an unfiltered `Object.assign(doc, body)`, so any
// field not excluded here would otherwise be directly settable, including
// `password`, `role`, `subscription`, `resetToken`/`resetTokenExpiry`
// (select:false but still writable via assign), `tokenVersion`, `googleId`,
// and `referralCode`. Role/subscription/teacher changes already have their
// own dedicated, audited endpoints (see routes/authRoutes.js) with their
// own validation — this endpoint is for basic profile/display fields only.
const USER_UPDATABLE_FIELDS = [
  'name', 'email', 'familyName',
  'specialization', 'bio', 'gender', 'languages', 'subjects', 'rating',
];

const users = createCRUDController(User, {
  resourceName:   'User',
  defaultLimit:   50,
  maxLimit:       500,
  searchFields:   ['name', 'email'],
  allowedFilters: ['role', 'subscription.status', 'subscription.plan'],
  sortable:       ['createdAt', 'updatedAt', 'name', 'email'],
  updateMiddleware: async (body) => {
    const filtered = {};
    for (const key of USER_UPDATABLE_FIELDS) {
      if (body[key] !== undefined) filtered[key] = body[key];
    }
    return filtered;
  },
});

router.get('/',    requirePermissions('users:read'),   asyncHandler(users.list));
router.get('/:id', requirePermissions('users:read'),   asyncHandler(users.getOne));
router.put('/:id', requirePermissions('users:write'),  asyncHandler(users.update));
router.delete('/:id', requirePermissions('users:delete'), asyncHandler(users.remove));

// Note: user creation is handled by the standard auth registration flow;
// admin-side user creation is intentionally omitted here to avoid bypassing
// email-verification and password-strength checks.

export default router;
