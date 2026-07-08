import { Router } from 'express';
import helmet from 'helmet';

import { adminApiLimiter }   from '../../../config/adminRateLimits.js';
import { ipWhitelist }       from '../../../middleware/ipWhitelist.js';
import { sanitizeMongo }     from '../../../middleware/sanitizeMongo.js';
import { verifyAccessToken } from '../../../middleware/adminAuth.js';
import { maintenanceGuard }  from '../../../middleware/maintenanceGuard.js';

import authRoutes        from './authRoutes.js';
import usersRoutes       from './usersRoutes.js';
import coursesRoutes     from './coursesRoutes.js';
import enrollmentsRoutes from './enrollmentsRoutes.js';
import paymentsRoutes    from './paymentsRoutes.js';
import systemRoutes      from './systemRoutes.js';

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
router.use('/auth', authRoutes);

// ── Protected routes — require valid access token + MFA ──────────────────────
router.use(verifyAccessToken);

// Maintenance guard: blocks non-super-admins when maintenance mode is on
router.use(maintenanceGuard);

router.use('/users',       usersRoutes);
router.use('/courses',     coursesRoutes);
router.use('/enrollments', enrollmentsRoutes);
router.use('/payments',    paymentsRoutes);
router.use('/system',      systemRoutes);

export default router;
