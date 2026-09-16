#!/usr/bin/env node
// Booking-First Enrollment (backend/models/Enrollment.js) added bookingRef
// + admin/financial bookkeeping fields and widened the status enum with
// 'awaiting_payment'/'paid'. This is a pure, no-Docker/no-Mongo/no-Postgres
// unit test of DOMAINS.enrollments.transform()/.validate() (exported from
// ../mongo-to-supabase.mjs for exactly this purpose) proving the lossless
// migration contract actually carries every new field through — the real
// risk this guards against is a silent field drop (a doc with a real
// bookingRef/agreedAmount migrating to a Postgres row with those columns
// NULL) that no generic row-count check would ever catch.
//
// upsert()'s SQL itself (the INSERT/UPDATE column lists) is exercised for
// real, against a real Postgres, by every other migration test file that
// runs a full domain migration — this file only isolates the pure mapping
// function so a mistake here fails fast without needing any disposable
// infrastructure at all.
import assert from 'node:assert/strict';
import { DOMAINS } from '../mongo-to-supabase.mjs';

const { transform, validate } = DOMAINS.enrollments;

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}

const BASE_DOC = {
  name: 'Amina Student',
  email: 'amina@example.com',
  whatsapp: '+447700900000',
  country: 'United Kingdom',
  city: 'London',
  timezone: 'Europe/London',
  times: ['morning'],
  subjects: ['quran'],
  lang: 'en',
  level: 'beginner',
  ageGroup: 'adult',
  genderPref: 'any',
  teacherId: 42,
  teacherName: 'Sheikh Ahmed',
  plan: 'Huffaz',
  notes: 'Prefers evening lessons',
  status: 'pending',
};

test('transform(): every pre-existing status still maps correctly (regression guard) — straight through, no rename, since 0031_enrollment_new_status_to_pending.sql made Postgres canonical "pending" too', () => {
  const map = { pending: 'pending', approved: 'approved', contacted: 'contacted', enrolled: 'enrolled', cancelled: 'cancelled' };
  for (const [mongoStatus, pgStatus] of Object.entries(map)) {
    const row = transform({ ...BASE_DOC, status: mongoStatus });
    assert.equal(row.status, pgStatus, `status "${mongoStatus}" should map to "${pgStatus}"`);
  }
});

test('transform(): the two new Booking-First Enrollment statuses map straight through (no rename — same as every status now)', () => {
  assert.equal(transform({ ...BASE_DOC, status: 'awaiting_payment' }).status, 'awaiting_payment');
  assert.equal(transform({ ...BASE_DOC, status: 'paid' }).status, 'paid');
});

test('transform(): an unmapped/unknown status still throws (fails closed, not silently dropped)', () => {
  assert.throws(() => transform({ ...BASE_DOC, status: 'refunded' }), /unmapped status/);
});

test('transform(): bookingRef and every admin/financial field survive the mapping — THE lossless-contract regression this file exists to catch', () => {
  const doc = {
    ...BASE_DOC,
    status: 'paid',
    bookingRef: 'AR-20260913-K7F2',
    agreedAmount: 49,
    currency: 'EUR',
    paymentMethodExternal: 'bank transfer',
    paidAt: new Date('2026-09-10T12:00:00Z'),
    renewalAt: new Date('2026-10-10T12:00:00Z'),
    adminNote: 'Confirmed via WhatsApp',
  };
  const row = transform(doc);
  assert.equal(row.booking_ref, 'AR-20260913-K7F2');
  assert.equal(row.agreed_amount, 49);
  assert.equal(row.currency, 'EUR');
  assert.equal(row.payment_method_external, 'bank transfer');
  assert.deepEqual(row.paid_at, doc.paidAt);
  assert.deepEqual(row.renewal_at, doc.renewalAt);
  assert.equal(row.admin_note, 'Confirmed via WhatsApp');
});

test('transform(): a pre-Booking-First-Enrollment document (no new fields at all) still transforms cleanly, with the new columns null', () => {
  const row = transform({ ...BASE_DOC });
  assert.equal(row.booking_ref, null);
  assert.equal(row.agreed_amount, null);
  assert.equal(row.currency, null);
  assert.equal(row.payment_method_external, null);
  assert.equal(row.paid_at, null);
  assert.equal(row.renewal_at, null);
  assert.equal(row.admin_note, null);
});

test('transform(): agreedAmount of exactly 0 is preserved, not coerced to null (nullish-coalescing, not ||)', () => {
  const row = transform({ ...BASE_DOC, agreedAmount: 0 });
  assert.equal(row.agreed_amount, 0);
});

test('validate(): still rejects a row missing name/email (unaffected by the new fields)', () => {
  assert.throws(() => validate({ ...transform(BASE_DOC), name: '' }), /missing name\/email/);
  assert.throws(() => validate({ ...transform(BASE_DOC), email: '' }), /missing name\/email/);
});

test('validate(): a fully Booking-First-Enrollment row (new fields populated) passes', () => {
  assert.doesNotThrow(() => validate(transform({ ...BASE_DOC, status: 'paid', bookingRef: 'AR-1', agreedAmount: 10 })));
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
