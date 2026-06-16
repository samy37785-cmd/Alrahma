import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import trialRoutes from './routes/trialRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import subscriberRoutes from './routes/subscriberRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

dotenv.config();

// 1) Connect to the database
connectDB();

const app = express();

// Behind a host/proxy (Render, etc.) so rate-limit reads the real client IP.
app.set('trust proxy', 1);

// 1.5) Security headers (helmet). crossOriginResourcePolicy relaxed so the
// frontend on another origin can still load any API-served resources.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// 2) CORS — allow the React frontend to call this API.
// Accept the configured CLIENT_URL(s) plus any localhost port during dev
// (Vite may switch ports, e.g. 5173 -> 5174 -> 5176, if one is busy).
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin(origin, callback) {
      // allow requests with no origin (curl, mobile apps) and any localhost
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin)
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// 3) Body parsers with size limits (block oversized payloads)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 3.5) Rate limiting — throttle abuse / scraping.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 300,                  // ~300 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests — please try again later.' },
});
// Tighter limit on auth (login/register) to slow brute-force attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts — please try again later.' },
});
app.use('/api', apiLimiter);

// 4) Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Al-Rahma Academy API is running 🚀' });
});

// 5) API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/trials', trialRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/newsletter', subscriberRoutes);
app.use('/api/enrollments', enrollmentRoutes);

// 6) Error handling (must be LAST)
app.use(notFound);
app.use(errorHandler);

// 7) Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
