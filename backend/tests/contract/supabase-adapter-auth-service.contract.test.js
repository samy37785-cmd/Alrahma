// Supabase Readiness Phase 2 — extends the anon/guest-only runtime proof
// (supabase-adapter.contract.test.js) to the two roles it explicitly did
// not cover: `authenticated` (a real logged-in user) and `service_role`
// (a real webhook). Same rehearsal-tool status as that file — excluded
// from `npm test`, run via `npm run test:supabase-auth-service-contract`
// (see scripts/test-supabase-auth-service-contract.mjs, which automates
// the disposable-Postgres setup this file needs).
//
// Every request below goes through the REAL Express app and REAL
// backend code (backend/routes/quranBookmarkRoutes.js,
// backend/data/supabase/quranBookmarkController.js,
// backend/data/supabase/stripeController.js) — nothing here
// reimplements what those files do. The one exception is the "direct
// Postgres RLS check" test, which deliberately bypasses the app's own
// query shape (which always includes `WHERE user_id = $1`) to prove the
// DATABASE itself — not just the app's own query discipline — is what
// stops user B from reading user A's row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import pg from 'pg';
import Stripe from 'stripe';
import { signToken } from '../../utils/authCookie.js';
import { withUserContext, withServiceRole, getPool } from '../../data/supabase/client.js';

let skip;
if (process.env.DATA_BACKEND !== 'supabase') {
  skip = 'requires DATA_BACKEND=supabase — see supabase-adapter.contract.test.js for setup, or run npm run test:supabase-auth-service-contract';
} else {
  const host = new URL(process.env.SUPABASE_DB_URL || '').hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    skip = 'refusing to run: SUPABASE_DB_URL must point at localhost/127.0.0.1';
  }
}

// Every mutating route needs a csrf_token cookie + matching x-csrf-token
// header (see backend/app.js's issueCsrfToken/verifyCsrfToken) ON TOP OF
// the auth cookie — the two are independent middlewares. Fetches the
// CSRF cookie once via an unauthenticated GET, then returns headers that
// combine it with a given user's auth cookie for authenticated,
// CSRF-valid POST/DELETE requests.
async function authHeadersFor(app, authCookieValue) {
  const res = await request(app).get('/api/blog');
  const csrfCookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
  if (!csrfCookie) throw new Error('csrf_token cookie was not issued');
  const csrfToken = csrfCookie.split(';')[0].split('=')[1];
  return {
    Cookie: `${authCookieValue}; ${csrfCookie.split(';')[0]}`,
    'x-csrf-token': csrfToken,
  };
}

async function seedUser(name) {
  const id = crypto.randomUUID();
  const pool = getPool();
  await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [
    id,
    `${id}@example.test`,
    JSON.stringify({ name }),
  ]);
  return id;
}

// -----------------------------------------------------------------
// A) authenticated: user isolation on a real protected route
// (quran_bookmarks) — app-layer AND a direct-Postgres RLS check.
// -----------------------------------------------------------------

test('authenticated: user A can create and read their own bookmark via the real protected route', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const userA = await seedUser('User A');
  const cookie = `token=${signToken(userA, 'user', 0)}`;
  const headers = await authHeadersFor(app, cookie);

  const created = await request(app)
    .post('/api/quran-bookmarks')
    .set(headers)
    .send({ verseKey: '2:255', chapterId: 2, verseNum: 255, note: 'Ayat al-Kursi' });
  assert.equal(created.status, 201);
  assert.equal(created.body.verseKey, '2:255');

  const list = await request(app).get('/api/quran-bookmarks').set('Cookie', cookie);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].verseKey, '2:255');
});

test('authenticated: user B cannot see or delete user A\'s bookmark through the real protected route (app-layer isolation)', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const userA = await seedUser('User A2');
  const userB = await seedUser('User B2');
  const cookieA = `token=${signToken(userA, 'user', 0)}`;
  const cookieB = `token=${signToken(userB, 'user', 0)}`;

  await request(app).post('/api/quran-bookmarks').set(await authHeadersFor(app, cookieA))
    .send({ verseKey: '1:1', chapterId: 1, verseNum: 1 });

  const listAsB = await request(app).get('/api/quran-bookmarks').set('Cookie', cookieB);
  assert.equal(listAsB.status, 200);
  assert.equal(listAsB.body.length, 0, 'user B must never see user A\'s bookmark in their own list');

  const deleteAsB = await request(app).delete('/api/quran-bookmarks/1:1').set(await authHeadersFor(app, cookieB));
  assert.equal(deleteAsB.status, 404, 'user B deleting user A\'s verseKey must find nothing to delete, not succeed');

  const stillThereForA = await request(app).get('/api/quran-bookmarks').set('Cookie', cookieA);
  assert.equal(stillThereForA.body.length, 1, 'user A\'s bookmark must be unaffected by user B\'s attempt');
});

test('authenticated: RLS itself — not just the app\'s own WHERE clause — blocks user B from a direct, unscoped id lookup of user A\'s row', { skip }, async () => {
  const userA = await seedUser('User A3');
  const userB = await seedUser('User B3');

  const bookmarkId = await withUserContext(userA, async (client) => {
    const r = await client.query(
      `INSERT INTO quran_bookmarks (user_id, verse_key, chapter_id, verse_num) VALUES ($1, '18:10', 18, 10) RETURNING id`,
      [userA],
    );
    return r.rows[0].id;
  });

  // Deliberately NOT the app's own `WHERE user_id = $1` shape — a raw,
  // maximally-permissive lookup by primary key only, the shape a bug (or
  // a future PostgREST-style direct client) could plausibly produce.
  const asB = await withUserContext(userB, (client) =>
    client.query(`SELECT * FROM quran_bookmarks WHERE id = $1`, [bookmarkId]),
  );
  assert.equal(asB.rows.length, 0, 'RLS must return zero rows for user B querying user A\'s bookmark by id directly, with no WHERE user_id filter at all');

  const asA = await withUserContext(userA, (client) =>
    client.query(`SELECT * FROM quran_bookmarks WHERE id = $1`, [bookmarkId]),
  );
  assert.equal(asA.rows.length, 1, 'the same unscoped query must still work for the actual owner — RLS is denying by identity, not by query shape');
});

// -----------------------------------------------------------------
// B) service_role: a real webhook path (Stripe), and a direct proof
// that service_role's BYPASSRLS does NOT bypass a function's own
// internal admin-privilege check.
// -----------------------------------------------------------------

test('service_role: the real Stripe webhook handler claims and completes a provider_events row end to end', { skip }, async () => {
  const { default: app } = await import('../../app.js');

  const payload = JSON.stringify({
    id: `evt_test_${crypto.randomUUID()}`,
    type: 'customer.subscription.deleted',
    data: { object: { id: `sub_test_${crypto.randomUUID()}`, customer: 'cus_test_x' } },
  });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });

  const res = await request(app)
    .post('/api/payments/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', header)
    .send(payload);
  assert.equal(res.status, 200);

  const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
  const row = await pool.query(
    `SELECT processing_status, claim_token FROM provider_events WHERE provider = 'stripe' ORDER BY received_at DESC LIMIT 1`,
  );
  await pool.end();
  assert.equal(row.rows.length, 1, 'the webhook must have left a real provider_events row');
  assert.ok(row.rows[0].claim_token, 'claim_provider_event() must have set a real claim_token');
  assert.equal(row.rows[0].processing_status, 'processed', 'the real claim_provider_event()/complete_provider_event() RPCs must have run for real, not been mocked');
});

test('service_role: rejects an invalid Stripe signature the same way it always has (this test\'s own harness proves nothing by accident)', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app)
    .post('/api/payments/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 't=1,v1=deadbeef')
    .send(JSON.stringify({ id: 'evt_bad', type: 'ping' }));
  assert.equal(res.status, 400);
});

test('service_role: BYPASSRLS is not a blanket bypass — it cannot even call an admin-only RPC it was never granted EXECUTE on', { skip }, async () => {
  // Real result, found by actually running this (not assumed): admin_set_
  // admin_role's own migration only ever GRANTs EXECUTE to `authenticated`
  // (see lib/db/drizzle/0013_admin_rbac.sql) — service_role was never
  // granted it at all. That is an even stronger "not a blanket bypass"
  // proof than the function's own internal is_super_admin_aal2() guard
  // would have been: service_role is rejected at the GRANT layer
  // (42501 permission denied) before the function body ever runs, exactly
  // confirming local-harness.mjs's own documented rule — "BYPASSRLS only
  // skips RLS POLICIES, it does NOT imply a table/function-level GRANT".
  const plain = await seedUser('Not An Admin');
  await assert.rejects(
    () => withServiceRole((client) =>
      client.query(`SELECT public.admin_set_admin_role($1, 'admin')`, [plain]),
    ),
    { code: '42501' },
    'service_role must be rejected at the GRANT layer (permission denied) — it was never given EXECUTE on this admin-only RPC, and BYPASSRLS does not change that',
  );

  const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
  const stillPlain = await pool.query(`select role from profiles where id = $1`, [plain]);
  await pool.end();
  assert.equal(stillPlain.rows[0].role, 'user', 'the rejected call must not have silently promoted the user anyway');
});
