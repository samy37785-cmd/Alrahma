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
import aiTutorRoutes from './routes/aiTutorRoutes.js';
import communityRoutes from './routes/communityRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { sanitizeMongo } from './middleware/sanitizeMongo.js';
import { requestLogger } from './middleware/requestLogger.js';
import { correlationId } from './middleware/correlationId.js';
import { issueCsrfToken, verifyCsrfToken } from './middleware/csrf.js';
import logger from './config/logger.js';

// Validate required environment variables immediately — fails fast with a
// clear error rather than surfacing a cryptic runtime failure later.
validateEnv();

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = [
  // Explicit list from CLIENT_URL env var (comma-separated)
  ...(process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((o) => o.trim()),
  // VERCEL_URL is set during Vercel preview builds — allow those origins too
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
];

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||                                              // curl / mobile / server-to-server
        allowedOrigins.includes(origin) ||                    // explicitly whitelisted
        (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) || // any localhost port (local dev only)
        /^https:\/\/alrahma-[a-z0-9-]+\.vercel\.app$/.test(origin) // Vercel preview branches
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
app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    uptime:  Math.floor(process.uptime()),
    memory:  process.memoryUsage().heapUsed,
    version: process.env.npm_package_version || '1.0.0',
    env:     process.env.NODE_ENV || 'development',
    ts:      new Date().toISOString(),
  });
});
app.get('/ready', async (_req, res) => {
  try {
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
// DB-free GET once (see ensureCsrfToken in api/csrf.js) to warm the cookie
// before sending a mutating request. Placed before the DB-connection-check
// middleware so it works even during a DB hiccup.
app.get('/api/csrf', (_req, res) => res.json({ ok: true }));

// Ensure DB is connected on every request (cached after first call).
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    logger.error('DB connection failed', { message: err.message });
    res.status(503).json({ message: 'Database unavailable — please try again.' });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/trials', trialRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/newsletter', subscriberRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/hifz', hifzRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/quran-bookmarks', quranBookmarkRoutes);
app.use('/api/quran-progress',  quranProgressRoutes);
app.use('/api/quran-memo',      quranMemoRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/classes', liveClassRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/contact',       contactRoutes);
app.use('/api/coupons',       couponRoutes);
app.use('/api/wishlist',      wishlistRoutes);
app.use('/api/reviews',       reviewRoutes);
app.use('/api/blog',          blogRoutes);
app.use('/api/ai-tutor',      aiTutorRoutes);
app.use('/api/community',     communityRoutes);
app.use('/api/search',        searchRoutes);
app.use('/api/referrals',     referralRoutes);

// Admin dashboard — zero-trust, MFA-required, RBAC-enforced
// All security middleware (IP whitelist, Helmet CSP, rate limit, sanitization,
// verifyAccessToken, maintenanceGuard) is applied inside the router itself.
app.use('/api/v1/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
