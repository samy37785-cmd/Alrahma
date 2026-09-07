import { Router } from 'express';
import helmet from 'helmet';

import { adminApiLimiter }   from '../../../config/adminRateLimits.js';
import { ipWhitelist }       from '../../../middleware/ipWhitelist.js';
import { sanitizeMongo }     from '../../../middleware/sanitizeMongo.js';
import { verifyAccessToken } from '../../../middleware/adminAuth.js';
import { maintenanceGuard }  from '../../../middleware/maintenanceGuard.js';
import { isSupabaseBackend } from '../../../config/dataBackend.js';

import authRoutes         from './authRoutes.js';
import supabaseAuthRoutes from '../../../data/supabase/routes/adminAuthRoutes.js';
import usersRoutes        from './usersRoutes.js';
import coursesRoutes      from './coursesRoutes.js';
import enrollmentsRoutes  from './enrollmentsRoutes.js';
import paymentsRoutes     from './paymentsRoutes.js';
import blogRoutes         from './blogRoutes.js';
import couponsRoutes      from './couponsRoutes.js';
import contactRoutes      from './contactRoutes.js';
import certificatesRoutes from './certificatesRoutes.js';
import referralsRoutes    from './referralsRoutes.js';
import reviewsRoutes      from './reviewsRoutes.js';
import systemRoutes       from './systemRoutes.js';
import invoicesRoutes     from './invoicesRoutes.js';
import {
  coursesRouter as supabaseCoursesRoutes,
  liveClassesRouter as supabaseLiveClassesRoutes,
  certificatesRouter as supabaseCertificatesRoutes,
  reviewsRouter as supabaseReviewsRoutes,
} from '../../../data/supabase/admin/adminRoutes.js';
import supabasePaymentsAdminRoutes from '../../../data/supabase/admin/paymentsAdminRoutes.js';
import supabaseUsersAdminRoutes from '../../../data/supabase/admin/usersAdminRoutes.js';
import supabaseEnrollmentsAdminRoutes from '../../../data/supabase/admin/enrollmentsAdminRoutes.js';
import supabaseBlogAdminRoutes from '../../../data/supabase/admin/blogAdminRoutes.js';
import supabaseCouponsAdminRoutes from '../../../data/supabase/admin/couponsAdminRoutes.js';
import supabaseContactAdminRoutes from '../../../data/supabase/admin/contactAdminRoutes.js';
import supabaseReferralsAdminRoutes from '../../../data/supabase/admin/referralsAdminRoutes.js';
import supabaseSystemAdminRoutes from '../../../data/supabase/admin/systemAdminRoutes.js';
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

// Al-Rahma Final Corrections (Part A): every admin subrouter now has a real
// DATA_BACKEND=supabase implementation (see data/supabase/admin/) — branched
// exactly like the customer-facing app.js router branches each domain. Zero
// admin subrouters are Mongo-only under supabase mode as of this closure.
router.use('/users',        isSupabaseBackend() ? supabaseUsersAdminRoutes : usersRoutes);
router.use('/courses',      isSupabaseBackend() ? supabaseCoursesRoutes : coursesRoutes);
router.use('/live-classes', isSupabaseBackend() ? supabaseLiveClassesRoutes : (_req, res) => res.status(404).json({ message: 'Not found' }));
router.use('/enrollments',  isSupabaseBackend() ? supabaseEnrollmentsAdminRoutes : enrollmentsRoutes);
router.use('/payments',     isSupabaseBackend() ? supabasePaymentsAdminRoutes : paymentsRoutes);
router.use('/blog',         isSupabaseBackend() ? supabaseBlogAdminRoutes : blogRoutes);
router.use('/coupons',      isSupabaseBackend() ? supabaseCouponsAdminRoutes : couponsRoutes);
router.use('/contact',      isSupabaseBackend() ? supabaseContactAdminRoutes : contactRoutes);
router.use('/certificates', isSupabaseBackend() ? supabaseCertificatesRoutes : certificatesRoutes);
router.use('/referrals',    isSupabaseBackend() ? supabaseReferralsAdminRoutes : referralsRoutes);
router.use('/reviews',      isSupabaseBackend() ? supabaseReviewsRoutes : reviewsRoutes);
router.use('/system',       isSupabaseBackend() ? supabaseSystemAdminRoutes : systemRoutes);
// Real fix for the admin-invoices architecture gap (Al-Rahma Final
// Corrections): the canonical admin invoice list now lives here, behind the
// real AAL2-capable admin router, instead of only under the customer-session
// GET /api/invoices/admin (routes/invoiceRoutes.js / data/supabase/routes/
// invoiceRoutes.js — kept mounted for compatibility, but see
// data/supabase/invoiceController.js's getAdminInvoices for what it now
// does under supabase mode instead of silently failing).
router.use('/invoices',     isSupabaseBackend() ? supabaseInvoicesAdminRoutes : invoicesRoutes);

export default router;
