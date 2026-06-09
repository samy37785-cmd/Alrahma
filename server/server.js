import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import trialRoutes from './routes/trialRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

dotenv.config();

// 1) Connect to the database
connectDB();

const app = express();

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

// 3) Body parsers (read JSON / form data from requests)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4) Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Al-Rahma Academy API is running 🚀' });
});

// 5) API routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/trials', trialRoutes);
app.use('/api/payments', paymentRoutes);

// 6) Error handling (must be LAST)
app.use(notFound);
app.use(errorHandler);

// 7) Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
