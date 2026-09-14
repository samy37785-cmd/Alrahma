import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// Review follow-up: GET /v1/admin/trials and GET /v1/admin/subscribers
// (routes/v1/admin/trialsRoutes.js, subscribersRoutes.js) are Mongoose-
// backed and were previously mounted unconditionally, regardless of
// DATA_BACKEND. Under DATA_BACKEND=supabase, app.js deliberately never
// calls connectDB() (Postgres is the real datastore in that mode) — a
// Mongoose query against a connection that will never open sits buffering
// until it times out, then fails with an opaque 500 that gives no hint the
// real issue is "this admin feature has no Supabase adapter." These two
// resources now get an explicit 501 under supabase mode instead
// (middleware/backendNotImplemented.js), same branching shape as every
// other admin subrouter in routes/v1/admin/index.js.
//
// This can't be proven with a normal authenticated HTTP round trip: under
// DATA_BACKEND=supabase, verifyAccessToken's admin lookup
// (data/supabase/loadAdmin.js) requires a real Postgres connection, which
// this suite deliberately never makes (no real database, per this batch's
// constraints). Instead, this imports the real admin router module with
// DATA_BACKEND=supabase actually set (so the isSupabaseBackend() ternaries
// in routes/v1/admin/index.js really evaluate the supabase branch, not
// just read as if they should), and inspects its Express route table
// directly: a real sub-router (the Mongo-mode implementation) is an
// express.Router() instance and therefore exposes its own `.stack`;
// backendNotImplemented() returns a single terminal handler function with
// no `.stack` at all — a structural fact about what got mounted, not an
// assumption about it.
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

function callHandler(handler) {
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
  handler({}, res);
  return res;
}

test('DATA_BACKEND=supabase: /v1/admin/trials is wired to an explicit 501 responder, not the Mongoose-backed router', () => {
  const handler = findMountedLayer('trials').handle;
  assert.equal(typeof handler.stack, 'undefined', 'must not be an express.Router() (the Mongo-mode implementation)');

  const res = callHandler(handler);
  assert.equal(res._status, 501);
  assert.equal(res._body.error, 'NOT_IMPLEMENTED_FOR_BACKEND');
});

test('DATA_BACKEND=supabase: /v1/admin/subscribers is wired to an explicit 501 responder, not the Mongoose-backed router', () => {
  const handler = findMountedLayer('subscribers').handle;
  assert.equal(typeof handler.stack, 'undefined', 'must not be an express.Router() (the Mongo-mode implementation)');

  const res = callHandler(handler);
  assert.equal(res._status, 501);
  assert.equal(res._body.error, 'NOT_IMPLEMENTED_FOR_BACKEND');
});

test('DATA_BACKEND=supabase: /v1/admin/live-classes, by contrast, IS a real router (has its own Supabase adapter — proves the 501 branch above is specific to trials/subscribers, not every admin route under this backend)', () => {
  const handler = findMountedLayer('live-classes').handle;
  assert.equal(typeof handler.stack, 'object', 'expected an express.Router() instance');
});
