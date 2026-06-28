import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Admin-specific rate limiters.
 * In production with Vercel serverless + Redis, swap MemoryStore for RedisStore
 * the same way the global rateLimit.js does via REDIS_URL.
 */
const make = ({ windowMs = 15 * 60 * 1000, max, message, skipSuccessful = false }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    skipSuccessfulRequests: skipSuccessful,
    message: { message },
    keyGenerator: (req) => ipKeyGenerator(req),
  });

// Login endpoint: 5 attempts per 15 min per IP
// (AdminUser model also enforces a per-account lock after 5 bad passwords)
export const loginLimiter = make({
  max:     5,
  message: 'Too many login attempts — please try again in 15 minutes.',
});

// TOTP verification: 10 per 15 min per IP
export const mfaLimiter = make({
  max:     10,
  message: 'Too many 2FA attempts — please try again later.',
});

// Token refresh: 20 per 15 min per IP
export const refreshLimiter = make({
  max:     20,
  message: 'Too many token refresh requests — please try again later.',
});

// General admin API calls: 200 per 15 min per IP
export const adminApiLimiter = make({
  max:     200,
  message: 'Admin API rate limit exceeded — please slow down.',
});
