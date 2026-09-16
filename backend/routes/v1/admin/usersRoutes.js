import { Router } from 'express';
import User from '../../../models/User.js';
import { createCRUDController } from '../../../controllers/crudController.js';
import {
  listTeachers, adminCreateUser, updateUserRole,
  assignTeacher, setFamilyName, updateUserSubscription,
} from '../../../controllers/userAdminController.js';
import { getUserHifz } from '../../../controllers/hifzController.js';
import { getUserProgress } from '../../../controllers/progressController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// Explicit allowlist of fields an admin may edit via the generic PUT /:id
// endpoint. This MUST stay an allowlist, not a denylist: `update()` in
// crudController.js does an unfiltered `Object.assign(doc, body)`, so any
// field not excluded here would otherwise be directly settable, including
// `password`, `role`, `subscription`, `resetToken`/`resetTokenExpiry`
// (select:false but still writable via assign), `tokenVersion`, `googleId`,
// and `referralCode`. Role/subscription/teacher changes go through the
// dedicated, audited sub-routes below with their own validation — this
// endpoint is for basic profile/display fields only.
const USER_UPDATABLE_FIELDS = [
  'name', 'email', 'familyName',
  'specialization', 'bio', 'gender', 'languages', 'subjects', 'rating',
];

const users = createCRUDController(User, {
  resourceName:   'User',
  defaultLimit:   50,
  maxLimit:       500,
  searchFields:   ['name', 'email'],
  // subscription.status/subscription.plan use { param, field } mapping (see
  // crudController.js's allowedFilters handling) — a dotted wire-level
  // query param would be stripped by sanitizeMongo.js (mounted globally on
  // this router) before this filter ever saw it, silently making the
  // filter dead. Auth hardening security batch.
  allowedFilters: [
    'role',
    { param: 'subscriptionStatus', field: 'subscription.status' },
    { param: 'subscriptionPlan',   field: 'subscription.plan' },
  ],
  populateFields: ['teacher'],
  sortable:       ['createdAt', 'updatedAt', 'name', 'email'],
  updateMiddleware: async (body) => {
    const filtered = {};
    for (const key of USER_UPDATABLE_FIELDS) {
      if (body[key] !== undefined) filtered[key] = body[key];
    }
    return filtered;
  },
});

// Static sub-paths must be registered before the generic '/:id' route below,
// otherwise Express would match e.g. GET /teachers as GET /:id with
// id === 'teachers'.
router.get('/teachers', requirePermissions('users:read'),  asyncHandler(listTeachers));
router.post('/',        requirePermissions('users:write'), asyncHandler(adminCreateUser));

router.patch('/:id/role',         requirePermissions('users:write'), asyncHandler(updateUserRole));
router.patch('/:id/subscription', requirePermissions('users:write'), asyncHandler(updateUserSubscription));
router.patch('/:id/teacher',      requirePermissions('users:write'), asyncHandler(assignTeacher));
router.patch('/:id/family',       requirePermissions('users:write'), asyncHandler(setFamilyName));

// Auth hardening security batch: these two used to live only at
// GET /api/hifz/user/:userId and GET /api/progress/user/:userId
// (routes/hifzRoutes.js, routes/progressRoutes.js), gated by the legacy
// protect+adminOnly stack — reachable with nothing but a regular User
// session whose `role` field said 'admin'. AdminProgressModal.jsx (the
// real admin SPA) was calling both via the plain `http` client, a genuine
// live gap. Migrated here, as sub-paths of the user they report on
// (matching this router's own /:id/role, /:id/teacher convention); the
// legacy GET routes were removed from their original files.
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
router.delete('/:id', requirePermissions('users:delete'), asyncHandler(users.remove));

export default router;
