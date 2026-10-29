import rateLimit from 'express-rate-limit';
import logger from './logger.js';

/*
 * Rate limiters with an OPTIONAL Redis-backed store.
 *
 * Why: on serverless (Vercel) each instance has its own memory, so the default
 * in-memory counters limit per-instance, not globally — an attacker hitting
 * different cold instances gets a fresh budget each time. Pointing REDIS_URL at
 * a shared Redis (e.g. Upstash) makes the limit global across all instances.
 *
 * Without REDIS_URL we transparently fall back to the in-memory store, which is
 * fine for low traffic. The owner can add Redis later with zero code changes —
 * just set REDIS_URL and `npm i ioredis rate-limit-redis` in the backend.
 */

// makeStore(prefix) returns a configured RedisStore, or undefined to let
// express-rate-limit use its built-in MemoryStore.
// Exported so adminRateLimits.js can share the same Redis connection and
// namespace its admin counters in the same global store.
export let makeStore = () => undefined;

if (process.env.REDIS_URL) {
  try {
    const { default: Redis } = await import('ioredis');
    const { default: RedisStore } = await import('rate-limit-redis');

    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on('error', (e) => logger.error('Redis rate-limit error', { message: e.message }));

    // Each limiter needs its own key namespace so their counters don't collide.
    makeStore = (prefix) =>
      new RedisStore({ prefix, sendCommand: (...args) => client.call(...args) });

    logger.info('Rate limiting: Redis store enabled (global across instances)');
  } catch (err) {
    logger.warn('Rate limiting: Redis unavailable, falling back to in-memory store', { error: err.message });
    makeStore = () => undefined;
  }
}

// Adapts express-rate-limit's Logger interface (error(err, message) /
// warn(err)) onto this app's centralized Winston logger, so a rate-limit
// store failure is logged the same structured way (message first, metadata
// second) as every other error in this app instead of raw console output.
// Exported so adminRateLimits.js's limiters log through the same adapter.
export const rateLimitLogger = {
  warn(err) {
    logger.warn('express-rate-limit warning', { message: err?.message ?? String(err) });
  },
  error(err, message) {
    logger.error(message ?? 'express-rate-limit error', { message: err?.message ?? String(err) });
  },
};

function limiter({ max, message, prefix }) {
  const store = makeStore(prefix);
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    // req.trustedClientIp is set only by a valid form-proxy signature
    // (middleware/publicProxySignature.js): the visitor's own IP, where
    // req.ip would be Vercel's shared outbound address.
    keyGenerator(req) {
      const ip = req.trustedClientIp || req.ip || req.socket?.remoteAddress || 'unknown';
      return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    },
    validate: { keyGeneratorIpFallback: false },
    // A store error (e.g. Redis unreachable) must never take down the whole
    // API — fail OPEN (let the request through unlimited for that one
    // request) rather than propagating the error to errorHandler as a 500.
    // Abuse protection degrading temporarily is a much smaller blast radius
    // than every /api/* request 500ing until Redis recovers.
    passOnStoreError: true,
    logger: rateLimitLogger,
    ...(store ? { store } : {}),
  });
}

// Requests per 15-minute window per key (see keyGenerator above).
//
// Through the site's own domain, every /api/* call arrives via Vercel's
// external rewrite, so req.ip is Vercel's outbound address, not the
// visitor's: all visitors in a region share ONE budget (checked 2026-10-28:
// the domain and a direct Render call count in different buckets). With
// trial and enrollment at 5, the 6th visitor in any 15 minutes was refused.
// The trial and booking forms now go through a signed hop that keys them per
// visitor, but only once FORM_PROXY_SIGNING_SECRET is set on both sides
// (docs/public-proxy-signing-runbook.md); login and everything else still
// share Vercel's address. So these budgets stay sized for all visitors
// together; a direct caller to Render gets the same budget for themselves.
export const RATE_LIMITS = Object.freeze({
  api: 300,
  auth: 100,
  enrollment: 30,
  trial: 30,
});

export const apiLimiter = limiter({
  max: RATE_LIMITS.api,
  message: 'Too many requests — please try again later.',
  prefix: 'rl:api:',
});

export const authLimiter = limiter({
  max: RATE_LIMITS.auth,
  message: 'Too many attempts — please try again later.',
  prefix: 'rl:auth:',
});

export const enrollmentLimiter = limiter({
  max: RATE_LIMITS.enrollment,
  message: 'Too many enrollment requests — please try again later.',
  prefix: 'rl:enrollment:',
});

// POST /api/trials sends email on every accepted request, so it gets its own
// small budget (same pattern as enrollmentLimiter). Keyed on req.ip, which
// app.js derives with `trust proxy = 1`: only the single hop added by the
// hosting proxy is trusted, so client-supplied X-Forwarded-For entries to
// its left never change the key.
//
// Limits of this protection (same as every limiter in this file):
// - Without REDIS_URL the counters live in each process's memory. With N
//   backend instances (e.g. Render scaled to >1, or overlapping instances
//   during a deploy) one client can get up to max × N accepted requests per
//   window, and every restart/deploy resets the counters.
// - With REDIS_URL (startup log "Rate limiting: Redis store enabled") the
//   budget is one global max per window across all instances.
// - passOnStoreError: if the store fails, requests pass unlimited (fail
//   open) rather than 500ing — see limiter() above.
// - It is per client IP: it slows a single source, it does not stop a
//   distributed one; validation (one bare address, fixed subject) is what
//   keeps each accepted request harmless.
export const trialLimiter = limiter({
  max: RATE_LIMITS.trial,
  message: 'Too many trial requests — please try again later.',
  prefix: 'rl:trial:',
});
