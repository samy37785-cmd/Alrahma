import rateLimit from 'express-rate-limit';

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
let makeStore = () => undefined;

if (process.env.REDIS_URL) {
  try {
    const { default: Redis } = await import('ioredis');
    const { default: RedisStore } = await import('rate-limit-redis');

    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on('error', (e) => console.error('Redis (rate-limit) error:', e.message));

    // Each limiter needs its own key namespace so their counters don't collide.
    makeStore = (prefix) =>
      new RedisStore({ prefix, sendCommand: (...args) => client.call(...args) });

    console.log('Rate limiting: Redis store enabled (global across instances).');
  } catch (err) {
    console.error('Rate limiting: Redis unavailable, using in-memory store.', err.message);
    makeStore = () => undefined;
  }
}

function limiter({ max, message, prefix }) {
  const store = makeStore(prefix);
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
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
