import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// Production-readiness audit follow-up (2026-09-17): this file used to
// prove GET /v1/admin/trials and GET /v1/admin/subscribers were an
// explicit 501 under DATA_BACKEND=supabase (a real, acknowledged gap at
// the time — see git history for the old version of this file). That gap
// is now closed: trial_requests_select_admin/subscribers_select_admin
// (lib/db/drizzle/0002_rls.sql) already granted exactly the read needed
// (is_admin(), AAL1, no new migration), so real adapters were added —
// data/supabase/admin/trialsAdminController.js/subscribersAdminController.js,
// mounted via trialsAdminRoutes.js/subscribersAdminRoutes.js. This file is
// rewritten in place (not deleted) to prove the fix, using the exact same
// router-introspection technique the old version used to prove the gap.
//
// This can't be proven with a normal authenticated HTTP round trip: under
// DATA_BACKEND=supabase, verifyAccessToken's admin lookup
// (data/supabase/loadAdmin.js) requires a real Postgres connection, which
// this suite deliberately never makes (no real database). Instead, this
// imports the real admin router module with DATA_BACKEND=supabase actually
// set (so the isSupabaseBackend() ternaries in routes/v1/admin/index.js
// really evaluate the supabase branch), and inspects its Express route
// table directly: a real sub-router (an express.Router() instance) exposes
// its own `.stack`; the old backendNotImplemented() stub did not — a
// structural fact about what got mounted, not an assumption about it.
let router;

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

  ({ default: router } = await import('../routes/v1/admin/index.js'));
});

function findMountedLayer(pathFragment) {
  // Matching on the regexp's SOURCE (not .test()) deliberately: nearly
  // every global middleware in this router (ipWhitelist, helmet,
  // adminApiLimiter, sanitizeMongo, verifyAccessToken, maintenanceGuard) is
  // mounted at '/' and its regexp therefore also .test()-matches
  // '/trials'/'/subscribers' — that would find the wrong layer. Only a
  // layer actually registered via router.use('/trials', ...) has that path
  // segment baked into its regexp's source.
  const layer = router.stack.find((l) => l.regexp && l.regexp.source.includes(pathFragment));
  assert.ok(layer, `no router.use('/${pathFragment}', ...) layer found`);
  return layer;
}

test('DATA_BACKEND=supabase: /v1/admin/trials is a real express.Router() (the Supabase adapter), not a 501 stub', () => {
  const handler = findMountedLayer('trials').handle;
  assert.equal(typeof handler.stack, 'object', 'expected an express.Router() instance');
});

test('DATA_BACKEND=supabase: /v1/admin/subscribers is a real express.Router() (the Supabase adapter), not a 501 stub', () => {
  const handler = findMountedLayer('subscribers').handle;
  assert.equal(typeof handler.stack, 'object', 'expected an express.Router() instance');
});

test('DATA_BACKEND=supabase: /v1/admin/live-classes is likewise a real router (unchanged — sanity check that the assertion technique itself still works)', () => {
  const handler = findMountedLayer('live-classes').handle;
  assert.equal(typeof handler.stack, 'object', 'expected an express.Router() instance');
});
