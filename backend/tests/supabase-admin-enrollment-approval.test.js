import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';
import request from 'supertest';

// Scope correction (see docs/current-project-status.md): PATCH /api/v1/
// admin/enrollments/:id/approve under DATA_BACKEND=supabase, wired to the
// admin_activate_subscription_from_enrollment() RPC (lib/db/drizzle/
// 0028_admin_booking_activation.sql), which resolves the plan to activate
// FROM THE BOOKING itself (requested_plan_slug) — this route takes no
// planId; the request body is empty (or an optional currentPeriodEnd). The
// RPC's own real-Postgres behavior (happy path with the booking's own
// plan, double-approve rejection, no-matching-account rejection, no-
// matching-plan rejection, enrollments:write-permission rejection,
// non-admin/non-AAL2 rejection) is verified directly against a disposable
// local Postgres in lib/db/test/rpc-admin-booking-activation.local.test.mjs
// — full Postgres-backed HTTP integration is out of scope for this
// no-Docker `npm test` run. This file only proves the HTTP-layer wiring:
// the route exists and requires authentication, without ever touching
// Postgres (dynamic-import + mocked client.js, same pattern as
// tests/payments-retired-supabase.test.js).

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
  const dbTouched = () => { throw new Error('DB_TOUCHED: an unauthenticated request must never reach the Postgres client'); };
  mock.module(clientUrl, {
    exports: { ...realClientModule, withUserContext: dbTouched, withAnonContext: dbTouched, withServiceRole: dbTouched },
  });

  ({ default: app } = await import('../app.js'));
}, { timeout: 30_000 });

after(() => {
  mock.reset();
});

async function agentWithCsrf() {
  const agent = request.agent(app);
  const res = await agent.get('/health');
  const setCookie = res.headers['set-cookie'] || [];
  const match = setCookie.map(String).find((c) => c.startsWith('csrf_token='));
  const token = match ? match.split(';')[0].split('=')[1] : null;
  if (!token) throw new Error('csrf_token cookie was not issued by /health');
  return { agent, csrf: { 'x-csrf-token': token } };
}

test('DATA_BACKEND=supabase: PATCH /api/v1/admin/enrollments/:id/approve exists and requires authentication (401, never touching Postgres)', async () => {
  const { agent, csrf } = await agentWithCsrf();
  const res = await agent
    .patch('/api/v1/admin/enrollments/00000000-0000-0000-0000-000000000000/approve')
    .set(csrf)
    .send({});
  assert.equal(res.status, 401);
});

test('static: data/supabase/admin/enrollmentsAdminRoutes.js registers PATCH /:id/approve before the generic /:id routes, wired to enrollments.approve', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(path.resolve('data/supabase/admin/enrollmentsAdminRoutes.js'), 'utf8');
  assert.match(source, /router\.patch\('\/:id\/approve',\s*requirePermissions\('enrollments:write'\),\s*asyncHandler\(enrollments\.approve\)\)/);
  const approveIdx = source.indexOf("'/:id/approve'");
  const genericGetIdx = source.indexOf("router.get('/:id'");
  assert.ok(approveIdx > -1 && genericGetIdx > -1 && approveIdx < genericGetIdx, 'the static /:id/approve route must be registered before the generic /:id route');
});
