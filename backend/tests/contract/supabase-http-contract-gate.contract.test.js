// Supabase HTTP Contract Gate — extends tests/contract/supabase-adapter.contract.test.js's
// proven pattern (see that file's header) to a wider slice of the guest/public
// HTTP surface, run against a real booted Express app + a real disposable local
// Postgres. This file never touches the real Supabase project — see this
// file's own `skip` guard below, identical in spirit to the existing contract
// test's guard, and see scripts/test-supabase-http-contract-gate.mjs, which is
// the only supported way to run this file (it starts the disposable container,
// applies migrations, seeds fixtures, and only then runs this file as a real
// child process).
//
// Run: cd backend && npm run test:supabase-http-contract
//
// Scope: guest/public routes only — no admin, no payment, no invoice, no
// booking/enrollment, no messages. See PHASE B's negative-authorization test
// for the one exception: proving a *protected* route correctly rejects a
// guest with 401, without ever attempting to log in or create a user.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

let skip;
if (process.env.DATA_BACKEND !== 'supabase') {
  skip = 'requires DATA_BACKEND=supabase — run via npm run test:supabase-http-contract';
} else {
  const host = new URL(process.env.SUPABASE_DB_URL || '').hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    skip = 'refusing to run: SUPABASE_DB_URL must point at localhost/127.0.0.1';
  }
}

// The exact fixture values scripts/test-supabase-http-contract-gate.mjs seeds
// before this file runs — kept here (not re-derived) so a mismatch between
// what was seeded and what this file expects fails loudly as an assertion,
// not silently as a false pass.
const LOCALE_FIXTURE_SLUG = 'locale-matrix-post';
const LOCALE_FIXTURE_EN_TITLE = 'HTTP Contract Gate — EN fixture';
const LOCALE_FIXTURE_AR_TITLE = 'بوابة عقد HTTP — محتوى عربي';
const COURSE_FIXTURE_TITLE = 'HTTP Contract Gate — fixture course';

async function agentWithCsrf(app) {
  const agent = request.agent(app);
  const res = await agent.get('/api/blog?locale=en');
  const cookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
  if (!cookie) throw new Error('csrf_token cookie was not issued');
  return { agent, csrfHeaders: { 'x-csrf-token': cookie.split(';')[0].split('=')[1] } };
}

// ── Phase B.1 — public reads ──────────────────────────────────────────────

test('GET /api/courses — public catalogue read returns the seeded course', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/courses');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  const found = res.body.find((c) => c.title === COURSE_FIXTURE_TITLE);
  assert.ok(found, 'seeded fixture course was not returned by GET /api/courses');
  assert.equal(found.published, true);
});

test('GET /api/search/teachers — public teacher directory read responds with the documented shape', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/search/teachers');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.teachers));
  assert.equal(typeof res.body.total, 'number');
  assert.equal(typeof res.body.page, 'number');
  assert.equal(typeof res.body.pages, 'number');
});

test('GET /api/reviews/teacher/:teacherId — public review read responds with the documented shape', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const randomTeacherId = '00000000-0000-4000-8000-000000000000';
  const res = await request(app).get(`/api/reviews/teacher/${randomTeacherId}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.reviews));
  assert.equal(typeof res.body.avg, 'number');
  assert.equal(typeof res.body.count, 'number');
});

// ── Phase B.4 — blog locale contract (critical) ─────────────────────────────
// Two published rows share the same slug, one per locale (seeded by
// scripts/test-supabase-http-contract-gate.mjs). If ?locale= is ignored by
// the controller, both locale reads would return the same row — the
// assertions below catch that directly, by content, not just by status code.

test('GET /api/blog/:slug?locale=en — returns the EN row for the shared slug', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get(`/api/blog/${LOCALE_FIXTURE_SLUG}?locale=en`);
  assert.equal(res.status, 200);
  assert.equal(res.body.post.locale, 'en');
  assert.equal(res.body.post.title, LOCALE_FIXTURE_EN_TITLE);
});

test('GET /api/blog/:slug?locale=ar — returns the AR row for the SAME shared slug, not the EN one', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get(`/api/blog/${LOCALE_FIXTURE_SLUG}?locale=ar`);
  assert.equal(res.status, 200);
  assert.equal(res.body.post.locale, 'ar');
  assert.equal(res.body.post.title, LOCALE_FIXTURE_AR_TITLE);
  assert.notEqual(res.body.post.title, LOCALE_FIXTURE_EN_TITLE, 'BLOG_LOCALE_CONTRACT_BROKEN: ?locale=ar returned the EN row');
});

test('GET /api/blog?locale=en — list only contains the EN row for the shared slug', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/blog?locale=en');
  assert.equal(res.status, 200);
  const matches = res.body.posts.filter((p) => p.slug === LOCALE_FIXTURE_SLUG);
  assert.equal(matches.length, 1, `BLOG_LOCALE_CONTRACT_BROKEN: expected exactly 1 EN-locale row for slug "${LOCALE_FIXTURE_SLUG}" in the EN list, got ${matches.length}`);
  assert.equal(matches[0].locale, 'en');
});

test('GET /api/blog?locale=ar — list only contains the AR row for the shared slug', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/blog?locale=ar');
  assert.equal(res.status, 200);
  const matches = res.body.posts.filter((p) => p.slug === LOCALE_FIXTURE_SLUG);
  assert.equal(matches.length, 1, `BLOG_LOCALE_CONTRACT_BROKEN: expected exactly 1 AR-locale row for slug "${LOCALE_FIXTURE_SLUG}" in the AR list, got ${matches.length}`);
  assert.equal(matches[0].locale, 'ar');
});

test('GET /api/blog — missing ?locale= is rejected per the current contract (400)', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/blog');
  assert.equal(res.status, 400, `BLOG_LOCALE_CONTRACT_BROKEN: missing ?locale= returned ${res.status}, expected 400`);
});

test('GET /api/blog?locale=fr — unsupported locale is rejected per the current contract (400)', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/blog?locale=fr');
  assert.equal(res.status, 400, `BLOG_LOCALE_CONTRACT_BROKEN: unsupported ?locale=fr returned ${res.status}, expected 400`);
});

// ── Phase B.2 — guest-safe writes (run-id tagged) ───────────────────────────

// Only required once we're actually going to run (skip is falsy) — checking
// this unconditionally at module scope would throw on import under the plain
// `npm test` sweep (DATA_BACKEND unset), before any test's own `skip` option
// gets a chance to apply, crashing the whole file instead of skipping it.
const RUN_ID = process.env.HTTP_CONTRACT_GATE_RUN_ID;
if (!skip && !RUN_ID) {
  skip = 'HTTP_CONTRACT_GATE_RUN_ID must be set by the orchestrator script before this file runs';
}
const RUN_EMAIL = RUN_ID ? `supabase-http-contract-${RUN_ID}@example.invalid` : undefined;

test('POST /api/newsletter — guest-safe write, always 200', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const { agent, csrfHeaders } = await agentWithCsrf(app);
  const res = await agent.post('/api/newsletter').set(csrfHeaders).send({ email: RUN_EMAIL });
  assert.equal(res.status, 200);
});

test('POST /api/trials — guest-safe write, 201 on valid submission', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const { agent, csrfHeaders } = await agentWithCsrf(app);
  const res = await agent.post('/api/trials').set(csrfHeaders).send({
    name: `HTTP Contract Gate ${RUN_ID}`,
    email: RUN_EMAIL,
    message: `http-contract-gate-runid:${RUN_ID}`,
  });
  assert.equal(res.status, 201);
});

// ── Phase B.3 — negative authorization (guest hits a protected route) ──────

test('GET /api/wishlist — guest with no token is rejected with 401, not a 500 or a silent 200', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/wishlist');
  assert.equal(res.status, 401);
});
