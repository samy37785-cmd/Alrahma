import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';
import request from 'supertest';

// Scope correction (see docs/current-project-status.md): Supabase-backend
// counterpart of tests/payments-retired.test.js. Proves the same split
// under DATA_BACKEND=supabase: card-gateway routes stay a clean 410
// ONLINE_CARD_PAYMENTS_DISABLED without ever reaching Postgres (proven the
// same way as before — data/supabase/client.js's withUserContext/
// withAnonContext/withServiceRole are mocked to THROW if called at all, so
// a card-gateway route secretly reaching a controller that touches Postgres
// would surface as a 500, never a silent 410); restored routes are proven
// live via unauthenticated 401s (never 410) for the admin surface, which
// needs no real Postgres connection.
//
// DATA_BACKEND=supabase must be set BEFORE app.js is ever imported — same
// dynamic-import-inside-before() pattern as every other Supabase-mode test
// in this suite.

let app;

before(async () => {
  process.env.DATA_BACKEND = 'supabase';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-supabase-backend-mode';
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:1/unused-placeholder';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:1/unused-placeholder';
  process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-supabase-jwt-secret';
  process.env.ADMIN_JWT_ACCESS_SECRET = process.env.ADMIN_JWT_ACCESS_SECRET || 'test-admin-access-secret';
  process.env.ADMIN_ENCRYPTION_KEY = process.env.ADMIN_ENCRYPTION_KEY || 'a'.repeat(64);

  const clientUrl = pathToFileURL(path.resolve('data/supabase/client.js')).href;
  const realClientModule = await import(clientUrl);
  const dbTouched = () => { throw new Error('DB_TOUCHED: a card-gateway route reached the Postgres client — it must never do this'); };
  mock.module(clientUrl, {
    exports: {
      ...realClientModule,
      withUserContext: dbTouched,
      withAnonContext: dbTouched,
      withServiceRole: dbTouched,
    },
  });

  ({ default: app } = await import('../app.js'));
}, { timeout: 30_000 });

after(() => {
  mock.reset();
});

function assertCardDisabled(res, label) {
  assert.equal(res.status, 410, `${label} expected 410, got ${res.status} (body: ${JSON.stringify(res.body)})`);
  assert.deepEqual(res.body, { error: 'ONLINE_CARD_PAYMENTS_DISABLED' }, `${label} unexpected body shape`);
}

async function agentWithCsrf() {
  const agent = request.agent(app);
  const res = await agent.get('/health');
  const setCookie = res.headers['set-cookie'] || [];
  const match = setCookie.map(String).find((c) => c.startsWith('csrf_token='));
  const token = match ? match.split(';')[0].split('=')[1] : null;
  if (!token) throw new Error('csrf_token cookie was not issued by /health');
  return { agent, csrf: { 'x-csrf-token': token } };
}

const CARD_GATEWAY_ROUTES = [
  ['post', '/api/payments/stripe/webhook', { type: 'checkout.session.completed', data: { object: { id: 'cs_test_123' } } }],
  ['post', '/api/payments/stripe', { plan: 'Starter' }],
  ['post', '/api/payments/paypal/webhook', { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-123' } }],
  ['post', '/api/payments/paypal', { plan: 'Starter' }],
  ['post', '/api/payments/paypal/ORDER123/capture', {}],
];

test('DATA_BACKEND=supabase: every online card-gateway route returns a fixed 410 ONLINE_CARD_PAYMENTS_DISABLED without ever touching Postgres', async () => {
  const { agent, csrf } = await agentWithCsrf();
  for (const [method, path_, body] of CARD_GATEWAY_ROUTES) {
    const res = await agent[method](path_).set(csrf).send(body);
    assertCardDisabled(res, `${method.toUpperCase()} ${path_}`);
  }
});

test('DATA_BACKEND=supabase: restored public routes (manual-methods, coupon validate) are live, not 410 — no Postgres touch required for manual-methods (pure env read)', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const methods = await agent.get('/api/payments/manual-methods').set(csrf);
  assert.equal(methods.status, 200);
  assert.notDeepEqual(methods.body, { error: 'PAYMENTS_RETIRED' });
});

test('DATA_BACKEND=supabase: restored admin payments/coupons/invoices routes require authentication — 401, never 410', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const ADMIN_RESTORED_ROUTES = [
    ['get',    '/api/v1/admin/payments/manual', undefined],
    ['get',    '/api/v1/admin/payments', undefined],
    ['patch',  '/api/v1/admin/payments/manual/00000000-0000-0000-0000-000000000000', { status: 'approved' }],
    ['get',    '/api/v1/admin/coupons', undefined],
    ['post',   '/api/v1/admin/coupons', { code: 'X' }],
    ['get',    '/api/v1/admin/invoices', undefined],
    ['patch',  '/api/v1/admin/users/00000000-0000-0000-0000-000000000000/subscription', { action: 'deactivate' }],
  ];

  for (const [method, path_, body] of ADMIN_RESTORED_ROUTES) {
    const res = await agent[method](path_).set(csrf).send(body);
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path_} expected 401 (unauthenticated), got ${res.status}`);
    assert.notDeepEqual(res.body, { error: 'PAYMENTS_RETIRED' });
  }
});
