#!/usr/bin/env node
// Rehearsal for "Al-Rahma Final Corrections + Canonical Repository
// Consolidation" Part A — boots the real Express app with DATA_BACKEND=
// supabase against a local rehearsal Postgres (schema 0000-0017 already
// applied) and exercises: the redesigned admin AAL2 verification, the 4
// admin CRUD adapters (courses/live-classes/certificates/reviews), admin
// payments (manual-payment review + refund via a 'manual'-gateway charge,
// which needs no real Stripe/PayPal API call), and parent-child linking.
//
// Same scope boundary as rehearsal-api-tests-stage2f.mjs: no real GoTrue is
// stood up here (same reasoning — avoids colliding with the separate,
// unrelated local Supabase stack already running on this machine). Customer-
// session routes use a locally-signed `token` cookie (protect() never calls
// GoTrue for an already-authenticated request). Admin AAL2 is rehearsed by
// signing an admin_sat cookie with the SAME SUPABASE_JWT_SECRET this
// backend verifies it against — a real GoTrue-issued token and a test-signed
// one are cryptographically indistinguishable to the verifier, since the
// only thing verifyAccessToken checks is "was this signed with
// SUPABASE_JWT_SECRET and does it carry aal:aal2 for this admin's id" — but
// this rehearsal does NOT exercise the actual login/MFA HTTP flow that
// would normally produce that cookie (GoTrue enroll/challenge/verify),
// which remains a real, documented UNKNOWN, same as Stage 2F left it.
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import request from 'supertest';
import { signAccessToken, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../../utils/adminAuthTokens.js';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

function signToken(id, role) {
  return jwt.sign({ id, role, v: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function signSupabaseAal2(userId) {
  return jwt.sign({ sub: userId, aal: 'aal2' }, process.env.SUPABASE_JWT_SECRET, { expiresIn: '15m' });
}
function signSupabaseAal1(userId) {
  return jwt.sign({ sub: userId, aal: 'aal1' }, process.env.SUPABASE_JWT_SECRET, { expiresIn: '15m' });
}

async function main() {
  assertLocalHost(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL');
  assert.equal(process.env.DATA_BACKEND, 'supabase', 'DATA_BACKEND must be "supabase" for this script');
  assert.ok(process.env.SUPABASE_JWT_SECRET, 'SUPABASE_JWT_SECRET must be set for this rehearsal');

  const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });

  const superAdmin = '30000000-0000-4000-8000-000000000001';
  const student = '30000000-0000-4000-8000-000000000002';
  const parent = '30000000-0000-4000-8000-000000000003';
  const teacher = '30000000-0000-4000-8000-000000000004';

  for (const [id, email, role] of [
    [superAdmin, 'rehearsal.superadmin@test.local', 'admin'],
    [student, 'rehearsal.parentchild.student@test.local', 'user'],
    [parent, 'rehearsal.parent@test.local', 'user'],
    [teacher, 'rehearsal.pa.teacher@test.local', 'user'],
  ]) {
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [id, email]);
    await pool.query(
      `INSERT INTO profiles (id, email, name, role) VALUES ($1,$2,$2,$3) ON CONFLICT (id) DO UPDATE SET role = $3, name = $2`,
      [id, email, role]
    );
  }
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'super-admin') ON CONFLICT (user_id) DO UPDATE SET role = 'super-admin'`,
    [superAdmin]
  );

  const courseRes = await pool.query(
    `INSERT INTO courses (title, description, published) VALUES ('PartA Course', 'd', true) RETURNING id`
  );
  const courseId = courseRes.rows[0].id;

  const reviewRes = await pool.query(
    `INSERT INTO reviews (student_id, course_id, rating, title, body, status) VALUES ($1, $2, 5, 'T', 'B', 'pending') RETURNING id`,
    [student, courseId]
  );
  const reviewId = reviewRes.rows[0].id;

  const manualChargeRes = await pool.query(
    `INSERT INTO payments (user_id, kind, amount_minor, currency_snapshot, gateway, status)
     VALUES ($1, 'charge', 5000, 'EUR', 'manual', 'succeeded') RETURNING id`,
    [student]
  );
  const manualChargeId = manualChargeRes.rows[0].id;

  const manualSubmissionRes = await pool.query(
    `INSERT INTO manual_payments (user_id, requested_plan_slug, amount_minor, currency_snapshot, method)
     VALUES ($1, 'monthly', 5000, 'EUR', 'iban') RETURNING id`,
    [student]
  );
  const manualSubmissionId = manualSubmissionRes.rows[0].id;

  const { default: app } = await import('../../app.js');

  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`  PASS  ${name}`);
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
      console.log(`  FAIL  ${name}: ${err.message}`);
    }
  };

  async function userAgent(userId) {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/blog');
    const cookie = (csrfRes.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
    const csrfToken = cookie.split(';')[0].split('=')[1];
    return { agent, csrfHeaders: { 'x-csrf-token': csrfToken, Cookie: `token=${signToken(userId, 'user')}` } };
  }

  async function adminAgent(adminId, { aal2 = true } = {}) {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/blog');
    const cookie = (csrfRes.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
    const csrfToken = cookie.split(';')[0].split('=')[1];
    const at = signAccessToken(adminId, 'super-admin', true);
    const sat = aal2 ? signSupabaseAal2(adminId) : signSupabaseAal1(adminId);
    const cookieHeader = `${ACCESS_TOKEN_COOKIE}=${at}; admin_sat=${sat}`;
    return { agent, csrfHeaders: { 'x-csrf-token': csrfToken, Cookie: cookieHeader } };
  }

  console.log('[rehearsal] reviews_public: anon listing shows a real name, not null');
  await check('public course reviews expose the real reviewer name via reviews_public', async () => {
    await pool.query(`UPDATE reviews SET status = 'approved' WHERE id = $1`, [reviewId]);
    const res = await request(app).get(`/api/reviews/course/${courseId}`);
    assert.equal(res.status, 200);
    const found = res.body.reviews.find((r) => r._id === reviewId);
    assert.ok(found, 'review missing from public listing');
    assert.equal(found.student.name, 'rehearsal.parentchild.student@test.local');
    await pool.query(`UPDATE reviews SET status = 'pending' WHERE id = $1`, [reviewId]);
  });

  console.log('[rehearsal] admin AAL1-only is rejected on an AAL2-gated admin write');
  await check('admin write with admin_sat aal1 (not aal2) is rejected', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin, { aal2: false });
    const res = await agent.post('/api/v1/admin/courses').set(csrfHeaders).send({ title: 'x', description: 'd' });
    assert.notEqual(res.status, 201, 'AAL1-only admin_sat must not satisfy is_admin_aal2()');
  });

  console.log('[rehearsal] admin courses CRUD (create/read/update/delete)');
  let createdCourseId;
  await check('admin can create a course (AAL2 verified)', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.post('/api/v1/admin/courses').set(csrfHeaders).send({ title: 'New Course', description: 'd', price: 10 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    createdCourseId = res.body._id;
  });
  await check('admin can list courses (paginated envelope)', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.get('/api/v1/admin/courses').set('Cookie', csrfHeaders.Cookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(typeof res.body.total === 'number');
  });
  await check('admin can update the course', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.put(`/api/v1/admin/courses/${createdCourseId}`).set(csrfHeaders).send({ title: 'Renamed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Renamed');
  });
  await check('admin can delete the course (cascade RPC)', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.delete(`/api/v1/admin/courses/${createdCourseId}`).set(csrfHeaders);
    assert.equal(res.status, 200);
  });

  console.log('[rehearsal] admin live-classes CRUD');
  let createdClassId;
  await check('admin can create a live class between any teacher/student pair', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.post('/api/v1/admin/live-classes').set(csrfHeaders).send({
      teacher, student, title: 'Admin-scheduled', startsAt: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    createdClassId = res.body._id;
  });
  await check('admin can update and delete the live class', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const upd = await agent.patch(`/api/v1/admin/live-classes/${createdClassId}`).set(csrfHeaders).send({ status: 'cancelled' });
    assert.equal(upd.status, 200);
    const del = await agent.delete(`/api/v1/admin/live-classes/${createdClassId}`).set(csrfHeaders);
    assert.equal(del.status, 200);
  });

  console.log('[rehearsal] admin certificate issue/revoke');
  let certId;
  await check('admin can issue a certificate', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.post('/api/v1/admin/certificates').set(csrfHeaders).send({
      user: student, studentName: 'Rehearsal Student', type: 'completion', title: 'Completion Cert',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    certId = res.body._id;
  });
  await check('admin can revoke the certificate', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.delete(`/api/v1/admin/certificates/${certId}`).set(csrfHeaders);
    assert.equal(res.status, 200);
  });

  console.log('[rehearsal] admin review moderation');
  await check('admin can approve a pending review', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.patch(`/api/v1/admin/reviews/${reviewId}/moderate`).set(csrfHeaders).send({ status: 'approved' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.review.status, 'approved');
  });

  console.log('[rehearsal] admin manual-payment review + refund (manual gateway, no real API call)');
  await check('admin can approve a manual payment submission', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.patch(`/api/v1/admin/payments/manual/${manualSubmissionId}`).set(csrfHeaders).send({ decision: 'approved' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'approved');
  });
  await check('admin can refund a manual-gateway charge (ledger-only, no gateway call)', async () => {
    const { agent, csrfHeaders } = await adminAgent(superAdmin);
    const res = await agent.post(`/api/v1/admin/payments/${manualChargeId}/refund`).set(csrfHeaders).send({ amountMinor: 1000 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.kind, 'refund');
    assert.equal(res.body.amount_minor, 1000);
  });

  console.log('[rehearsal] parent<->child linking round-trip');
  await check('student gets a share code, parent links, sees the child, then unlinks', async () => {
    const { agent: studentAgent, csrfHeaders: studentHeaders } = await userAgent(student);
    const codeRes = await studentAgent.get('/api/auth/link-code').set('Cookie', studentHeaders.Cookie);
    assert.equal(codeRes.status, 200);
    const code = codeRes.body.code;
    assert.ok(code && code.length > 0);

    const { agent: parentAgent, csrfHeaders: parentHeaders } = await userAgent(parent);
    const linkRes = await parentAgent.post('/api/parent/link').set(parentHeaders).send({ code });
    assert.equal(linkRes.status, 201, JSON.stringify(linkRes.body));
    assert.equal(linkRes.body._id, student);

    const childrenRes = await parentAgent.get('/api/parent/children').set('Cookie', parentHeaders.Cookie);
    assert.equal(childrenRes.status, 200);
    assert.equal(childrenRes.body.length, 1);
    assert.equal(childrenRes.body[0]._id, student);

    const detailRes = await parentAgent.get(`/api/parent/children/${student}`).set('Cookie', parentHeaders.Cookie);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.student.id, student);

    const unlinkRes = await parentAgent.delete(`/api/parent/children/${student}`).set(parentHeaders);
    assert.equal(unlinkRes.status, 200);

    const afterRes = await parentAgent.get(`/api/parent/children/${student}`).set('Cookie', parentHeaders.Cookie);
    assert.equal(afterRes.status, 404);
  });

  await check('a parent cannot link the same code twice', async () => {
    const { agent: studentAgent, csrfHeaders: studentHeaders } = await userAgent(student);
    const codeRes = await studentAgent.get('/api/auth/link-code').set('Cookie', studentHeaders.Cookie);
    const code = codeRes.body.code;
    const { agent: parentAgent, csrfHeaders: parentHeaders } = await userAgent(parent);
    const first = await parentAgent.post('/api/parent/link').set(parentHeaders).send({ code });
    assert.equal(first.status, 201);
    const second = await parentAgent.post('/api/parent/link').set(parentHeaders).send({ code });
    assert.equal(second.status, 409);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[rehearsal] ${results.length - failed.length}/${results.length} Part A checks passed`);
  await pool.end();
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[rehearsal] FATAL:', err.message);
  process.exitCode = 1;
});
