import { Router } from 'express';
import helmet from 'helmet';

import { adminApiLimiter }   from '../../../config/adminRateLimits.js';
import { ipWhitelist }       from '../../../middleware/ipWhitelist.js';
import { sanitizeMongo }     from '../../../middleware/sanitizeMongo.js';
import { verifyAccessToken } from '../../../middleware/adminAuth.js';
import { maintenanceGuard }  from '../../../middleware/maintenanceGuard.js';
import { isSupabaseBackend } from '../../../config/dataBackend.js';
import { backendNotImplemented } from '../../../middleware/backendNotImplemented.js';

import authRoutes         from './authRoutes.js';
import supabaseAuthRoutes from '../../../data/supabase/routes/adminAuthRoutes.js';
import usersRoutes        from './usersRoutes.js';
import coursesRoutes      from './coursesRoutes.js';
import enrollmentsRoutes  from './enrollmentsRoutes.js';
import blogRoutes         from './blogRoutes.js';
import contactRoutes      from './contactRoutes.js';
import certificatesRoutes from './certificatesRoutes.js';
import referralsRoutes    from './referralsRoutes.js';
import reviewsRoutes      from './reviewsRoutes.js';
import systemRoutes       from './systemRoutes.js';
import trialsRoutes       from './trialsRoutes.js';
import subscribersRoutes  from './subscribersRoutes.js';
import liveClassesRoutes  from './liveClassesRoutes.js';
import paymentsRoutes     from './paymentsRoutes.js';
import couponsRoutes      from './couponsRoutes.js';
import invoicesRoutes     from './invoicesRoutes.js';
import {
  coursesRouter as supabaseCoursesRoutes,
  liveClassesRouter as supabaseLiveClassesRoutes,
  certificatesRouter as supabaseCertificatesRoutes,
  reviewsRouter as supabaseReviewsRoutes,
} from '../../../data/supabase/admin/adminRoutes.js';
import supabaseUsersAdminRoutes from '../../../data/supabase/admin/usersAdminRoutes.js';
import supabaseEnrollmentsAdminRoutes from '../../../data/supabase/admin/enrollmentsAdminRoutes.js';
import supabaseBlogAdminRoutes from '../../../data/supabase/admin/blogAdminRoutes.js';
import supabaseContactAdminRoutes from '../../../data/supabase/admin/contactAdminRoutes.js';
import supabaseReferralsAdminRoutes from '../../../data/supabase/admin/referralsAdminRoutes.js';
import supabaseSystemAdminRoutes from '../../../data/supabase/admin/systemAdminRoutes.js';
import supabasePaymentsAdminRoutes from '../../../data/supabase/admin/paymentsAdminRoutes.js';
import supabaseCouponsAdminRoutes from '../../../data/supabase/admin/couponsAdminRoutes.js';
import supabaseInvoicesAdminRoutes from '../../../data/supabase/admin/invoicesAdminRoutes.js';

const router = Router();

// ── Security hardening applied to ALL /api/v1/admin/* requests ───────────────

// IP whitelist (no-op unless ADMIN_IP_WHITELIST env var is set)
router.use(ipWhitelist);

// Strict Helmet CSP for the admin sub-path
router.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'"],
        imgSrc:     ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // Prevent MIME sniffing
    noSniff: true,
    // Deny framing entirely
    frameguard: { action: 'deny' },
    // Enforce HTTPS (Strict-Transport-Security)
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    // Hide the X-Powered-By header
    hidePoweredBy: true,
  })
);

// Global rate limit for the admin API
router.use(adminApiLimiter);

// NoSQL injection sanitization
router.use(sanitizeMongo);

// ── Auth routes (public within admin — no verifyAccessToken) ─────────────────
// DATA_BACKEND=supabase swaps in the GoTrue-backed admin auth controller
// (see data/supabase/adminAuthController.js) — same cookie contract, same
// route shapes, different mechanism underneath.
router.use('/auth', isSupabaseBackend() ? supabaseAuthRoutes : authRoutes);

// ── Protected routes — require valid access token + MFA ──────────────────────
router.use(verifyAccessToken);

// Maintenance guard: blocks non-super-admins when maintenance mode is on
router.use(maintenanceGuard);

// Al-Rahma Final Corrections (Part A): every admin subrouter below through
// /invoices has a real DATA_BACKEND=supabase implementation (see
// data/supabase/admin/) — branched exactly like the customer-facing app.js
// router branches each domain. /trials and /subscribers, mounted further
// down, are the two documented exceptions — Mongo-only for now, with an
// explicit 501 under supabase mode (see their own comment below) rather
// than a silent implementation gap. Review follow-up: this comment
// previously claimed "zero admin subrouters are Mongo-only under supabase
// mode," which directly contradicted those two lines below it.
router.use('/users',        isSupabaseBackend() ? supabaseUsersAdminRoutes : usersRoutes);
router.use('/courses',      isSupabaseBackend() ? supabaseCoursesRoutes : coursesRoutes);
// Auth hardening security batch: Mongo mode now has a real implementation
// (routes/v1/admin/liveClassesRoutes.js) — closes the gap where
// AdminClassesTab.jsx fell back to the legacy staffOnly /api/classes
// mutation routes because this 404'd for every non-Supabase deployment.
router.use('/live-classes', isSupabaseBackend() ? supabaseLiveClassesRoutes : liveClassesRoutes);
router.use('/enrollments',  isSupabaseBackend() ? supabaseEnrollmentsAdminRoutes : enrollmentsRoutes);
// Scope correction (see docs/current-project-status.md): admin payments/
// manual-payment review, coupons (plan-price discount codes) and invoices
// (archival billing records) are not an online card-gateway feature — all
// three are restored live, on both backends, same isSupabaseBackend()
// branch shape as every other subrouter here.
router.use('/payments',     isSupabaseBackend() ? supabasePaymentsAdminRoutes : paymentsRoutes);
router.use('/blog',         isSupabaseBackend() ? supabaseBlogAdminRoutes : blogRoutes);
router.use('/coupons',      isSupabaseBackend() ? supabaseCouponsAdminRoutes : couponsRoutes);
router.use('/contact',      isSupabaseBackend() ? supabaseContactAdminRoutes : contactRoutes);
router.use('/certificates', isSupabaseBackend() ? supabaseCertificatesRoutes : certificatesRoutes);
router.use('/referrals',    isSupabaseBackend() ? supabaseReferralsAdminRoutes : referralsRoutes);
router.use('/reviews',      isSupabaseBackend() ? supabaseReviewsRoutes : reviewsRoutes);
router.use('/system',       isSupabaseBackend() ? supabaseSystemAdminRoutes : systemRoutes);
router.use('/invoices',     isSupabaseBackend() ? supabaseInvoicesAdminRoutes : invoicesRoutes);
// Auth hardening security batch: real replacements for the legacy
// protect+adminOnly GET /api/trials and GET /api/newsletter. No Supabase
// (Postgres) adapter exists yet for either domain — mounting the Mongoose-
// backed routers unconditionally would silently hang under
// DATA_BACKEND=supabase (see backendNotImplemented.js), so that mode gets an
// explicit 501 instead until a real adapter is built, same branching shape
// as every other subrouter here.
router.use('/trials',       isSupabaseBackend() ? backendNotImplemented('Admin trials listing') : trialsRoutes);
router.use('/subscribers',  isSupabaseBackend() ? backendNotImplemented('Admin subscribers listing') : subscribersRoutes);

export default router;
