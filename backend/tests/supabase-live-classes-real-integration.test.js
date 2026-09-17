import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import request from 'supertest';


// Correction (2026-09-17): tests/supabase-live-classes-customer-authorization
// .test.js proves the CONTROLLER's own logic (mocked withUserContext, a fake
// in-memory client) -- valuable, but it does NOT prove that a real request
// (Express routing -> the real `protect` auth middleware -> the real
// withUserContext() -> real Postgres RLS) actually enforces the same
// boundary. A fake client can only ever behave exactly as its own test told
// it to; it cannot catch a real RLS policy gap, a real auth-middleware bug,
// or (as this file found) a real gap in the controller's OWN assumption
// about what its app-layer admin check actually achieves. This file is that
// missing layer: a real disposable Postgres (lib/db's own schema, via
// lib/db/test/run-migrations.mjs -- not reimplemented here), the real
// Express app (app.js, DATA_BACKEND=supabase), real signed JWT cookies
// verified by the real backend/middleware/auth.js `protect`, and real HTTP
// requests via supertest. No mocks anywhere in this file.
//
// Opt-in only (spins up a real Docker container + applies the full schema,
// ~20-40s) -- never part of the default `npm test` sweep, same convention as
// tests/contract/supabase-adapter.contract.test.js. Run with:
//   LIVE_CLASSES_PG_INTEGRATION=1 node --test tests/supabase-live-classes-real-integration.test.js
//
// REAL FINDING from running this file (not present in the mocked suite):
// the mocked test asserted "an admin sends isAdmin=true to the app-layer
// filter" and left it at that -- true, but incomplete. liveClassController.js
// calls withUserContext(req.user._id, ...) with NO `aal` option for these
// routes (see its own module comment), so the Postgres session never carries
// an aal2 JWT claim. live_classes_update_owner_or_admin/_delete_owner_or_admin
// (lib/db/drizzle/0015_new_domains_rls.sql) both gate the admin branch on
// is_admin_aal2(), which requires that claim. The app-level
// `req.user.role === 'admin'` OR-condition in the SQL is therefore live but
// harmless: RLS still silently excludes the row for any admin who isn't also
// the row's real teacher_id, and the controller correctly reports 404 (not a
// 500, not a false success) -- but an admin CANNOT actually edit/delete
// someone else's class through this customer-facing route, contrary to what
// the SQL-shape-only mocked assertion could make it sound like. Confirmed
// below (see "admin, no AAL2 claim" tests). GET (list) is different: RLS's
// live_classes_select_participant_or_admin only requires is_admin() (no
// AAL2), so an admin genuinely does see every class via GET -- also proven
// below, as a real contrast between the two boundaries.

const OPT_IN = process.env.LIVE_CLASSES_PG_INTEGRATION === '1';
const skip = OPT_IN
  ? undefined
  : 'opt-in only -- run with LIVE_CLASSES_PG_INTEGRATION=1 node --test tests/supabase-live-classes-real-integration.test.js (spins up a real disposable Docker Postgres)';

const CONTAINER_NAME = `alrahma-liveclasses-it-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
const DB_NAME = 'alrahma_live_classes_it';
const JWT_SECRET = 'live-classes-integration-test-secret';

let app;
let dbUrl;
let seedClient;

function runCmd(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: env ? { ...process.env, ...env } : process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: String(err) }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uuid() {
  return crypto.randomUUID();
}

function signToken(userId) {
  return jwt.sign({ id: userId, v: 0 }, JWT_SECRET, { algorithm: 'HS256' });
}

// Stateless double-submit CSRF (middleware/csrf.js): any 32-byte hex value
// works as long as the cookie and header match -- no server round-trip
// needed to mint one.
function csrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authedReq(method, url, userId) {
  const token = signToken(userId);
  const csrf = csrfToken();
  const req = request(app)[method](url).set('Cookie', [`token=${token}`, `csrf_token=${csrf}`]);
  if (method !== 'get') req.set('x-csrf-token', csrf);
  return req;
}

let studentId, teacherAId, teacherBId, adminId, existingClassId;

// Memoized behind a single shared promise so the (expensive: Docker +
// migration + seed) setup work only ever runs once regardless of how
// before() itself is invoked, rather than depending on that being true.
let setupPromise;

function doSetup() {
  return (async () => {
  const dockerCheck = await runCmd('docker', ['version', '--format', '{{.Server.Version}}']);
  if (dockerCheck.code !== 0) {
    throw new Error(`Docker is required for this integration test but is not available: ${dockerCheck.stderr}`);
  }

  const password = crypto.randomBytes(24).toString('hex');
  const runResult = await runCmd('docker', [
    'run', '--rm', '-d', '--name', CONTAINER_NAME,
    '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', '127.0.0.1::5432',
    'postgres:16',
  ]);
  if (runResult.code !== 0) throw new Error(`docker run failed: ${runResult.stderr}`);

  let hostPort;
  for (let attempt = 0; attempt < 10; attempt++) {
    const portResult = await runCmd('docker', ['port', CONTAINER_NAME, '5432/tcp']);
    const match = portResult.stdout.trim().match(/:(\d+)\s*$/);
    if (portResult.code === 0 && match) { hostPort = match[1]; break; }
    await sleep(500);
  }
  if (!hostPort) throw new Error(`could not discover the Docker-assigned port for ${CONTAINER_NAME}`);

  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    const check = await runCmd('docker', ['exec', CONTAINER_NAME, 'pg_isready', '-U', 'postgres', '-d', DB_NAME]);
    if (check.code === 0) { ready = true; break; }
    await sleep(1000);
  }
  if (!ready) throw new Error(`Postgres in ${CONTAINER_NAME} did not become ready in time`);

  dbUrl = `postgres://postgres:${password}@127.0.0.1:${hostPort}/${DB_NAME}`;

  // Apply the REAL lib/db/drizzle schema via lib/db's own, already-tested
  // migration runner (never reimplemented here) -- the same schema/RLS the
  // real Supabase project runs.
  const migratePath = path.resolve('..', 'lib', 'db', 'test', 'run-migrations.mjs');
  const migrateResult = await runCmd(process.execPath, [migratePath], { TEST_DATABASE_URL: dbUrl });
  if (migrateResult.code !== 0) {
    throw new Error(`lib/db/test/run-migrations.mjs failed:\n${migrateResult.stdout}\n${migrateResult.stderr}`);
  }

  // Seed real fixture rows as the connecting superuser (RLS/owner rules
  // don't apply to the table owner -- same caveat lib/db's own rls-helpers.mjs
  // documents).
  seedClient = new pg.Client({ connectionString: dbUrl });
  await seedClient.connect();

  studentId = uuid();
  teacherAId = uuid();
  teacherBId = uuid();
  adminId = uuid();
  existingClassId = uuid();

  // auth.users has an AFTER INSERT trigger (on_auth_user_created ->
  // handle_new_user(), lib/db/drizzle/0001_functions_triggers.sql) that
  // auto-creates the matching profiles row (role always 'user', name from
  // raw_user_meta_data or the email prefix) -- exactly what a real Supabase
  // signup does. Insert into auth.users only, then UPDATE the auto-created
  // profiles row for the bits the trigger doesn't set (role=admin,
  // teacher_id) -- do NOT also INSERT INTO profiles directly, that collides
  // with the trigger's own insert on the same primary key.
  for (const [id, email, name] of [
    [studentId, 'student@fixture.test', 'Fixture Student'],
    [teacherAId, 'teacher-a@fixture.test', 'Fixture Teacher A'],
    [teacherBId, 'teacher-b@fixture.test', 'Fixture Teacher B'],
    [adminId, 'admin@fixture.test', 'Fixture Admin'],
  ]) {
    await seedClient.query(
      'INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)',
      [id, email, JSON.stringify({ name })]
    );
  }

  await seedClient.query('UPDATE profiles SET role = $2 WHERE id = $1', [adminId, 'admin']);
  await seedClient.query('UPDATE profiles SET teacher_id = $2 WHERE id = $1', [studentId, teacherAId]);

  await seedClient.query(
    `INSERT INTO live_classes (id, teacher_id, student_id, title, starts_at)
     VALUES ($1, $2, $3, 'Existing fixture class', now() + interval '1 day')`,
    [existingClassId, teacherAId, studentId]
  );

  process.env.DATA_BACKEND = 'supabase';
  process.env.SUPABASE_DB_URL = dbUrl;
  process.env.SUPABASE_URL = 'http://127.0.0.1:0';
  process.env.SUPABASE_ANON_KEY = 'dummy';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
  process.env.SUPABASE_JWT_SECRET = 'dummy-supabase-jwt-secret';
  process.env.MONGO_URI = 'mongodb://127.0.0.1:1/unused';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.NODE_ENV = 'test';
  process.env.CLIENT_URL = 'http://localhost:5173';

  ({ default: app } = await import(pathToFileURL(path.resolve('app.js')).href));
  })();
}

before(async () => {
  if (!OPT_IN) return;
  if (!setupPromise) setupPromise = doSetup();
  await setupPromise;
});

let teardownPromise;

function doTeardown() {
  return (async () => {
    if (seedClient) await seedClient.end().catch(() => {});
    const { closePool } = await import(pathToFileURL(path.resolve('data/supabase/client.js')).href);
    await closePool().catch(() => {});
    await runCmd('docker', ['stop', CONTAINER_NAME]).catch(() => {});
    await runCmd('docker', ['rm', '-f', CONTAINER_NAME]).catch(() => {});
  })();
}

after(async () => {
  if (!OPT_IN) return;
  if (!teardownPromise) teardownPromise = doTeardown();
  await teardownPromise;
});

test('POST /api/classes: an unrelated authenticated user (not the target student\'s teacher) is rejected 404 by REAL RLS, not app logic', { skip }, async () => {
  const res = await authedReq('post', '/api/classes', teacherBId).send({
    student: studentId,
    title: 'Forged class',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.match(res.body.message, /Student not found among your students/);

  const check = await seedClient.query('SELECT count(*) FROM live_classes WHERE title = $1', ['Forged class']);
  assert.equal(check.rows[0].count, '0', 'no row must have been inserted');
});

test('POST /api/classes: the real assigned teacher succeeds against real Postgres (positive control)', { skip }, async () => {
  const res = await authedReq('post', '/api/classes', teacherAId).send({
    student: studentId,
    title: 'Real new class',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.teacher, teacherAId);

  const check = await seedClient.query('SELECT teacher_id FROM live_classes WHERE title = $1', ['Real new class']);
  assert.equal(check.rows[0].teacher_id, teacherAId);
});

test('PATCH /api/classes/:id: a non-owning teacher is rejected 404 by REAL RLS (0 rows), row left unchanged', { skip }, async () => {
  const res = await authedReq('patch', `/api/classes/${existingClassId}`, teacherBId).send({ title: 'Hijacked' });
  assert.equal(res.status, 404, JSON.stringify(res.body));

  const check = await seedClient.query('SELECT title FROM live_classes WHERE id = $1', [existingClassId]);
  assert.equal(check.rows[0].title, 'Existing fixture class', 'the row must be untouched');
});

test('PATCH /api/classes/:id: admin (role=admin, no AAL2 claim) is ALSO rejected 404 by real RLS -- corrects the mocked suite\'s SQL-shape-only claim', { skip }, async () => {
  const res = await authedReq('patch', `/api/classes/${existingClassId}`, adminId).send({ title: 'Admin hijack attempt' });
  assert.equal(res.status, 404, JSON.stringify(res.body));

  const check = await seedClient.query('SELECT title FROM live_classes WHERE id = $1', [existingClassId]);
  assert.equal(check.rows[0].title, 'Existing fixture class', 'an admin with no AAL2 claim must not be able to edit a class they do not own via this route');
});

test('PATCH /api/classes/:id: the owning teacher succeeds against real Postgres (positive control)', { skip }, async () => {
  const res = await authedReq('patch', `/api/classes/${existingClassId}`, teacherAId).send({ title: 'Really updated' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.title, 'Really updated');

  const check = await seedClient.query('SELECT title FROM live_classes WHERE id = $1', [existingClassId]);
  assert.equal(check.rows[0].title, 'Really updated');
});

test('GET /api/classes: admin (no AAL2 needed for SELECT) genuinely sees the class -- real contrast with the PATCH/DELETE boundary above', { skip }, async () => {
  const res = await authedReq('get', '/api/classes', adminId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.some((c) => c._id === existingClassId), 'admin must see every class via GET (is_admin(), no AAL2 required)');
});

test('GET /api/classes: an unrelated user sees none of the fixture classes (real RLS filtering, not just app-code filtering)', { skip }, async () => {
  const res = await authedReq('get', '/api/classes', teacherBId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(!res.body.some((c) => c._id === existingClassId), 'a non-participant, non-admin must not see this class');
});

test('DELETE /api/classes/:id: a non-owning teacher is rejected 404 by real RLS, row still present', { skip }, async () => {
  const res = await authedReq('delete', `/api/classes/${existingClassId}`, teacherBId);
  assert.equal(res.status, 404, JSON.stringify(res.body));

  const check = await seedClient.query('SELECT id FROM live_classes WHERE id = $1', [existingClassId]);
  assert.equal(check.rows.length, 1, 'the row must still exist');
});

test('DELETE /api/classes/:id: the owning teacher succeeds against real Postgres (positive control) -- row genuinely gone', { skip }, async () => {
  const res = await authedReq('delete', `/api/classes/${existingClassId}`, teacherAId);
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const check = await seedClient.query('SELECT id FROM live_classes WHERE id = $1', [existingClassId]);
  assert.equal(check.rows.length, 0, 'the row must genuinely be gone from Postgres, not just report success');
});
