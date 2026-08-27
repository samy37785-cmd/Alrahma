import rateLimit from 'express-rate-limit';
import { makeStore, rateLimitLogger } from './rateLimit.js';

/**
 * Admin-specific rate limiters.
 *
 * Uses the same optional Redis store as the global limiters so that
 * on Vercel serverless (multiple instances) the counters are shared
 * globally — an attacker cannot reset their budget by hitting a cold instance.
 * Falls back to in-memory when REDIS_URL is not set.
 */
const make = ({ windowMs = 15 * 60 * 1000, max, message, skipSuccessful = false, prefix }) => {
  const store = prefix ? makeStore(prefix) : undefined;
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    skipSuccessfulRequests: skipSuccessful,
    message: { message },
    keyGenerator(req) {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    },
    validate: { keyGeneratorIpFallback: false },
    // Same fail-open rationale as config/rateLimit.js's limiter(): a Redis
    // outage must degrade to "rate limiting temporarily off" for the admin
    // API, never "every /api/v1/admin/* request 500s".
    passOnStoreError: true,
    logger: rateLimitLogger,
    ...(store ? { store } : {}),
  });
};

// Login endpoint: 5 attempts per 15 min per IP
// (AdminUser model also enforces a per-account lock after 5 bad passwords)
export const loginLimiter = make({
  max:     5,
  message: 'Too many login attempts — please try again in 15 minutes.',
  prefix:  'rl:admin:login:',
});

// TOTP verification: 10 per 15 min per IP
export const mfaLimiter = make({
  max:     10,
  message: 'Too many 2FA attempts — please try again later.',
  prefix:  'rl:admin:mfa:',
});

// Token refresh: 20 per 15 min per IP
export const refreshLimiter = make({
  max:     20,
  message: 'Too many token refresh requests — please try again later.',
  prefix:  'rl:admin:refresh:',
});

// General admin API calls: 200 per 15 min per IP
export const adminApiLimiter = make({
  max:     200,
  message: 'Admin API rate limit exceeded — please slow down.',
  prefix:  'rl:admin:api:',
});