// DATA_BACKEND=supabase admin sub-routers for the 4 domains named in Stage
// 2F's admin-adapter closure: Courses CRUD, Live Classes CRUD, Certificate
// issue/revoke, Review moderation. Mounted from routes/v1/admin/index.js
// exactly like the existing /auth backend-branch. requirePermissions() below
// resolves against req.adminPermissions under this backend (see
// middleware/rbac.js) rather than a Mongoose AdminUser method.
import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as courses from './coursesAdminController.js';
import * as liveClasses from './liveClassesAdminController.js';
import * as certificates from './certificatesAdminController.js';
import * as reviews from './reviewsAdminController.js';

export const coursesRouter = Router();
coursesRouter.get('/', requirePermissions('courses:read'), asyncHandler(courses.list));
coursesRouter.get('/:id', requirePermissions('courses:read'), asyncHandler(courses.getOne));
coursesRouter.post('/', requirePermissions('courses:write'), asyncHandler(courses.create));
coursesRouter.put('/:id', requirePermissions('courses:write'), asyncHandler(courses.update));
coursesRouter.delete('/:id', requirePermissions('courses:write'), asyncHandler(courses.remove));

// live_classes has no *:read permission in role_permissions (RLS's
// live_classes_select_participant_or_admin already allows any admin to read,
// unconditionally — see lib/db/drizzle/0015_new_domains_rls.sql) — only
// mutations are permission-gated, matching that DB-level design.
export const liveClassesRouter = Router();
liveClassesRouter.get('/', asyncHandler(liveClasses.list));
liveClassesRouter.post('/', requirePermissions('live_classes:write'), asyncHandler(liveClasses.create));
liveClassesRouter.patch('/:id', requirePermissions('live_classes:write'), asyncHandler(liveClasses.update));
liveClassesRouter.delete('/:id', requirePermissions('live_classes:write'), asyncHandler(liveClasses.remove));

export const certificatesRouter = Router();
certificatesRouter.post('/', requirePermissions('certificates:write'), asyncHandler(certificates.issueCertificate));
certificatesRouter.delete('/:id', requirePermissions('certificates:write'), asyncHandler(certificates.revokeCertificate));

export const reviewsRouter = Router();
reviewsRouter.patch('/:id/moderate', requirePermissions('reviews:write'), asyncHandler(reviews.moderateReview));
