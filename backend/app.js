// Load environment variables FIRST — before any other import runs. ES module
// imports are hoisted, so route/controller/mailer modules below would otherwise
// read process.env before dotenv.config() ran (e.g. the mailer's SMTP check),
// producing false "not configured" warnings. The side-effect import guarantees
// .env is loaded before the rest of the graph evaluates.
import 'dotenv/config';

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { validateEnv } from './config/validateEnv.js';

import connectDB from './config/db.js';
import { apiLimiter, authLimiter } from './config/rateLimit.js';
import authRoutes from './routes/authRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import trialRoutes from './routes/trialRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import subscriberRoutes from './routes/subscriberRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import hifzRoutes from './routes/hifzRoutes.js';
import progressRoutes from './routes/progressRoutes.js';
import quranBookmarkRoutes from './routes/quranBookmarkRoutes.js';
import quranProgressRoutes from './routes/quranProgressRoutes.js';
import quranMemoRoutes from './routes/quranMemoRoutes.js';
import certificateRoutes from './routes/certificateRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import parentRoutes from './routes/parentRoutes.js';
import liveClassRoutes from './routes/liveClassRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import cronRoutes from './routes/cronRoutes.js';
import adminRoutes from './routes/v1/admin/index.js';
import notificationRoutes from './routes/notificationRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import referralRoutes from './routes/referralRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { sanitizeMongo } from './middleware/sanitizeMongo.js';
import { requestLogger } from './middleware/requestLogger.js';
import { correlationId } from './middleware/correlationId.js';
import { issueCsrfToken, verifyCsrfToken } from './middleware/csrf.js';
import logger from './config/logger.js';
import { isSupabaseBackend } from './config/dataBackend.js';
import supabaseAuthRoutes from './data/supabase/routes/authRoutes.js';
import supabaseQuranBookmarkRoutes from './data/supabase/routes/quranBookmarkRoutes.js';
import supabaseQuranProgressRoutes from './data/supabase/routes/quranProgressRoutes.js';
import supabaseQuranMemoRoutes from './data/supabase/routes/quranMemoRoutes.js';
import supabaseNotificationRoutes from './data/supabase/routes/notificationRoutes.js';
import supabaseCouponRoutes from './data/supabase/routes/couponRoutes.js';
import supabaseTrialRoutes from './data/supabase/routes/trialRoutes.js';
import supabaseSubscriberRoutes from './data/supabase/routes/subscriberRoutes.js';
import supabaseBlogRoutes from './data/supabase/routes/blogRoutes.js';
import supabaseEnrollmentRoutes from './data/supabase/routes/enrollmentRoutes.js';
import supabasePaymentRoutes from './data/supabase/routes/paymentRoutes.js';
import supabaseInvoiceRoutes from './data/supabase/routes/invoiceRoutes.js';
import supabaseCourseRoutes from './data/supabase/routes/courseRoutes.js';
import supabaseProgressRoutes from './data/supabase/routes/progressRoutes.js';
import supabaseHifzRoutes from './data/supabase/routes/hifzRoutes.js';
import supabaseCertificateRoutes from './data/supabase/routes/certificateRoutes.js';
import supabaseLiveClassRoutes from './data/supabase/routes/liveClassRoutes.js';
import supabaseMessageRoutes from './data/supabase/routes/messageRoutes.js';
import supabaseContactRoutes from './data/supabase/routes/contactRoutes.js';
import supabaseWishlistRoutes from './data/supabase/routes/wishlistRoutes.js';
import supabaseReviewRoutes from './data/supabase/routes/reviewRoutes.js';
import supabaseReferralRoutes from './data/supabase/routes/referralRoutes.js';
import supabaseTeacherRoutes from './data/supabase/routes/teacherRoutes.js';
import supabaseParentRoutes from './data/supabase/routes/parentRoutes.js';
import supabaseSearchRoutes from './data/supabase/routes/searchRoutes.js';
import supabaseCronRoutes from './data/supabase/routes/cronRoutes.js';
import { getPool as getSupabasePool } from './data/supabase/client.js';

// Validate required environment variables immediately — fails fast with a
// clear error rather than surfacing a cryptic runtime failure later.
validateEnv();

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = [
  // Explicit list from CLIENT_URL env var (comma-separated) — production
  // points this at https://al-rahmaacademy.com.
  ...(process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((o) => o.trim()),
  // VERCEL_URL is set during Vercel preview builds — allow those origins too
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
];

// Vercel preview deployments (credentialed CORS): a bare
// /^https:\/\/alrahma-[a-z0-9-]+\.vercel\.app$/ check would also match an
// attacker-registered project on someone else's Vercel account — *.vercel.app
// subdomains are first-come-first-served across ALL accounts. The only part
// of a preview URL an outsider cannot claim is the account-scope suffix
// (e.g. "alrahma-git-main-<scope>" / "alrahma-<hash>-<scope>"), so previews
// are pinned to that scope via VERCEL_PREVIEW_SCOPE. Unset = no preview
// origins allowed (fail closed; production traffic uses CLIENT_URL and is
// unaffected either way).
const previewScope = (process.env.VERCEL_PREVIEW_SCOPE || '').trim();
const vercelPreviewOrigin = previewScope
  ? new RegExp(`^https://[a-z0-9-]+-${previewScope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.vercel\\.app$`)
  : null;

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||                                              // curl / mobile / server-to-server
        allowedOrigins.includes(origin) ||                    // explicitly whitelisted
        (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) || // any localhost port (local dev only)
        (vercelPreviewOrigin && vercelPreviewOrigin.test(origin)) // Vercel previews, scope-pinned
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// Stripe webhook must receive the raw body for signature verification.
// Register this route BEFORE the JSON body-parser middleware.
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(correlationId);   // assign x-request-id to every request (tracing)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser()); // parses the httpOnly auth cookie into req.cookies
app.use(sanitizeMongo);   // strip $-operators / dotted keys from input (NoSQL-injection guard)
app.use(issueCsrfToken);  // attach readable CSRF cookie so the SPA can echo it back
app.use(verifyCsrfToken); // reject mutating requests without a valid X-CSRF-Token header
app.use(requestLogger);

// Rate limiters live in config/rateLimit.js — they use a shared Redis store
// when REDIS_URL is set (global across serverless instances), else in-memory.
// ── Health / readiness probes ─────────────────────────────────────────────────
// /health  — liveness probe: is the process alive?  No DB check; always fast.
//            Load balancers and Render use this to mark the instance as up.
// /ready   — readiness probe: is the service ready to handle requests?
//            Checks the DB connection so a container orchestrator can hold
//            traffic until the DB is reachable.
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'Al-Rahma Academy API' }));
const healthCheckHandler = (_req, res) => {
  res.json({
    status:  'ok',
    uptime:  Math.floor(process.uptime()),
    memory:  process.memoryUsage().heapUsed,
    version: process.env.npm_package_version || '1.0.0',
    env:     process.env.NODE_ENV || 'development',
    ts:      new Date().toISOString(),
  });
};
app.get('/health', healthCheckHandler);
// /api/healthz — same DB-free liveness check as /health, mounted under /api
// so it's reachable through the official domain: vercel.json only rewrites
// /api/:path* to this service, so a bare /health never reaches it through
// al-rahmaacademy.com (only by hitting Render directly). Kept independent
// of the apiLimiter/DB-connection middleware below (mounted before both,
// same reasoning as /api/csrf) so it stays a true liveness probe — up even
// if the database is unreachable.
app.get('/api/healthz', healthCheckHandler);
app.get('/ready', async (_req, res) => {
  try {
    // Real gap found by a full route-mount audit (same pass that found
    // /api/search and /api/cron): this probe unconditionally called Mongo's
    // connectDB()/readyState with no isSupabaseBackend() branch at all —
    // under supabase mode it would report "not ready" forever (mongoose
    // never connects there at all), which is exactly the kind of thing a
    // container orchestrator's readiness gate would act on and never route
    // traffic to this instance.
    if (isSupabaseBackend()) {
      await getSupabasePool().query('SELECT 1');
      return res.json({ status: 'ready' });
    }

    await connectDB();
    // connectDB() resolves from a cached connection object once the process
    // has ever connected successfully (see config/db.js) — it does not by
    // itself re-verify the connection is still live. Checking readyState
    // here is what makes this probe able to report "not ready" if MongoDB
    // drops the connection later at runtime, not just before the first
    // successful connect.
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ status: 'not ready', reason: 'database' });
    }
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready', reason: 'database' });
  }
});

app.use('/api', apiLimiter);

// A fresh visitor whose very first request to the API is a mutation (e.g.
// landing directly on /login with no prior page having made any backend
// call) has no csrf_token cookie yet — issueCsrfToken only sets it on a
// response, and verifyCsrfToken rejects that same first request before one
// ever arrives. The frontend's http/adminHttp interceptors call this cheap,
// DB-free GET once (see ensureCsrfToken in artifacts/al-rahma-academy's
// src/api/csrf.js) to warm the cookie before sending a mutating request.
// Placed before the DB-connection-check middleware so it works even during
// a DB hiccup.
app.get('/api/csrf', (_req, res) => res.json({ ok: true }));

// Ensure DB is connected on every request (cached after first call). Under
// DATA_BACKEND=supabase there is no MongoDB connection to wait on — every
// matched-domain route already opens its own Postgres connection via
// data/supabase/client.js, and unmatched domains simply aren't mounted
// differently by backend (they still use their Mongo controllers either
// way, per docs/option-a-mongo-supabase-parity-map.md, so those still need
// this check). Skipping this gate specifically for supabase mode avoids
// every /api/* request 503'ing on a MongoDB connection this mode doesn't use.
app.use(async (req, res, next) => {
  if (isSupabaseBackend()) return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    logger.error('DB connection failed', { message: err.message });
    res.status(503).json({ message: 'Database unavailable — please try again.' });
  }
});

// DATA_BACKEND selects which controller implementation handles each matched
// domain's routes — the routes/paths/response shapes are identical either
// way (see docs/option-a-mongo-supabase-parity-map.md). Defaults to the
// unchanged MongoDB path; this is the only backend actually deployed.
app.use('/api/auth', authLimiter, isSupabaseBackend() ? supabaseAuthRoutes : authRoutes);
app.use('/api/courses', isSupabaseBackend() ? supabaseCourseRoutes : courseRoutes);
app.use('/api/trials', isSupabaseBackend() ? supabaseTrialRoutes : trialRoutes);
app.use('/api/payments', isSupabaseBackend() ? supabasePaymentRoutes : paymentRoutes);
app.use('/api/invoices', isSupabaseBackend() ? supabaseInvoiceRoutes : invoiceRoutes);
app.use('/api/newsletter', isSupabaseBackend() ? supabaseSubscriberRoutes : subscriberRoutes);
app.use('/api/enrollments', isSupabaseBackend() ? supabaseEnrollmentRoutes : enrollmentRoutes);
app.use('/api/hifz', isSupabaseBackend() ? supabaseHifzRoutes : hifzRoutes);
app.use('/api/progress', isSupabaseBackend() ? supabaseProgressRoutes : progressRoutes);
app.use('/api/quran-bookmarks', isSupabaseBackend() ? supabaseQuranBookmarkRoutes : quranBookmarkRoutes);
app.use('/api/quran-progress',  isSupabaseBackend() ? supabaseQuranProgressRoutes : quranProgressRoutes);
app.use('/api/quran-memo',      isSupabaseBackend() ? supabaseQuranMemoRoutes : quranMemoRoutes);
app.use('/api/certificates', isSupabaseBackend() ? supabaseCertificateRoutes : certificateRoutes);
app.use('/api/teacher', isSupabaseBackend() ? supabaseTeacherRoutes : teacherRoutes);
app.use('/api/parent', isSupabaseBackend() ? supabaseParentRoutes : parentRoutes);
app.use('/api/classes', isSupabaseBackend() ? supabaseLiveClassRoutes : liveClassRoutes);
app.use('/api/messages', isSupabaseBackend() ? supabaseMessageRoutes : messageRoutes);
app.use('/api/cron', isSupabaseBackend() ? supabaseCronRoutes : cronRoutes);
app.use('/api/notifications', isSupabaseBackend() ? supabaseNotificationRoutes : notificationRoutes);
app.use('/api/contact',       isSupabaseBackend() ? supabaseContactRoutes : contactRoutes);
app.use('/api/coupons',       isSupabaseBackend() ? supabaseCouponRoutes : couponRoutes);
app.use('/api/wishlist',      isSupabaseBackend() ? supabaseWishlistRoutes : wishlistRoutes);
app.use('/api/reviews',       isSupabaseBackend() ? supabaseReviewRoutes : reviewRoutes);
app.use('/api/blog',          isSupabaseBackend() ? supabaseBlogRoutes : blogRoutes);
app.use('/api/search',        isSupabaseBackend() ? supabaseSearchRoutes : searchRoutes);
app.use('/api/referrals',     isSupabaseBackend() ? supabaseReferralRoutes : referralRoutes);

// Admin dashboard — zero-trust, MFA-required, RBAC-enforced
// All security middleware (IP whitelist, Helmet CSP, rate limit, sanitization,
// verifyAccessToken, maintenanceGuard) is applied inside the router itself.
app.use('/api/v1/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
