#!/usr/bin/env node
// Stage 2F rehearsal — boots the real Express app with DATA_BACKEND=supabase
// pointed at a local rehearsal Postgres (schema 0000-0015 already applied)
// and exercises the 12 new-domain HTTP adapters via supertest, exactly as
// Stage 2E's rehearsal-api-tests.mjs did for the matched domains.
//
// Auth/GoTrue is deliberately NOT exercised here — same reasoning Stage 2E
// documented (docs/option-a-stage2e-local-rehearsal-report.md, "Scope of
// this rehearsal"): standing up a full local Supabase stack (Kong + GoTrue)
// risks colliding with the separate, unrelated local Supabase stack already
// running on this machine for the Production Cutover Tooling engagement.
// Every request below authenticates with a locally-signed `token` cookie
// (the same JWT_SECRET-based contract utils/authCookie.js's signToken()
// produces), which is exactly what protect() actually verifies — it never
// calls GoTrue for an already-authenticated request. The Admin RBAC/MFA
// flow (data/supabase/adminAuthController.js), which DOES need real GoTrue
// (signInWithPassword + auth.mfa.enroll/challenge/verify), is validated at
// the schema/RLS level only (validate-stage2f-schema.mjs's authorize()/
// is_admin_aal2()/system_config_set() checks) — its end-to-end HTTP flow is
// a real, documented UNKNOWN, not rehearsed here or anywhere in this stage.
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import request from 'supertest';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

function signToken(id, role) {
  return jwt.sign({ id, role, v: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function main() {
  assertLocalHost(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL');
  assert.equal(process.env.DATA_BACKEND, 'supabase', 'DATA_BACKEND must be "supabase" for this script');

  const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });

  const admin = '20000000-0000-4000-8000-000000000001';
  const teacher = '20000000-0000-4000-8000-000000000002';
  const student = '20000000-0000-4000-8000-000000000003';
  const otherStudent = '20000000-0000-4000-8000-000000000004';

  for (const [id, email, role] of [
    [admin, 'rehearsal.admin@test.local', 'admin'],
    [teacher, 'rehearsal.teacher@test.local', 'user'],
    [student, 'rehearsal.student@test.local', 'user'],
    [otherStudent, 'rehearsal.other@test.local', 'user'],
  ]) {
    await pool.query(`INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [id, email]);
    await pool.query(
      `INSERT INTO profiles (id, email, name, role) VALUES ($1,$2,$2,$3) ON CONFLICT (id) DO UPDATE SET role = $3`,
      [id, email, role]
    );
  }
  await pool.query(`UPDATE profiles SET teacher_id = $1 WHERE id = $2`, [teacher, student]);
  const courseRes = await pool.query(
    `INSERT INTO courses (title, description, published, resources, modules)
     VALUES ('Rehearsal Course','d',true,'[{"type":"link","label":"L","url":"https://x/1"}]'::jsonb,'[]'::jsonb)
     RETURNING id`
  );
  const courseId = courseRes.rows[0].id;

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

  async function agentAs(userId) {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/blog');
    const cookie = (csrfRes.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
    const csrfToken = cookie ? cookie.split(';')[0].split('=')[1] : null;
    if (!csrfToken) throw new Error('csrf_token cookie was not issued');
    await agent.get('/api/blog').set('Cookie', `token=${signToken(userId, 'user')}`);
    // supertest's agent persists Set-Cookie automatically; the auth cookie
    // itself must be set on every subsequent request explicitly since it was
    // never issued via a Set-Cookie response (we sign it ourselves).
    return { agent, csrfHeaders: { 'x-csrf-token': csrfToken, Cookie: `token=${signToken(userId, 'user')}` } };
  }

  console.log('[rehearsal] GET /api/courses — public catalogue');
  await check('courses catalogue lists the published rehearsal course, no resources leaked', async () => {
    const res = await request(app).get('/api/courses');
    assert.equal(res.status, 200);
    const found = res.body.find((c) => c._id === courseId);
    assert.ok(found, 'rehearsal course missing from catalogue');
    assert.deepEqual(found.resources, []);
  });

  console.log('[rehearsal] GET /api/courses/:id — locked for a non-subscriber');
  await check('single course is locked (no resource urls) for a user with no active subscription', async () => {
    const { csrfHeaders } = await agentAs(student);
    const res = await request(app).get(`/api/courses/${courseId}`).set('Cookie', csrfHeaders.Cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.locked, true);
  });

  console.log('[rehearsal] wishlist add/list/remove');
  await check('wishlist round-trip', async () => {
    const { agent, csrfHeaders } = await agentAs(student);
    const add = await agent.post('/api/wishlist').set(csrfHeaders).send({ courseId });
    assert.equal(add.status, 200);
    assert.equal(add.body.courses.length, 1);
    const list = await agent.get('/api/wishlist').set('Cookie', csrfHeaders.Cookie);
    assert.equal(list.body.courses.length, 1);
    const remove = await agent.delete(`/api/wishlist/${courseId}`).set(csrfHeaders);
    assert.equal(remove.body.courses.length, 0);
  });

  console.log('[rehearsal] hifz progress mark');
  await check('mark a verse range memorized for surah 1', async () => {
    const { agent, csrfHeaders } = await agentAs(student);
    const res = await agent.put('/api/hifz/1').set(csrfHeaders).send({ chapterName: 'Al-Fatiha', totalVerses: 7, from: 1, to: 7 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.memorizedVerses, [1, 2, 3, 4, 5, 6, 7]);
  });

  console.log('[rehearsal] contact submit + admin read-back');
  await check('guest contact submission is visible to admin', async () => {
    // A genuinely anonymous submitter: the CSRF cookie/header pair must come
    // from the SAME agent's own prior response, not a separate request.
    const anon = request.agent(app);
    const warm = await anon.get('/api/blog');
    const csrfCookie = (warm.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
    const csrfToken = csrfCookie.split(';')[0].split('=')[1];
    const res = await anon.post('/api/contact').set('x-csrf-token', csrfToken).send({
      name: 'Rehearsal Guest', email: 'guest@test.local', subject: 'Hello', message: 'Rehearsal contact message body',
    });
    assert.equal(res.status, 201);

    const { agent: adminAgent, csrfHeaders: adminHeaders } = await agentAs(admin);
    const list = await adminAgent.get('/api/contact').set('Cookie', adminHeaders.Cookie);
    assert.equal(list.status, 200);
    assert.ok(list.body.contacts.some((c) => c.email === 'guest@test.local'));
  });

  console.log('[rehearsal] live_classes: teacher schedules for own student, rejected for a stranger');
  await check('teacher can create a class for their assigned student', async () => {
    const { agent, csrfHeaders } = await agentAs(teacher);
    const res = await agent.post('/api/classes').set(csrfHeaders).send({
      student, title: 'Tajweed 101', startsAt: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.equal(res.status, 201);
  });
  await check('teacher CANNOT create a class for a student not assigned to them', async () => {
    const { agent, csrfHeaders } = await agentAs(teacher);
    const res = await agent.post('/api/classes').set(csrfHeaders).send({
      student: otherStudent, title: 'Hack', startsAt: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.equal(res.status, 404);
  });

  console.log('[rehearsal] messages: student <-> assigned teacher only');
  await check('student can message their assigned teacher', async () => {
    const { agent, csrfHeaders } = await agentAs(student);
    const res = await agent.post('/api/messages').set(csrfHeaders).send({ to: teacher, body: 'Salaam ustadh' });
    assert.equal(res.status, 201);
  });
  await check('student can see their teacher in their contacts list', async () => {
    const { agent, csrfHeaders } = await agentAs(student);
    const res = await agent.get('/api/messages/contacts').set('Cookie', csrfHeaders.Cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.some((c) => c._id === teacher), 'teacher missing from student contacts');
  });
  await check('teacher can see their student in their contacts list', async () => {
    const { agent, csrfHeaders } = await agentAs(teacher);
    const res = await agent.get('/api/messages/contacts').set('Cookie', csrfHeaders.Cookie);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.some((c) => c._id === student), 'student missing from teacher contacts');
  });
  await check('student cannot message an unrelated student', async () => {
    const { agent, csrfHeaders } = await agentAs(student);
    const res = await agent.post('/api/messages').set(csrfHeaders).send({ to: otherStudent, body: 'hi' });
    assert.equal(res.status, 403);
  });

  console.log('[rehearsal] student_records: teacher adds a record for their student');
  await check('teacher records a grade for their own student', async () => {
    const { agent, csrfHeaders } = await agentAs(teacher);
    const res = await agent.post(`/api/teacher/students/${student}/records`).set(csrfHeaders).send({ grade: 95, note: 'Excellent' });
    assert.equal(res.status, 201);
    assert.equal(res.body.grade, 95);
  });

  console.log('[rehearsal] reviews: create + public course listing');
  await check('student review is pending, not visible on public listing until approved', async () => {
    const { agent, csrfHeaders } = await agentAs(student);
    const create = await agent.post('/api/reviews').set(csrfHeaders).send({ rating: 5, body: 'Great course, mashallah', courseId });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    const list = await request(app).get(`/api/reviews/course/${courseId}`);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.reviews.length, 0);
  });

  console.log('[rehearsal] referrals: track a code');
  await check('a referral is tracked against the referrer\'s own code', async () => {
    const { agent: refAgent, csrfHeaders: refHeaders } = await agentAs(student);
    const me = await refAgent.get('/api/referrals/me').set('Cookie', refHeaders.Cookie);
    assert.equal(me.status, 200);
    const code = me.body.code;
    const { agent: trackAgent, csrfHeaders: trackHeaders } = await agentAs(otherStudent);
    const track = await trackAgent.post('/api/referrals/track').set(trackHeaders).send({ code });
    assert.equal(track.status, 201);
    assert.equal(track.body.referee, otherStudent);
  });

  console.log('[rehearsal] certificates: admin listing (empty is fine, proves no 500/501)');
  await check('admin certificate listing responds 200', async () => {
    const { agent, csrfHeaders } = await agentAs(admin);
    const res = await agent.get('/api/certificates').set('Cookie', csrfHeaders.Cookie);
    assert.equal(res.status, 200);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[rehearsal] ${results.length - failed.length}/${results.length} Stage 2F API checks passed`);
  await pool.end();
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[rehearsal] FATAL:', err.message);
  process.exitCode = 1;
});
