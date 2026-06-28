// Load environment variables FIRST — before any other import runs. ES module
// imports are hoisted, so route/controller/mailer modules below would otherwise
// read process.env before dotenv.config() ran (e.g. the mailer's SMTP check),
// producing false "not configured" warnings. The side-effect import guarantees
// .env is loaded before the rest of the graph evaluates.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

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
import certificateRoutes from './routes/certificateRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import parentRoutes from './routes/parentRoutes.js';
import liveClassRoutes from './routes/liveClassRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import cronRoutes from './routes/cronRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = [
  // Explicit list from CLIENT_URL env var (comma-separated)
  ...(process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((o) => o.trim()),
  // Vercel auto-injects VERCEL_URL (e.g. "alrahma-xi.vercel.app") — add https:// prefix
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
];

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||                                              // curl / mobile / server-to-server
        allowedOrigins.includes(origin) ||                    // explicitly whitelisted
        /^http:\/\/localhost:\d+$/.test(origin) ||            // any localhost port (local dev)
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

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser()); // parses the httpOnly auth cookie into req.cookies

// Rate limiters live in config/rateLimit.js — they use a shared Redis store
// when REDIS_URL is set (global across serverless instances), else in-memory.
// Health-check endpoints — BEFORE the DB middleware so a platform health check
// never blocks on a cold DB connection and the service stays marked as healthy.
app.get('/',       (_req, res) => res.json({ status: 'ok', service: 'Al-Rahma Academy API' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.use('/api', apiLimiter);

// Ensure DB is connected on every request (cached after first call).
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection failed:', err.message);
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
app.use('/api/certificates', certificateRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/classes', liveClassRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/cron', cronRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
