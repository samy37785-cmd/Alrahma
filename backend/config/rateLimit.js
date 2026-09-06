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
    keyGenerator(req) {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
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

export const apiLimiter = limiter({
  max: 300,
  message: 'Too many requests — please try again later.',
  prefix: 'rl:api:',
});

export const authLimiter = limiter({
  max: 20,
  message: 'Too many attempts — please try again later.',
  prefix: 'rl:auth:',
});

export const enrollmentLimiter = limiter({
  max: 5,
  message: 'Too many enrollment requests — please try again later.',
  prefix: 'rl:enrollment:',
});
