import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDb, teardownTestDb } from './helpers/db.js';

// Proves config/trustProxy.js actually closes the X-Forwarded-For spoofing
// hazard the hardcoded `app.set('trust proxy', 1)` used to create: ipWhitelist
// (middleware/ipWhitelist.js) and every rate limiter (config/rateLimit.js,
// config/adminRateLimits.js) all key off req.ip, whose value is entirely
// governed by this setting. A wrong-but-permissive trust-proxy value lets an
// attacker who talks to the app directly inject a fake X-Forwarded-For and
// have Express believe it's the real client IP.
//
// Part 1 (below): unit-level, against a minimal app applying the exact same
// `app.set('trust proxy', getTrustProxySetting())` line app.js uses — fast,
// isolates the mechanism itself precisely.
//
// Part 2 (further down): integration-level, against the REAL app.js (import
// is dynamic + cache-busted per scenario, since `getTrustProxySetting()` is
// read once at module-evaluation time, exactly like isSupabaseBackend() in
// payment-checkout-supabase-backend.test.js) hitting the real ipWhitelist
// middleware under /api/v1/admin/*, proving the end-to-end chain and not
// just the isolated mechanism.
//
// Rate-limiter parity is NOT re-tested via a real 300-request flood here:
// apiLimiter's keyGenerator (config/rateLimit.js) reads req.ip via the exact
// same mechanism proven spoof-resistant in Part 1 — sending hundreds of real
// requests to prove the identical underlying fact again would be slow and
// redundant, not more rigorous.

function buildEchoApp(trustProxySetting) {
  const app = express();
  app.set('trust proxy', trustProxySetting);
  app.get('/whoami', (req, res) => res.json({ ip: req.ip }));
  return app;
}

test('trustProxy: TRUST_PROXY unset -> req.ip ignores a spoofed X-Forwarded-For', async () => {
  delete process.env.TRUST_PROXY;
  const { getTrustProxySetting } = await import(`../config/trustProxy.js?t=${Date.now()}-${Math.random()}`);
  const app = buildEchoApp(getTrustProxySetting());
  const res = await request(app).get('/whoami').set('X-Forwarded-For', '203.0.113.7');
  assert.notEqual(res.body.ip, '203.0.113.7');
});

test('trustProxy: TRUST_PROXY set to a non-matching CIDR -> spoofed X-Forwarded-For still ignored', async () => {
  process.env.TRUST_PROXY = '203.0.113.0/24'; // does not match supertest's loopback peer
  const { getTrustProxySetting } = await import(`../config/trustProxy.js?t=${Date.now()}-${Math.random()}`);
  const app = buildEchoApp(getTrustProxySetting());
  const res = await request(app).get('/whoami').set('X-Forwarded-For', '198.51.100.9');
  assert.notEqual(res.body.ip, '198.51.100.9');
  delete process.env.TRUST_PROXY;
});

test('trustProxy: TRUST_PROXY set to a CIDR matching the real peer -> X-Forwarded-For IS honored (mechanism works when configured, not just fails safe)', async () => {
  process.env.TRUST_PROXY = '127.0.0.1/32,::1/128,::ffff:127.0.0.1/128';
  const { getTrustProxySetting } = await import(`../config/trustProxy.js?t=${Date.now()}-${Math.random()}`);
  const app = buildEchoApp(getTrustProxySetting());
  const res = await request(app).get('/whoami').set('X-Forwarded-For', '198.51.100.9');
  assert.equal(res.body.ip, '198.51.100.9');
  delete process.env.TRUST_PROXY;
});

test('trustProxy: rejects a bare hop-count integer', async () => {
  process.env.TRUST_PROXY = '1';
  const { getTrustProxySetting } = await import(`../config/trustProxy.js?t=${Date.now()}-${Math.random()}`);
  assert.throws(() => getTrustProxySetting(), /hop count is not supported/);
  delete process.env.TRUST_PROXY;
});

test('trustProxy: rejects a malformed entry', async () => {
  process.env.TRUST_PROXY = 'not-an-ip';
  const { getTrustProxySetting } = await import(`../config/trustProxy.js?t=${Date.now()}-${Math.random()}`);
  assert.throws(() => getTrustProxySetting(), /Invalid TRUST_PROXY entries/);
  delete process.env.TRUST_PROXY;
});

// ── Part 2: integration, real app.js + real ipWhitelist ─────────────────────

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });

async function freshApp() {
  const mod = await import(`../app.js?t=${Date.now()}-${Math.random()}`);
  return mod.default;
}

test('integration: spoofed X-Forwarded-For cannot impersonate an admin-whitelisted IP when TRUST_PROXY is unset', async () => {
  delete process.env.TRUST_PROXY;
  process.env.ADMIN_IP_WHITELIST = '203.0.113.7';
  try {
    const app = await freshApp();
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('X-Forwarded-For', '203.0.113.7'); // attacker-supplied, trying to impersonate the whitelisted IP
    assert.equal(res.status, 403); // still blocked — real peer (loopback) was used, not the spoofed header
  } finally {
    delete process.env.ADMIN_IP_WHITELIST;
  }
});

test('integration: once TRUST_PROXY genuinely trusts the peer, the (now-legitimate) forwarded IP is honored by ipWhitelist', async () => {
  process.env.TRUST_PROXY = '127.0.0.1/32,::1/128,::ffff:127.0.0.1/128';
  process.env.ADMIN_IP_WHITELIST = '203.0.113.7';
  try {
    const app = await freshApp();
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('X-Forwarded-For', '203.0.113.7');
    // Not 403 — ipWhitelist now sees req.ip === '203.0.113.7' and lets it
    // through; the request then fails for an unrelated reason (no admin
    // session), proving ipWhitelist itself was passed, not bypassed by a
    // hole in the mechanism.
    assert.notEqual(res.status, 403);
  } finally {
    delete process.env.TRUST_PROXY;
    delete process.env.ADMIN_IP_WHITELIST;
  }
});
