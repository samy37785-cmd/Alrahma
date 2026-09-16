import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import Enrollment from '../models/Enrollment.js';
import AdminUser from '../models/AdminUser.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Booking-First Enrollment: createEnrollment (POST /api/enrollments, public)
// now generates a unique `bookingRef` returned to the caller so the frontend
// can build the WhatsApp confirmation message without a refetch. Admin
// status/financial-tracking updates reuse the pre-existing, RBAC-protected
// generic CRUD at /api/v1/admin/enrollments (routes/v1/admin/enrollmentsRoutes.js)
// -- no new admin route was added for this feature.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader };
}

const BOOKING_PAYLOAD = {
  name: 'Amina Student',
  email: 'amina-booking@example.com',
  whatsapp: '+44 7700 900000',
  country: 'United Kingdom',
  timezone: 'Europe/London',
  times: ['morning'],
  subjects: ['quran'],
  lang: 'en',
  level: 'beginner',
  plan: 'Huffaz',
};

test('POST /api/enrollments rejects a request missing name/email with 400', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/enrollments').set(csrf).send({ whatsapp: '+44 7700 900000' });
  assert.equal(res.status, 400);
});

test('POST /api/enrollments creates a booking with a unique bookingRef, returned in the response', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/enrollments').set(csrf).send(BOOKING_PAYLOAD);

  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.match(res.body.bookingRef, /^AR-\d{8}-[A-Z0-9]{4}$/);

  const saved = await Enrollment.findById(res.body.id).lean();
  assert.equal(saved.bookingRef, res.body.bookingRef);
  assert.equal(saved.status, 'pending');
});

test('POST /api/enrollments generates a distinct bookingRef for each booking', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const first  = await agent.post('/api/enrollments').set(csrf).send(BOOKING_PAYLOAD);
  const second = await agent.post('/api/enrollments').set(csrf).send({ ...BOOKING_PAYLOAD, email: 'second@example.com' });

  assert.notEqual(first.body.bookingRef, second.body.bookingRef);
});

test('POST /api/enrollments retries bookingRef generation on a simulated unique-constraint collision', async (t) => {
  const realCreate = Enrollment.create.bind(Enrollment);
  let calls = 0;
  t.mock.method(Enrollment, 'create', async (data) => {
    calls += 1;
    if (calls === 1) {
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      err.keyPattern = { bookingRef: 1 };
      throw err;
    }
    return realCreate(data);
  });

  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/enrollments').set(csrf).send(BOOKING_PAYLOAD);

  assert.equal(res.status, 201);
  assert.match(res.body.bookingRef, /^AR-\d{8}-[A-F0-9]{4}$/);
  assert.equal(calls, 2, 'expected exactly one retry after the simulated bookingRef collision');
});

// WhatsApp-required/mass-assignment coverage for the public POST endpoint
// lives in enrollment-booking-validation.test.js, not here — split into its
// own file (its own `node --test` child process, its own fresh
// enrollmentLimiter budget) so this file's + that file's public-POST counts
// each independently stay within enrollmentLimiter's 5-per-15-min window
// instead of sharing one budget across both.

// The remaining tests exercise the admin CRUD endpoint, not the public
// booking-creation endpoint itself (already covered above), so they create
// their fixture directly via the model — same convention as
// admin-v1-payments.test.js's makePendingPayment(). This also avoids
// tripping enrollmentLimiter (max 5 / 15 min, shared across a test file's
// single loopback IP), which is only meant to guard the public endpoint.
async function makeBooking(overrides = {}) {
  return Enrollment.create({ ...BOOKING_PAYLOAD, bookingRef: `AR-TEST-${Date.now()}${Math.random()}`, ...overrides });
}

test('PUT /api/v1/admin/enrollments/:id (existing generic CRUD) updates booking status and adminNote — non-financial only', async () => {
  const booking = await makeBooking();

  const { agent: adminA, csrf: adminCsrf, cookieHeader } = await adminAgent('admin');
  const res = await adminA
    .put(`/api/v1/admin/enrollments/${booking._id}`)
    .set({ ...adminCsrf, Cookie: cookieHeader })
    .send({ status: 'approved', adminNote: 'Confirmed via WhatsApp' });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');
  assert.equal(res.body.adminNote, 'Confirmed via WhatsApp');

  const saved = await Enrollment.findById(booking._id).lean();
  assert.equal(saved.status, 'approved');
  assert.equal(saved.adminNote, 'Confirmed via WhatsApp');
});

// Scope correction (see docs/current-project-status.md): the booking
// endpoint itself never writes a financial field, regardless of what else
// is or isn't cancelled elsewhere. Sending one is not an error (422/403) —
// it is simply never applied, exactly like any other field not in
// ADMIN_UPDATABLE_FIELDS (utils/enrollmentValidation.js).
test('PUT .../:id: legacy financial fields sent in the body are silently ignored — not saved, not returned, no error', async () => {
  const booking = await makeBooking();
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const res = await agent
    .put(`/api/v1/admin/enrollments/${booking._id}`)
    .set({ ...csrf, Cookie: cookieHeader })
    .send({
      status: 'approved',
      agreedAmount: 49,
      currency: 'EUR',
      paymentMethodExternal: 'bank transfer',
      paidAt: new Date().toISOString(),
      renewalAt: new Date().toISOString(),
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.agreedAmount, undefined, 'excludeFields must strip this from the response even if a prior value existed');
  assert.equal(res.body.currency, undefined);
  assert.equal(res.body.paymentMethodExternal, undefined);
  assert.equal(res.body.paidAt, undefined);
  assert.equal(res.body.renewalAt, undefined);

  const saved = await Enrollment.findById(booking._id).lean();
  assert.equal(saved.agreedAmount, undefined, 'the financial field must never have been written');
  assert.equal(saved.currency, undefined);
  assert.equal(saved.paymentMethodExternal, undefined);
  assert.equal(saved.paidAt, undefined);
});

test('PUT /api/v1/admin/enrollments/:id is forbidden for a viewer (no enrollments:write)', async () => {
  const booking = await makeBooking();

  const { agent: viewerA, csrf: viewerCsrf, cookieHeader } = await adminAgent('viewer');
  const res = await viewerA
    .put(`/api/v1/admin/enrollments/${booking._id}`)
    .set({ ...viewerCsrf, Cookie: cookieHeader })
    .send({ status: 'enrolled' });

  assert.equal(res.status, 403);
});

test('GET /api/v1/admin/enrollments lists bookings for an admin', async () => {
  await makeBooking();

  const { agent: adminA, csrf: adminCsrf, cookieHeader } = await adminAgent('admin');
  const res = await adminA.get('/api/v1/admin/enrollments').set({ ...adminCsrf, Cookie: cookieHeader });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.ok(res.body.data[0].bookingRef);
});

// ---------------------------------------------------------------------------
// Admin PUT — allowlist + validation (utils/enrollmentValidation.js),
// replacing crudController's default generic Object.assign(doc, req.body).
// ---------------------------------------------------------------------------

test('PUT .../:id rejects an invalid status value with 422', async () => {
  const booking = await makeBooking();
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'refunded' });
  assert.equal(res.status, 422);
});

// The legacy 'paid'/'awaiting_payment'/'contacted' status values (from an
// earlier offline-payment-bookkeeping design) are no longer accepted on a
// NEW write (see utils/enrollmentValidation.js's ENROLLMENT_STATUSES) —
// only pending/approved/enrolled/cancelled. Historical rows already
// carrying one of the legacy values stay readable (see models/
// Enrollment.js) and, on Postgres, stay valid at the database level too
// (lib/db/drizzle/0030_enrollment_status_reconciliation.sql) — this is
// purely about what a NEW admin write may set.
test('PUT .../:id rejects the retired status value "paid" with 422 — it is no longer a writable status', async () => {
  const booking = await makeBooking();
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'paid' });
  assert.equal(res.status, 422);
});

test('PUT .../:id accepts the canonical non-financial status "approved"', async () => {
  const booking = await makeBooking();
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');
});

test('PUT .../:id allows marking a booking enrolled directly — no financial precondition any more', async () => {
  const booking = await makeBooking();
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'enrolled' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'enrolled');
});

// ---------------------------------------------------------------------------
// Migration-safe handling of pre-existing Mongo data (retired statuses)
// ---------------------------------------------------------------------------

test('migration-safe: a pre-existing document with a retired status ("awaiting_payment") is still readable via GET, unmodified', async () => {
  const booking = await makeBooking({ status: 'awaiting_payment', agreedAmount: 49, currency: 'EUR' });
  const { agent, csrf, cookieHeader } = await adminAgent('admin');

  const res = await agent.get(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'awaiting_payment', 'historical status value must be preserved, not silently migrated');
  assert.equal(res.body.agreedAmount, undefined, 'still excluded from the response even though the underlying document has it');

  const raw = await Enrollment.findById(booking._id).lean();
  assert.equal(raw.status, 'awaiting_payment');
  assert.equal(raw.agreedAmount, 49, 'the historical value in Mongo itself must be untouched');
});

test('migration-safe: an admin can transition a legacy-status document ("contacted") to a canonical status ("approved")', async () => {
  const booking = await makeBooking({ status: 'contacted' });
  const { agent, csrf, cookieHeader } = await adminAgent('admin');

  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');

  const saved = await Enrollment.findById(booking._id).lean();
  assert.equal(saved.status, 'approved');
});

test('migration-safe: GET /api/v1/admin/enrollments list still includes a document carrying a retired status ("paid"), without crashing', async () => {
  await makeBooking({ status: 'paid', agreedAmount: 79 });
  const { agent, csrf, cookieHeader } = await adminAgent('admin');

  const res = await agent.get('/api/v1/admin/enrollments').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].status, 'paid');
  assert.equal(res.body.data[0].agreedAmount, undefined);
});

test('PUT .../:id explicit null clears an optional field (adminNote) rather than leaving it unreachable', async () => {
  const booking = await makeBooking({ adminNote: 'old note' });
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ adminNote: null });
  assert.equal(res.status, 200);

  const saved = await Enrollment.findById(booking._id).lean();
  assert.equal(saved.adminNote, null);
});

test('PUT .../:id omitting a field leaves it untouched (distinct from sending it as null)', async () => {
  const booking = await makeBooking({ adminNote: 'keep me' });
  const { agent, csrf, cookieHeader } = await adminAgent('admin');
  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);

  const saved = await Enrollment.findById(booking._id).lean();
  assert.equal(saved.adminNote, 'keep me');
});

// ---------------------------------------------------------------------------
// This endpoint has no financial-field permission split — enrollments:write
// is the only permission it checks (the old payments:write-on-top-of-
// enrollments:write gate existed only to guard the financial fields this
// endpoint no longer writes at all; that gate was removed along with them).
// ---------------------------------------------------------------------------

test('PUT .../:id: an editor (enrollments:write only) sending a legacy financial field gets 200 with the field silently dropped, not 403', async () => {
  const booking = await makeBooking();
  const { agent, csrf, cookieHeader } = await adminAgent('editor');
  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ agreedAmount: 49 });
  assert.equal(res.status, 200);
  assert.equal(res.body.agreedAmount, undefined);

  const saved = await Enrollment.findById(booking._id).lean();
  assert.equal(saved.agreedAmount, undefined, 'no financial field is ever written, regardless of role');
});

test('PUT .../:id: an editor CAN change non-financial fields like status/notes', async () => {
  const booking = await makeBooking();
  const { agent, csrf, cookieHeader } = await adminAgent('editor');
  const res = await agent.put(`/api/v1/admin/enrollments/${booking._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');
});
