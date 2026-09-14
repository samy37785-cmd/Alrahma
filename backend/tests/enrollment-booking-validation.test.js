import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import Enrollment from '../models/Enrollment.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// WhatsApp-required + mass-assignment coverage for POST /api/enrollments
// (controllers/enrollmentController.js), split out of enrollment-booking
// .test.js into its own file/process so its 4 public POSTs get their own
// fresh enrollmentLimiter budget (max 5 / 15 min, shared per test-process —
// see backend/config/rateLimit.js) instead of sharing one with that file's
// own public-POST tests.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

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

test('POST /api/enrollments rejects a request with no WhatsApp number', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const noWhatsapp = { ...BOOKING_PAYLOAD, email: 'no-whatsapp@example.com' };
  delete noWhatsapp.whatsapp;
  const res = await agent.post('/api/enrollments').set(csrf).send(noWhatsapp);
  assert.equal(res.status, 400);
  assert.equal(await Enrollment.countDocuments(), 0);
});

test('POST /api/enrollments rejects a malformed WhatsApp number', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/enrollments').set(csrf).send({ ...BOOKING_PAYLOAD, email: 'bad-whatsapp@example.com', whatsapp: 'not-a-number' });
  assert.equal(res.status, 400);
});

test('POST /api/enrollments normalizes a WhatsApp number (spaces/dashes/parens stripped) before saving', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/enrollments').set(csrf).send({ ...BOOKING_PAYLOAD, email: 'formatted-whatsapp@example.com', whatsapp: '+44 (7700) 900-000' });
  assert.equal(res.status, 201);
  const saved = await Enrollment.findById(res.body.id).lean();
  assert.equal(saved.whatsapp, '+447700900000');
});

test('POST /api/enrollments: mass-assignment fix — a forged status/bookingRef/financial fields in the body are silently ignored, not saved', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/enrollments').set(csrf).send({
    ...BOOKING_PAYLOAD,
    email: 'forged-fields@example.com',
    status: 'paid',
    bookingRef: 'AR-FORGED-0000',
    agreedAmount: 0,
    currency: 'EUR',
    paymentMethodExternal: 'cash',
    adminNote: 'i am the admin now',
  });

  assert.equal(res.status, 201);
  assert.notEqual(res.body.bookingRef, 'AR-FORGED-0000', 'the server-generated bookingRef must win, never the client-supplied one');

  const saved = await Enrollment.findById(res.body.id).lean();
  assert.equal(saved.status, 'pending', 'status must always be forced to pending on public creation');
  assert.equal(saved.agreedAmount, undefined, 'agreedAmount must never be settable from the public endpoint');
  assert.equal(saved.paymentMethodExternal, undefined, 'paymentMethodExternal must never be settable from the public endpoint');
  assert.equal(saved.adminNote, '', 'adminNote must never be settable from the public endpoint');
});
