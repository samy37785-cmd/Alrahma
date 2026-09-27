// Stage 2E contract test suite — NOT part of the default `npm test` sweep
// (that suite always runs with DATA_BACKEND unset/mongodb, matching what's
// actually deployed). This file proves the Supabase adapter's HTTP contract
// for the matched, guest/public domains matches the Mongo controllers it
// mirrors (see docs/option-a-mongo-supabase-parity-map.md) — same routes,
// same status codes, same response shapes — by running the same requests a
// real client would make against the real Express app wired to
// DATA_BACKEND=supabase.
//
// EASIEST WAY TO RUN THIS FILE — one command, no manual setup:
//
//   cd backend && npm run test:supabase-contract
//
// scripts/test-supabase-contract.mjs does everything below for you: spins
// up a brand-new disposable local Postgres container, applies every
// lib/db/drizzle migration, seeds the exact fixture rows this file's own
// assertions expect, runs this file unmodified against a really-booted
// Express app, independently double-checks the two write paths directly
// against Postgres, and always tears the container down (verified) no
// matter the outcome. Requires only a running local Docker daemon.
//
// Manual setup (what that script automates, kept here for anyone who
// wants to drive it by hand or against a different local Postgres):
//   1. A local Postgres with the lib/db schema applied:
//        cd lib/db && TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5434/postgres \
//          node test/run-migrations.mjs
//   2. Fixture data migrated in:
//        cd backend && MIGRATION_MONGO_URI=mongodb://127.0.0.1:27018/al-rahma-rehearsal \
//          node scripts/migration/seed-mongo-fixture.mjs
//        cd backend && MIGRATION_MONGO_URI=... MIGRATION_DB_URL=postgresql://postgres:postgres@127.0.0.1:5434/postgres \
//          node scripts/migration/mongo-to-supabase.mjs --domain=all
//   3. Run with:
//        DATA_BACKEND=supabase SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:5434/postgres \
//        SUPABASE_URL=http://127.0.0.1:0 SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy \
//        MONGO_URI=mongodb://127.0.0.1:1/unused JWT_SECRET=test-secret NODE_ENV=test \
//        node --test tests/contract/supabase-adapter.contract.test.js
//
// This file is still deliberately excluded from the default `npm run test`
// sweep (that suite always runs with DATA_BACKEND unset/mongodb, matching
// what's actually deployed) — `npm run test:supabase-contract` is a
// separate, explicit command, not part of the standard pre-deploy gate.
//
// See ./last-verified-run.md for the first real, end-to-end run of this
// exact file against a disposable local Postgres + a real booted Express
// app (not mocks) — what was proven, what wasn't (anon/guest paths only,
// not yet authenticated/service-role), and the direct DB proof the writes
// were real rows, not stubbed responses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// This file matches the default `tests/**/*.test.js` glob (package.json's
// `npm test`), which normally runs with DATA_BACKEND unset — every test
// below is registered with `skip` in that case so the standard suite reports
// them as SKIPPED (not failed) and the 314-test Mongo-path baseline stays
// green. Only when a developer deliberately sets DATA_BACKEND=supabase (and
// points SUPABASE_DB_URL at a local Postgres) do these actually run.
let skip;
if (process.env.DATA_BACKEND !== 'supabase') {
  skip = 'requires DATA_BACKEND=supabase — see this file\'s header for setup instructions';
} else {
  const host = new URL(process.env.SUPABASE_DB_URL || '').hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    skip = 'refusing to run: SUPABASE_DB_URL must point at localhost/127.0.0.1';
  }
}

async function agentWithCsrf(app) {
  const agent = request.agent(app);
  const res = await agent.get('/api/blog');
  const cookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
  if (!cookie) throw new Error('csrf_token cookie was not issued');
  return { agent, csrfHeaders: { 'x-csrf-token': cookie.split(';')[0].split('=')[1] } };
}

test('GET /api/blog — matches the Mongo contract: { posts, total, page, pages }, published-only', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  // Blog SEO Foundation PR A: locale is now a required query parameter on
  // both backends — see the two new tests just below for that contract's
  // own coverage.
  const res = await request(app).get('/api/blog?locale=en');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.posts));
  assert.equal(typeof res.body.total, 'number');
  assert.equal(typeof res.body.page, 'number');
  assert.equal(typeof res.body.pages, 'number');
  for (const post of res.body.posts) {
    assert.notEqual(post.slug, 'fixture-post-draft-not-published', 'an unpublished post leaked into the public list');
  }
});

test('GET /api/blog/:slug — matches the Mongo contract: { post: {...} }, 404 shape for missing/unpublished', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const missing = await request(app).get('/api/blog/does-not-exist-slug?locale=en');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, 'Post not found');
});

test('GET /api/blog and /:slug — both require an explicit ?locale=en|ar, matching the Mongo contract\'s 400 shape', { skip }, async () => {
  const { default: app } = await import('../../app.js');

  const listMissing = await request(app).get('/api/blog');
  assert.equal(listMissing.status, 400);
  const listInvalid = await request(app).get('/api/blog?locale=fr');
  assert.equal(listInvalid.status, 400);

  const postMissing = await request(app).get('/api/blog/does-not-exist-slug');
  assert.equal(postMissing.status, 400);
  const postInvalid = await request(app).get('/api/blog/does-not-exist-slug?locale=fr');
  assert.equal(postInvalid.status, 400);
});

test('POST /api/newsletter — matches the Mongo contract: always 200, idempotent on repeat', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const { agent, csrfHeaders } = await agentWithCsrf(app);
  const email = `contract-test-${Date.now()}@example.test`;
  const first = await agent.post('/api/newsletter').set(csrfHeaders).send({ email });
  assert.equal(first.status, 200);
  const second = await agent.post('/api/newsletter').set(csrfHeaders).send({ email });
  assert.equal(second.status, 200); // must not 500 on the resulting unique-constraint hit
});

test('POST /api/trials — matches the Mongo contract: 201 on a valid guest submission', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const { agent, csrfHeaders } = await agentWithCsrf(app);
  const res = await agent.post('/api/trials').set(csrfHeaders).send({
    name: 'Contract Test Visitor',
    email: `contract-test-${Date.now()}@example.test`,
    course: 'Quran',
    message: 'contract test',
  });
  assert.equal(res.status, 201);
});
