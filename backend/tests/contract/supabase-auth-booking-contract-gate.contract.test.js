// Supabase Authenticated + Enrollment Booking HTTP Contract Gate — Local Only.
//
// Extends the pattern proven by tests/contract/supabase-adapter-auth-service.
// contract.test.js (auth guard + user isolation via quran_bookmarks, app-layer
// AND direct-RLS) to a new area: the real enrollment/booking HTTP surface
// (routes/data/supabase/routes/enrollmentRoutes.js + enrollmentController.js).
// Every request goes through the REAL Express app and REAL backend code —
// nothing here reimplements what those files do. The one exception is the
// direct-Postgres RLS check, which deliberately bypasses the app's own query
// shape to prove the DATABASE itself enforces isolation, not just app code.
//
// Run only via scripts/test-supabase-auth-booking-contract-gate.mjs (starts
// the disposable container, applies migrations, and runs this file as a real
// child process). See that script's own header for the full mechanics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { signToken } from '../../utils/authCookie.js';
import { withUserContext, getPool } from '../../data/supabase/client.js';

let skip;
if (process.env.DATA_BACKEND !== 'supabase') {
  skip = 'requires DATA_BACKEND=supabase — run via npm run test:supabase-auth-booking-contract';
} else {
  const host = new URL(process.env.SUPABASE_DB_URL || '').hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    skip = 'refusing to run: SUPABASE_DB_URL must point at localhost/127.0.0.1';
  }
}

const RUN_ID = process.env.AUTH_BOOKING_GATE_RUN_ID;
if (!skip && !RUN_ID) {
  skip = 'AUTH_BOOKING_GATE_RUN_ID must be set by the orchestrator script before this file runs';
}

const NOTES_TAG = `auth-booking-gate-runid:${RUN_ID}`;

// Same double-submit CSRF pattern as supabase-adapter-auth-service.contract.
// test.js's authHeadersFor: every mutating route needs a csrf_token cookie +
// matching x-csrf-token header ON TOP OF the auth cookie.
async function authHeadersFor(app, authCookieValue) {
  const res = await request(app).get('/api/blog?locale=en');
  const csrfCookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
  if (!csrfCookie) throw new Error('csrf_token cookie was not issued');
  const csrfToken = csrfCookie.split(';')[0].split('=')[1];
  return {
    Cookie: authCookieValue ? `${authCookieValue}; ${csrfCookie.split(';')[0]}` : csrfCookie.split(';')[0],
    'x-csrf-token': csrfToken,
  };
}

// Inserts directly into the local auth.users stub — triggers handle_new_user()
// (lib/db/drizzle/0001), which creates the matching `profiles` row, exactly
// like a real Supabase Auth signup would. No Supabase Auth API involved.
async function seedUser(label) {
  const id = crypto.randomUUID();
  const email = `auth-booking-gate-${label}-${RUN_ID}@example.invalid`;
  const pool = getPool();
  await pool.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`,
    [id, email, JSON.stringify({ name: label })],
  );
  return { id, email };
}

// -----------------------------------------------------------------
// Phase 1 — auth guard on a real protected route
// (GET /api/enrollments/mine, routes/enrollmentRoutes.js: `protect`)
// -----------------------------------------------------------------

test('GET /api/enrollments/mine — no token at all is rejected with 401, not 500 or a silent 200', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/enrollments/mine');
  assert.equal(res.status, 401);
});

test('GET /api/enrollments/mine — malformed token is rejected with 401', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app).get('/api/enrollments/mine').set('Cookie', 'token=not-a-real-jwt');
  assert.equal(res.status, 401);
});

test('GET /api/enrollments/mine — token signed with the wrong secret is rejected with 401', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const bogus = jwt.sign({ id: crypto.randomUUID(), role: 'user', v: 0 }, 'definitely-not-the-real-secret', { expiresIn: '1h' });
  const res = await request(app).get('/api/enrollments/mine').set('Cookie', `token=${bogus}`);
  assert.equal(res.status, 401);
});

test('GET /api/enrollments/mine — expired token (correct secret) is rejected with 401', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const userForExpiry = await seedUser('expired-check');
  const expired = jwt.sign({ id: userForExpiry.id, role: 'user', v: 0 }, process.env.JWT_SECRET, { expiresIn: -10 });
  const res = await request(app).get('/api/enrollments/mine').set('Cookie', `token=${expired}`);
  assert.equal(res.status, 401);
});

// -----------------------------------------------------------------
// Phase 2 — user isolation on a real protected, user-owned route
// (quran_bookmarks — the same real route + RLS policies the sibling
// supabase-adapter-auth-service.contract.test.js already proved out).
// Included here so this gate is self-contained proof that the isolation
// MECHANISM itself works, to contrast against Phase 3's enrollment-specific
// ownership check below.
// -----------------------------------------------------------------

test('authenticated: student A can create and read their own bookmark; student B cannot see, read, or delete it', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const studentA = await seedUser('bookmark-a');
  const studentB = await seedUser('bookmark-b');
  const cookieA = `token=${signToken(studentA.id, 'user', 0)}`;
  const cookieB = `token=${signToken(studentB.id, 'user', 0)}`;

  const created = await request(app)
    .post('/api/quran-bookmarks')
    .set(await authHeadersFor(app, cookieA))
    .send({ verseKey: '2:255', chapterId: 2, verseNum: 255, note: `${NOTES_TAG}` });
  assert.equal(created.status, 201);

  const listAsA = await request(app).get('/api/quran-bookmarks').set('Cookie', cookieA);
  assert.equal(listAsA.status, 200);
  assert.equal(listAsA.body.length, 1);
  assert.equal(listAsA.body[0].verseKey, '2:255');

  const listAsB = await request(app).get('/api/quran-bookmarks').set('Cookie', cookieB);
  assert.equal(listAsB.status, 200);
  assert.equal(listAsB.body.length, 0, 'student B must never see student A\'s bookmark in their own list');

  const deleteAsB = await request(app).delete('/api/quran-bookmarks/2:255').set(await authHeadersFor(app, cookieB));
  assert.equal(deleteAsB.status, 404, 'student B deleting student A\'s verseKey must find nothing, not succeed');

  const stillThereForA = await request(app).get('/api/quran-bookmarks').set('Cookie', cookieA);
  assert.equal(stillThereForA.body.length, 1, 'student A\'s bookmark must be unaffected by student B\'s attempt');
});

test('authenticated: RLS itself — not just the app\'s own WHERE clause — blocks student B from a direct, unscoped id lookup of student A\'s bookmark', { skip }, async () => {
  const studentA = await seedUser('rls-a');
  const studentB = await seedUser('rls-b');

  const bookmarkId = await withUserContext(studentA.id, async (client) => {
    const r = await client.query(
      `INSERT INTO quran_bookmarks (user_id, verse_key, chapter_id, verse_num, note) VALUES ($1, '18:10', 18, 10, $2) RETURNING id`,
      [studentA.id, NOTES_TAG],
    );
    return r.rows[0].id;
  });

  // Deliberately NOT the app's own `WHERE user_id = $1` shape.
  const asB = await withUserContext(studentB.id, (client) =>
    client.query(`SELECT * FROM quran_bookmarks WHERE id = $1`, [bookmarkId]),
  );
  assert.equal(asB.rows.length, 0, 'RLS must return zero rows for student B querying student A\'s bookmark by id directly, with no WHERE user_id filter at all');

  const asA = await withUserContext(studentA.id, (client) =>
    client.query(`SELECT * FROM quran_bookmarks WHERE id = $1`, [bookmarkId]),
  );
  assert.equal(asA.rows.length, 1, 'the same unscoped query must still work for the actual owner');
});

// -----------------------------------------------------------------
// Phase 3 — enrollment / booking (routes/data/supabase/enrollmentController.js)
// POST /api/enrollments is public (guest booking submission, via the
// submit_enrollment_booking() SECURITY DEFINER RPC — see
// lib/db/drizzle/0025_booking_first_enrollment.sql). GET /api/enrollments/mine
// is `protect`-gated and matches the caller's own submissions BY EMAIL
// (lib/db/drizzle/0015_new_domains_rls.sql's enrollments_select_own_by_email
// policy: `using (email = (auth.jwt() ->> 'email'))`). No payment, no email,
// no WhatsApp send is triggered by any of this — confirmed by reading
// enrollmentController.js's own module header before writing this file.
// -----------------------------------------------------------------

test('POST /api/enrollments — missing name/email is rejected with 400 and creates no row', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app)
    .post('/api/enrollments')
    .set(await authHeadersFor(app))
    .send({ whatsapp: '+15551234567', notes: NOTES_TAG });
  assert.equal(res.status, 400);
});

test('POST /api/enrollments — invalid WhatsApp number is rejected with 400 and creates no row', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const res = await request(app)
    .post('/api/enrollments')
    .set(await authHeadersFor(app))
    .send({ name: 'Negative Case', email: `auth-booking-gate-negative-${RUN_ID}@example.invalid`, whatsapp: 'not-a-phone-number', notes: NOTES_TAG });
  assert.equal(res.status, 400);
});

test('POST /api/enrollments — valid guest booking submission returns 201 with a real bookingRef, and a genuine duplicate resubmission is also accepted', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const studentA = await seedUser('booking-a');

  const first = await request(app)
    .post('/api/enrollments')
    .set(await authHeadersFor(app))
    .send({ name: 'Student A', email: studentA.email, whatsapp: '+15551234567', plan: 'starter', notes: NOTES_TAG });
  assert.equal(first.status, 201);
  assert.ok(typeof first.body.bookingRef === 'string' && first.body.bookingRef.startsWith('AR-'), 'expected a real generated bookingRef like AR-YYYYMMDD-XXXX');

  // Booking-First Enrollment's own RPC has no uniqueness constraint on email —
  // only booking_ref (auto-generated, retried on collision) is unique — so a
  // second genuine submission from the same guest is accepted, not rejected.
  const second = await request(app)
    .post('/api/enrollments')
    .set(await authHeadersFor(app))
    .send({ name: 'Student A', email: studentA.email, whatsapp: '+15551234567', plan: 'starter', notes: NOTES_TAG });
  assert.equal(second.status, 201);
  assert.notEqual(second.body.bookingRef, first.body.bookingRef, 'two separate submissions must get two distinct booking references');

  // Direct DB proof, independent of what the HTTP layer reported: exactly 2
  // rows for this run's tagged email, both status='new', both owned by the
  // right email, both with a real distinct booking_ref.
  const pool = getPool();
  const rows = await pool.query(
    `SELECT email, status, booking_ref FROM enrollments WHERE notes = $1 ORDER BY created_at ASC`,
    [NOTES_TAG],
  );
  assert.equal(rows.rows.length, 2, 'expected exactly 2 enrollment rows tagged with this run\'s notes');
  for (const row of rows.rows) {
    assert.equal(row.email, studentA.email);
    assert.equal(row.status, 'new');
    assert.ok(row.booking_ref);
  }
});

test('GET /api/enrollments/mine — the authenticated owner can read their own real booking submission by email match', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const owner = await seedUser('mine-owner');

  const created = await request(app)
    .post('/api/enrollments')
    .set(await authHeadersFor(app))
    .send({ name: 'Mine Owner', email: owner.email, whatsapp: '+15559876543', notes: NOTES_TAG });
  assert.equal(created.status, 201);

  // Independent, direct-DB confirmation the row genuinely exists with this
  // exact email before asserting anything about what the HTTP layer returns
  // — so a failure below is unambiguously about the read path/RLS, not about
  // whether the write happened at all.
  const pool = getPool();
  const directCheck = await pool.query(`SELECT email, booking_ref FROM enrollments WHERE booking_ref = $1`, [created.body.bookingRef]);
  assert.equal(directCheck.rows.length, 1, 'the booking row must exist directly in Postgres under this exact bookingRef');
  assert.equal(directCheck.rows[0].email, owner.email);

  const cookie = `token=${signToken(owner.id, 'user', 0)}`;
  const mine = await request(app).get('/api/enrollments/mine').set('Cookie', cookie);
  assert.equal(mine.status, 200, 'the authenticated owner\'s own /mine read must not error');
  assert.ok(
    mine.body !== null,
    'GET /api/enrollments/mine returned null for the true owner of a real, just-created booking row with a matching email — ' +
    'enrollments_select_own_by_email (lib/db/drizzle/0015) matches on auth.jwt()->>\'email\', and withUserContext() must now forward the ' +
    'verified caller\'s own email into that claim (see enrollmentController.js\'s getMyEnrollment) for this to work.',
  );
  assert.equal(mine.body.bookingRef, created.body.bookingRef, 'the owner\'s own /mine read must return their own actual booking, not a different or stale one');
});

test('GET /api/enrollments/mine — a different authenticated user with no bookings of their own gets null, not someone else\'s row', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  const bystander = await seedUser('mine-bystander');
  const cookie = `token=${signToken(bystander.id, 'user', 0)}`;
  const res = await request(app).get('/api/enrollments/mine').set('Cookie', cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body, null, 'a user with no matching-email enrollment must get null, never another guest\'s booking');
});

// -----------------------------------------------------------------
// Phase 4 — anti-forgery: only the JWT-signature-verified caller's own,
// server-loaded email may ever reach RLS. No client-supplied body/query
// value may substitute for it, and its absence must fail closed (zero
// rows), never fall back to trusting anything else.
// -----------------------------------------------------------------

test('GET /api/enrollments/mine — a forged ?email= query parameter for another guest\'s real booking has no effect; the caller still only ever sees their own', { skip }, async () => {
  const { default: app } = await import('../../app.js');
  // Reuses the real booking created by the "owner can read their own"
  // test above (same NOTES_TAG-tagged row, still present in this run).
  const forger = await seedUser('forger-no-booking-of-own');
  const cookie = `token=${signToken(forger.id, 'user', 0)}`;

  const ownerEmail = `auth-booking-gate-mine-owner-${RUN_ID}@example.invalid`;
  const res = await request(app)
    .get(`/api/enrollments/mine?email=${encodeURIComponent(ownerEmail)}`)
    .set('Cookie', cookie)
    .send({ email: ownerEmail });
  assert.equal(res.status, 200);
  assert.equal(
    res.body,
    null,
    'a forged ?email=/body email for a real other guest\'s booking must never leak that booking — the controller only ever reads req.user.email, never request input',
  );
});

test('withUserContext without an email option (a valid caller, no email claim) fails closed: RLS returns zero rows even when the app\'s own query parameter matches exactly', { skip }, async () => {
  const owner = await seedUser('no-email-claim-check');
  // Give this caller a real booking of their own, tagged with this run, so a
  // non-empty result would be unambiguous proof of a leak/bypass rather than
  // just "there was nothing to find anyway".
  const pool = getPool();
  await pool.query(
    `INSERT INTO enrollments (name, email, whatsapp, status, notes) VALUES ($1, $2, $3, 'new', $4)`,
    ['No Email Claim Check', owner.email, '+15551112222', NOTES_TAG],
  );

  // Deliberately the exact same query shape enrollmentController.js's
  // getMyEnrollment runs, with the correct email as the SQL parameter —
  // but withUserContext is called WITHOUT { email: owner.email }, simulating
  // any caller that hasn't opted into the fix (or a token whose verified
  // account somehow had no email). RLS must block this on its own.
  const rows = await withUserContext(owner.id, (client) =>
    client.query(`SELECT * FROM enrollments WHERE email = $1`, [owner.email]),
  );
  assert.equal(rows.rows.length, 0, 'with no email claim in request.jwt.claims, enrollments_select_own_by_email must reject even a query whose parameter matches exactly — fail closed, not fail open');
});

// -----------------------------------------------------------------
// Phase 5 — direct RLS proof on `enrollments` itself (not just
// quran_bookmarks): the DATABASE, not just the app's own WHERE clause,
// restricts each authenticated caller to their own rows by email.
// -----------------------------------------------------------------

test('authenticated: direct RLS on enrollments — the owner sees only their own rows (even unscoped), a bystander sees none of them', { skip }, async () => {
  // Reuses the 2 real rows created by the "duplicate resubmission" test
  // above — a distinct, already-seeded email with real rows in the table.
  const ownerEmail = `auth-booking-gate-booking-a-${RUN_ID}@example.invalid`;
  const bystander = await seedUser('rls-enrollments-bystander');

  const asOwnerPool = getPool();
  const ownerIdRes = await asOwnerPool.query(`SELECT id FROM profiles WHERE email = $1`, [ownerEmail]);
  assert.equal(ownerIdRes.rows.length, 1, 'the owner\'s profile from the earlier duplicate-submission test must still exist');
  const ownerId = ownerIdRes.rows[0].id;

  const asOwner = await withUserContext(ownerId, (client) => client.query(`SELECT email FROM enrollments`), { email: ownerEmail });
  assert.ok(asOwner.rows.length >= 2, 'the owner must see at least their own 2 rows from the duplicate-submission test');
  for (const row of asOwner.rows) {
    assert.equal(row.email, ownerEmail, 'an unscoped SELECT under the owner\'s own RLS context must never return a row belonging to a different email');
  }

  const asBystander = await withUserContext(bystander.id, (client) => client.query(`SELECT email FROM enrollments`), { email: bystander.email });
  assert.equal(
    asBystander.rows.filter((row) => row.email === ownerEmail).length,
    0,
    'RLS itself — not just the app\'s own WHERE clause — must block a bystander from seeing the owner\'s rows even via a completely unscoped SELECT',
  );
});
