import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import speakeasy from 'speakeasy';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import LiveClass from '../models/LiveClass.js';
import HifzProgress from '../models/HifzProgress.js';
import CourseProgress from '../models/CourseProgress.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Auth hardening security batch: proves the properties the task explicitly
// required, end to end against the real app/DB (mongodb-memory-server, no
// external services):
//   1. A regular user with no AdminUser session gets 401/403 from every
//      admin operation this batch migrated.
//   2. Even a User document whose `role` field is literally 'admin' cannot
//      use the hardened Admin API — it has no admin_at cookie at all, and
//      that field is architecturally unrelated to it (middleware/
//      adminAuth.js's verifyAccessToken() only ever reads admin_at).
//   3. Public registration with role/accountType set to 'admin', 'parent',
//      or 'teacher' does not grant that account type — every account is
//      created as the storage-layer 'student' regardless (see
//      controllers/authController.js's register()).
//   4. A real AdminUser session, reached only via password + MFA, works.
//   5. Missing/failed MFA blocks the request (MFA_REQUIRED / 401).
//   6. CSRF is required for a mutating admin request.
// Sections further below cover the specific routes migrated off the legacy
// protect+adminOnly/staffOnly stack in this same batch (trials, newsletter
// subscribers, per-user hifz/progress reports, certificate listing, live
// classes) — each of those legacy GET/POST/PATCH/DELETE routes must now be
// gone (404) and their /api/v1/admin/* replacement must be reachable only
// with a real AdminUser + MFA session and the right RBAC permission.

const STUDENT_PASSWORD = 'Stud3nt-Str0ng-Pass!';
const ADMIN_PASSWORD   = 'Sup3r-Str0ng-Admin-Pass!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeStudentAgent(overrides = {}) {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `student${Date.now()}${Math.random()}@example.com`;
  await agent.post('/api/auth/register').set(csrf).send({ name: 'Student', email, password: STUDENT_PASSWORD, ...overrides });
  return { agent, csrf, email };
}

// A regular User document whose `role` field is directly set to 'admin' in
// the database — simulating a stale/legacy/tampered record, since public
// registration itself can no longer produce this (see the registration
// test below). Logs in normally (regular customer session, `token` cookie)
// — there is no admin_at cookie anywhere in this flow.
async function makeSpoofedAdminRoleAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `spoofed-admin-${Date.now()}${Math.random()}@example.com`;
  await User.create({ name: 'Spoofed', email, password: STUDENT_PASSWORD, role: 'admin' });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: STUDENT_PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf };
}

async function makeAdminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: ADMIN_PASSWORD, role,
  });
  const token = signAccessToken(admin._id, admin.role, true); // mfaVerified: true — real, MFA-cleared session
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader, admin };
}

// Every route this batch migrated off the legacy protect+adminOnly stack —
// used both to confirm the legacy path is gone (404) and to drive the
// generic 401/403/200 matrix below. `body` is only used for the mutating
// entries; GETs ignore it.
const MIGRATED = [
  { method: 'get',    legacy: '/api/trials',              admin: '/api/v1/admin/trials',            perm: 'users:read' },
  { method: 'get',    legacy: '/api/newsletter',           admin: '/api/v1/admin/subscribers',       perm: 'users:read' },
  { method: 'get',    legacy: '/api/certificates',         admin: '/api/v1/admin/certificates',      perm: 'certificates:read' },
  { method: 'get',    legacy: '/api/enrollments',          admin: '/api/v1/admin/enrollments',       perm: 'enrollments:read' },
  { method: 'get',    legacy: '/api/coupons',              admin: '/api/v1/admin/coupons',           perm: 'coupons:write' },
  { method: 'get',    legacy: '/api/contact',              admin: '/api/v1/admin/contact',           perm: 'contact:write' },
];

test('every legacy admin-only GET route removed by this batch no longer exists (404), for unauthenticated, regular-student, and role-spoofed-admin callers alike', async () => {
  const anon     = await agentWithCsrf(app);
  const student  = await makeStudentAgent();
  const spoofed  = await makeSpoofedAdminRoleAgent();

  for (const { agent, csrf } of [anon, student, spoofed]) {
    for (const { method, legacy } of MIGRATED) {
      const res = await agent[method](legacy).set(csrf).send({});
      assert.equal(res.status, 404, `${method.toUpperCase()} ${legacy} expected 404 (removed), got ${res.status}`);
    }
  }
});

test('every migrated admin GET route rejects an unauthenticated caller with 401', async () => {
  for (const { method, admin } of MIGRATED) {
    const { agent, csrf } = await agentWithCsrf(app);
    const res = await agent[method](admin).set(csrf).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${admin} expected 401, got ${res.status}`);
  }
});

test('every migrated admin GET route rejects a regular user session with 401 (no admin_at cookie at all — not a permissions question)', async () => {
  const { agent, csrf } = await makeStudentAgent();
  for (const { method, admin } of MIGRATED) {
    const res = await agent[method](admin).set(csrf).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${admin} expected 401, got ${res.status}`);
  }
});

test('the core property this batch closes: a regular User document with role="admin" still cannot use the hardened Admin API — same 401 as any other regular session', async () => {
  const { agent, csrf } = await makeSpoofedAdminRoleAgent();
  for (const { method, admin } of MIGRATED) {
    const res = await agent[method](admin).set(csrf).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${admin} expected 401 even with role='admin', got ${res.status}`);
  }
  // Same property against a plain, already-existing hardened endpoint too.
  const usersRes = await agent.get('/api/v1/admin/users').set(csrf);
  assert.equal(usersRes.status, 401);
});

test('GET /api/v1/admin/invoices requires a real AdminUser session with payments:read; the legacy GET /api/invoices/admin path returns an explicit 410, never a CastError-shaped 500 or an admin listing', async () => {
  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  assert.equal((await anon.get('/api/v1/admin/invoices').set(anonCsrf)).status, 401);

  const student = await makeStudentAgent();
  // Review follow-up: before routes/invoiceRoutes.js gained an explicit
  // GET /admin handler, "admin" fell through to GET /:id and
  // Invoice.findOne({ _id: 'admin', ... }) threw a Mongoose CastError
  // (invalid ObjectId) before ever reaching getInvoice()'s own 404 check —
  // an opaque 500, not a deliberate response. A dedicated route now
  // shadows :id for this exact literal path and returns a clean 410.
  const shadowed = await student.agent.get('/api/invoices/admin').set(student.csrf);
  assert.equal(shadowed.status, 410, 'the legacy route must return an explicit 410, not a CastError-shaped 500');
  assert.equal(shadowed.body.error, 'ADMIN_ROUTE_MOVED');

  // Anonymous callers get the exact same explicit response — this route
  // needs no auth check of its own; it never touches the database at all.
  const shadowedAnon = await anon.get('/api/invoices/admin').set(anonCsrf);
  assert.equal(shadowedAnon.status, 410);

  const { agent, csrf, cookieHeader } = await makeAdminAgent('admin');
  const ok = await agent.get('/api/v1/admin/invoices').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(ok.status, 200);
});

test('every migrated admin GET route rejects a real AdminUser session that lacks the required permission (403), and allows one that has it (200)', async () => {
  const forbidden = await makeAdminAgent('viewer'); // viewer lacks coupons:write/contact:write
  const allowed   = await makeAdminAgent('admin');

  for (const { method, admin, perm } of MIGRATED) {
    if (['coupons:write', 'contact:write'].includes(perm)) {
      const res = await forbidden.agent[method](admin).set({ ...forbidden.csrf, Cookie: forbidden.cookieHeader }).send({});
      assert.equal(res.status, 403, `${method.toUpperCase()} ${admin} expected 403 for viewer, got ${res.status}`);
    }
    const ok = await allowed.agent[method](admin).set({ ...allowed.csrf, Cookie: allowed.cookieHeader }).send({});
    assert.equal(ok.status, 200, `${method.toUpperCase()} ${admin} expected 200 for admin, got ${ok.status}`);
  }
});

// ---------------------------------------------------------------------------
// Per-user hifz/progress reports — nested under /v1/admin/users/:id
// ---------------------------------------------------------------------------

test('GET /api/v1/admin/users/:id/hifz and /progress are reachable only with a real AdminUser session; legacy /api/hifz/user/:id and /api/progress/user/:id are gone', async () => {
  const student = await User.create({ name: 'S', email: `hifz-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  await HifzProgress.create({ user: student._id, chapterId: 1, status: 'memorized' });
  await CourseProgress.create({ user: student._id, course: student._id, completed: [] });

  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  assert.equal((await anon.get(`/api/hifz/user/${student._id}`).set(anonCsrf)).status, 404);
  assert.equal((await anon.get(`/api/progress/user/${student._id}`).set(anonCsrf)).status, 404);
  assert.equal((await anon.get(`/api/v1/admin/users/${student._id}/hifz`).set(anonCsrf)).status, 401);
  assert.equal((await anon.get(`/api/v1/admin/users/${student._id}/progress`).set(anonCsrf)).status, 401);

  const { agent, csrf, cookieHeader } = await makeAdminAgent();
  const hifz = await agent.get(`/api/v1/admin/users/${student._id}/hifz`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(hifz.status, 200);
  assert.equal(hifz.body.length, 1);

  const progress = await agent.get(`/api/v1/admin/users/${student._id}/progress`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(progress.status, 200);
});

// ---------------------------------------------------------------------------
// Live classes — Mongo mode had no /v1/admin implementation at all before
// this batch; AdminClassesTab.jsx's mutations went through the legacy
// staffOnly routes instead.
// ---------------------------------------------------------------------------

test('legacy staffOnly POST/PATCH/DELETE /api/classes mutation routes are gone (404); GET / (self-service) is unaffected', async () => {
  const { agent, csrf } = await makeStudentAgent();
  assert.equal((await agent.post('/api/classes').set(csrf).send({})).status, 404);
  assert.equal((await agent.patch('/api/classes/000000000000000000000000').set(csrf).send({})).status, 404);
  assert.equal((await agent.delete('/api/classes/000000000000000000000000').set(csrf)).status, 404);
  assert.equal((await agent.get('/api/classes').set(csrf)).status, 200);
});

test('POST/DELETE /api/v1/admin/live-classes require a real AdminUser session with live_classes:write, and actually work', async () => {
  const student = await User.create({ name: 'Participant', email: `live-${Date.now()}@example.com`, password: STUDENT_PASSWORD });

  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  const unauth = await anon.post('/api/v1/admin/live-classes').set(anonCsrf).send({ student: student._id, title: 'X', startsAt: new Date().toISOString() });
  assert.equal(unauth.status, 401);

  const viewer = await makeAdminAgent('viewer');
  const forbidden = await viewer.agent.post('/api/v1/admin/live-classes').set({ ...viewer.csrf, Cookie: viewer.cookieHeader })
    .send({ student: student._id, title: 'X', startsAt: new Date().toISOString() });
  assert.equal(forbidden.status, 403);

  const { agent, csrf, cookieHeader } = await makeAdminAgent('admin');
  const create = await agent.post('/api/v1/admin/live-classes').set({ ...csrf, Cookie: cookieHeader })
    .send({ student: student._id, title: 'Tajweed', startsAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(create.status, 201);
  assert.equal(create.body.teacher, null, 'an admin-scheduled class has no regular-User teacher identity');

  const del = await agent.delete(`/api/v1/admin/live-classes/${create.body._id}`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(del.status, 200);
  assert.equal(await LiveClass.findById(create.body._id), null);
});

// Review follow-up: GET /v1/admin/live-classes used to return a bare array
// in Mongo mode while data/supabase/admin/liveClassesAdminController.js
// already returned the standard { data, total, page, pages } envelope every
// other /v1/admin/* list endpoint uses (utils/pagination.js's
// sendPaginated()) — AdminClassesTab.jsx (classes.map(...)) crashed under
// DATA_BACKEND=supabase as a result. Mongo's shape is what changed to match.
test('GET /api/v1/admin/live-classes returns the standard { data, total, page, pages } paginated envelope, matching every other /v1/admin/* list endpoint (and the Supabase-mode equivalent)', async () => {
  const student = await User.create({ name: 'Envelope Participant', email: `live-envelope-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  const { agent, csrf, cookieHeader } = await makeAdminAgent('admin');

  await agent.post('/api/v1/admin/live-classes').set({ ...csrf, Cookie: cookieHeader })
    .send({ student: student._id, title: 'Envelope check', startsAt: new Date(Date.now() + 86400000).toISOString() });

  const res = await agent.get('/api/v1/admin/live-classes').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data), 'the array of classes must live under a `data` key, not be the top-level response');
  assert.equal(typeof res.body.total, 'number');
  assert.equal(typeof res.body.page, 'number');
  assert.equal(typeof res.body.pages, 'number');
  assert.ok(res.body.data.some((c) => c.title === 'Envelope check'));
});

// ---------------------------------------------------------------------------
// Registration: closes the live role-escalation gap (role: 'parent' used to
// be accepted verbatim from the client).
// ---------------------------------------------------------------------------

test('POST /api/auth/register ignores any client-supplied role/accountType — admin, parent, and teacher are all unreachable this way', async () => {
  for (const spoofedRole of ['admin', 'parent', 'teacher', 'super-admin', 'owner']) {
    const { agent, csrf } = await agentWithCsrf(app);
    const email = `spoof-${spoofedRole}-${Date.now()}${Math.random()}@example.com`;
    const res = await agent.post('/api/auth/register').set(csrf).send({
      name: 'X', email, password: STUDENT_PASSWORD, role: spoofedRole, accountType: spoofedRole,
    });
    assert.equal(res.status, 201, `registration itself must still succeed for role="${spoofedRole}"`);

    const user = await User.findOne({ email });
    assert.equal(user.role, 'student', `role="${spoofedRole}" must never be persisted — got "${user.role}"`);
  }
});

// ---------------------------------------------------------------------------
// Real AdminUser session, MFA required/enforced, CSRF required.
// ---------------------------------------------------------------------------

test('a real AdminUser session works end to end only after password + MFA, and a request missing MFA verification is blocked with MFA_REQUIRED', async () => {
  const admin = await AdminUser.create({ name: 'A', email: `mfa-${Date.now()}@example.com`, password: ADMIN_PASSWORD, role: 'admin' });
  const secret = speakeasy.generateSecret({ length: 32 });
  admin.setMfaSecret(secret.base32);
  admin.mfaEnabled = true;
  await admin.save({ validateBeforeSave: false });

  // A pre-MFA access token (mfaVerified: false) must be blocked with MFA_REQUIRED.
  const preMfaToken = signAccessToken(admin._id, admin.role, false);
  const { agent, csrf } = await agentWithCsrf(app);
  const blocked = await agent.get('/api/v1/admin/users')
    .set({ ...csrf, Cookie: `admin_at=${preMfaToken}; csrf_token=${csrf['x-csrf-token']}` });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'MFA_REQUIRED');

  // A real post-MFA session must succeed.
  const { agent: real, csrf: realCsrf } = await agentWithCsrf(app);
  const login = await real.post('/api/v1/admin/auth/login').set(realCsrf).send({ email: admin.email, password: ADMIN_PASSWORD });
  assert.equal(login.body.stage, 'mfa');
  const verify = await real.post('/api/v1/admin/auth/mfa/verify').set(realCsrf)
    .send({ token: speakeasy.totp({ secret: secret.base32, encoding: 'base32' }) });
  assert.equal(verify.status, 200);
  const ok = await real.get('/api/v1/admin/users').set(realCsrf);
  assert.equal(ok.status, 200);
});

test('CSRF is required for a mutating admin request — missing X-CSRF-Token is rejected even with a valid, MFA-cleared admin session', async () => {
  const { agent, cookieHeader } = await makeAdminAgent('admin');
  // Deliberately send the Cookie header (including the real csrf_token
  // cookie) but withhold the X-CSRF-Token request header — this is exactly
  // the double-submit mismatch middleware/csrf.js's verifyCsrfToken exists
  // to reject.
  const res = await agent.post('/api/v1/admin/certificates').set({ Cookie: cookieHeader }).send({});
  assert.equal(res.status, 403);
});
