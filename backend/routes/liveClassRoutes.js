import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listClasses } from '../controllers/liveClassController.js';

const router = Router();

// All routes require a logged-in user. Listing is role-aware (see controller).
router.use(protect);

router.get('/', listClasses);

// Auth hardening security batch: the staffOnly (protect + User.role ===
// 'admin' || 'teacher') mutation routes that used to live here (POST /,
// PATCH /:id, DELETE /:id) are removed. Their only live frontend consumer
// was AdminClassesTab.jsx (the real, MFA-gated admin SPA), which was
// calling them via the plain `http` client — reachable with nothing but a
// regular User session whose `role` field said 'admin', bypassing the real
// AdminUser + MFA system entirely. There is no other live consumer today:
// TeacherDashboard.jsx (the only place a real teacher self-service flow
// for these existed) is not reachable via any route (see
// docs/user-admin-auth-contract.md §6/§11) and imports none of them.
// Admin scheduling/deletion now lives at /api/v1/admin/live-classes (see
// routes/v1/admin/liveClassesRoutes.js), behind verifyAccessToken +
// requirePermissions('live_classes:write'). A future real teacher
// self-service UI, if built, should get its own protect-scoped route here
// rather than reintroducing role-based staffOnly.

export default router;
