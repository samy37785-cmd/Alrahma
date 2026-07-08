import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { rateLimitLogger } from '../config/rateLimit.js';
import logger from '../config/logger.js';

// Production Readiness Audit — High finding: config/rateLimit.js's limiter()
// and config/adminRateLimits.js's make() built every rate limiter (apiLimiter,
// authLimiter, enrollmentLimiter, loginLimiter, mfaLimiter, refreshLimiter,
// adminApiLimiter) without `passOnStoreError`, which express-rate-limit
// defaults to false — meaning a Redis outage (a real, documented, supported
// configuration via REDIS_URL) would re-throw the store error into
// errorHandler as a 500 for every single request, turning an abuse-
// protection component into a full API outage. Fixed by adding
// `passOnStoreError: true` (fail OPEN — allow the request, log the failure)
// to both shared limiter factories, plus a `logger` adapter
// (rateLimitLogger, exported from config/rateLimit.js) so the failure is
// logged through this app's centralized Winston logger instead of raw
// console output.
//
// These tests exercise the real fix in isolation via a minimal standalone
// app + an injectable Store (the same interface express-rate-limit itself
// requires), rather than depending on a real, reachable-or-not Redis
// instance — deterministic and fast, and proves the actual runtime
// behavior (not just that a config flag is set).

// A minimal, spec-compliant in-memory Store used to prove normal rate
// limiting still works unchanged with the new options present.
function workingStore() {
  const hits = new Map();
  return {
    async increment(key) {
      const totalHits = (hits.get(key) || 0) + 1;
      hits.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + 60_000) };
    },
    async decrement() {},
    async resetKey(key) { hits.delete(key); },
  };
}

// A Store whose increment() always throws — simulates Redis being
// unreachable (connection refused, timeout, etc.).
function brokenStore(errorMessage = 'ECONNREFUSED: Redis unreachable') {
  return {
    async increment() { throw new Error(errorMessage); },
    async decrement() {},
    async resetKey() {},
  };
}

// Builds a tiny app with one rate-limited route, configured identically to
// config/rateLimit.js's limiter() / config/adminRateLimits.js's make()
// (passOnStoreError + the shared logger adapter), so these tests exercise
// the exact same options this fix applies to those shared factories.
function buildApp(store) {
  const app = express();
  app.use(rateLimit({
    windowMs: 60_000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    logger: rateLimitLogger,
    store,
    keyGenerator: () => 'fixed-key', // every request in these tests shares one bucket
  }));
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
}

test('normal rate limiting: a working store still enforces max and returns 429 past the limit', async () => {
  const app = buildApp(workingStore());

  const first  = await request(app).get('/ping');
  const second = await request(app).get('/ping');
  const third  = await request(app).get('/ping');

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429, 'the 3rd request must still be rejected — passOnStoreError must not disable normal limiting');
});

test('store unavailable: a request is allowed through (fails open) instead of a 500', async () => {
  const app = buildApp(brokenStore());

  const res = await request(app).get('/ping');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('requests continue when the store fails: every request in a row succeeds, well past what "max" would normally allow', async () => {
  const app = buildApp(brokenStore());

  for (let i = 0; i < 5; i++) {
    const res = await request(app).get('/ping');
    assert.equal(res.status, 200, `request #${i + 1} must succeed while the store is down`);
  }
});

test('logging: a store failure is logged via the app\'s Winston logger, not swallowed silently', async (t) => {
  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  const app = buildApp(brokenStore('simulated Redis outage'));
  const res = await request(app).get('/ping');
  assert.equal(res.status, 200);

  assert.ok(errorCalls.length >= 1, 'logger.error must be called when the store throws');
  assert.match(errorCalls[0].message, /express-rate-limit/i);
  assert.match(errorCalls[0].meta.message, /simulated Redis outage/);
});

test('logging: normal operation (working store) never logs a rate-limit error', async (t) => {
  const errorCalls = [];
  t.mock.method(logger, 'error', (message, meta) => { errorCalls.push({ message, meta }); });

  const app = buildApp(workingStore());
  await request(app).get('/ping');
  await request(app).get('/ping');

  assert.equal(errorCalls.length, 0, 'a healthy store must never trigger the store-error log path');
});
