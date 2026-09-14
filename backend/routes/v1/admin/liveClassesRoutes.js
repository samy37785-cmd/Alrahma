// Auth hardening security batch: Mongo mode had NO real admin route for
// live classes at all — /api/v1/admin/live-classes 404'd unconditionally
// for Mongo (see index.js, pre-fix), while AdminClassesTab.jsx (the real
// MFA-gated admin SPA) actually scheduled/deleted classes via the legacy
// `staffOnly` (protect + User.role === 'admin'/'teacher') routes at
// /api/classes, reachable with nothing but a regular User session. This is
// the real, hardened replacement — permission-gated the same way the
// Supabase admin adapter's equivalent router already is (data/supabase/
// admin/adminRoutes.js's liveClassesRouter), for one shared RBAC
// vocabulary across both backends. routes/liveClassRoutes.js's own
// staffOnly mutation routes were removed; its role-aware GET / (self-
// service listing for a real teacher/student/parent/admin regular session)
// is unrelated and untouched.
import { Router } from 'express';
import {
  adminListClasses, adminCreateClass, adminUpdateClass, adminDeleteClass,
} from '../../../controllers/liveClassController.js';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(adminListClasses));
router.post('/', requirePermissions('live_classes:write'), asyncHandler(adminCreateClass));
router.patch('/:id', requirePermissions('live_classes:write'), asyncHandler(adminUpdateClass));
router.delete('/:id', requirePermissions('live_classes:write'), asyncHandler(adminDeleteClass));

export default router;
