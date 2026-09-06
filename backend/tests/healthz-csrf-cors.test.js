import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { setupTestDb, teardownTestDb } from './helpers/db.js';

// Regression coverage for "Final Pre-Cutover Closure": this backend/ tree
// was restored from the exact commit Render has live (6c4437e), which
// predates /api/csrf and never had /api/healthz at all — both added back
// here, plus the CORS preview-scope hardening (see app.js). None of these
// three routes touch the database, so no MongoDB connection would be
// strictly required for them alone — but Express itself still needs a
// listener, and the shared before/after here keeps this file consistent
// with every other integration test in this suite.
before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });

test('GET /health is a DB-free liveness probe (Render\'s own health check path)', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('GET /api/healthz mirrors /health and is reachable under /api (what vercel.json actually rewrites through the official domain)', async () => {
  const res = await request(app).get('/api/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(typeof res.body.uptime, 'number');
});

test('GET /api/csrf returns { ok: true } and issues the csrf_token cookie (the frontend\'s ensureCsrfToken() warm-up call)', async () => {
  const res = await request(app).get('/api/csrf');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  const setCookie = (res.headers['set-cookie'] || []).map(String);
  assert.ok(setCookie.some((c) => c.startsWith('csrf_token=')), 'expected /api/csrf to set the csrf_token cookie');
  const cookie = setCookie.find((c) => c.startsWith('csrf_token='));
  assert.match(cookie, /SameSite=Strict/i);
});

test('GET /api/csrf works even without a prior request (no cookie required to call it) — the exact bug this route fixes', async () => {
  // A fresh, cookie-less client — simulates a visitor landing directly on
  // /login with zero prior requests, the scenario b14ea13 fixed.
  const res = await request(app).get('/api/csrf').set('Cookie', '');
  assert.equal(res.status, 200);
});

test('CORS: an explicitly allowed origin (CLIENT_URL) is echoed back with credentials enabled', async () => {
  const origin = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
  const res = await request(app).get('/health').set('Origin', origin);
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], origin);
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
});

test('CORS: an attacker-registered *.vercel.app origin outside VERCEL_PREVIEW_SCOPE is rejected', async () => {
  // Simulates F6's exact threat model: *.vercel.app subdomains are
  // first-come-first-served across ALL Vercel accounts, so a bare
  // /^https:\/\/alrahma-[a-z0-9-]+\.vercel\.app$/ regex (the pre-fix check)
  // would have matched this. With VERCEL_PREVIEW_SCOPE unset (this test's
  // env), previewOrigin is null, so no *.vercel.app origin should ever be
  // allowed — fail closed.
  const res = await request(app).get('/health').set('Origin', 'https://alrahma-evil-project.vercel.app');
  assert.notEqual(res.headers['access-control-allow-origin'], 'https://alrahma-evil-project.vercel.app');
});

test('CORS: a request with no Origin header (curl/mobile/server-to-server) is never blocked', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
});
