#!/usr/bin/env node
// DATES_DECISION=PRESERVE_EXACTLY -- pure/unit tests for lib/source-
// dates.mjs, plus the per-domain date mapping of mongo-to-supabase.mjs's
// DOMAINS transforms (called directly as functions, no Docker). The
// end-to-end proof against a real database is lossless-import.test.mjs.
import assert from 'node:assert/strict';
import {
  sourceDate, sourceTimestamps, requiredSourceDate, optionalSourceDate, accountForSourceDates, restoreSourceTimestamps,
} from './source-dates.mjs';
import { plannedId } from './planned-ids.mjs';
import { DOMAINS } from '../mongo-to-supabase.mjs';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}

const CREATED = new Date('2026-06-14T10:11:12.345Z');
const UPDATED = new Date('2026-06-15T01:02:03.456Z');

await test('sourceDate: a BSON Date is returned as an equal, separate Date; absent is null', () => {
  const doc = { createdAt: CREATED };
  const value = sourceDate(doc, 'createdAt');
  assert.equal(value.getTime(), CREATED.getTime());
  assert.notEqual(value, CREATED, 'a copy, so later mutation of the row never reaches the source document');
  assert.equal(sourceDate(doc, 'updatedAt'), null);
  assert.equal(sourceDate({ updatedAt: null }, 'updatedAt'), null);
});

await test('sourceDate: a present but invalid or non-Date value fails closed, naming the field only', () => {
  assert.throws(() => sourceDate({ createdAt: new Date('nope') }, 'createdAt'), /createdAt holds an invalid date/);
  assert.throws(() => sourceDate({ createdAt: '2026-06-14' }, 'createdAt'), /createdAt is not a BSON date \(found string\)/);
  assert.throws(() => sourceDate({ createdAt: 1781425872345 }, 'createdAt'), /not a BSON date \(found number\)/);
});

await test('sourceTimestamps: both present -> both preserved exactly, nothing generated', () => {
  const stats = {};
  const ts = sourceTimestamps({ createdAt: CREATED, updatedAt: UPDATED }, { createdAt: 'created_at', updatedAt: 'updated_at' }, stats);
  assert.equal(ts.fields.created_at.toISOString(), CREATED.toISOString());
  assert.equal(ts.fields.updated_at.toISOString(), UPDATED.toISOString());
  assert.deepEqual(ts.generated, []);
  assert.deepEqual(stats, { preserved: { created_at: 1, updated_at: 1 } });
});

await test('sourceTimestamps: createdAt without updatedAt -> updated_at := createdAt (derived, deterministic, not generated)', () => {
  const stats = {};
  const ts = sourceTimestamps({ createdAt: CREATED }, { createdAt: 'created_at', updatedAt: 'updated_at' }, stats);
  assert.equal(ts.fields.updated_at.toISOString(), CREATED.toISOString());
  assert.deepEqual(ts.generated, [], 'a value derived from the same document is compared exactly, never exempted');
  assert.deepEqual(stats, { preserved: { created_at: 1 }, derivedFromCreatedAt: { updated_at: 1 } });
});

await test('sourceTimestamps: no source dates at all -> migration time, listed as generated and counted', () => {
  const stats = {};
  const before = Date.now();
  const ts = sourceTimestamps({}, { createdAt: 'created_at', updatedAt: 'updated_at' }, stats);
  assert.ok(ts.fields.created_at.getTime() >= before);
  assert.deepEqual(ts.generated.sort(), ['created_at', 'updated_at']);
  assert.deepEqual(stats, { generated: { created_at: 1, updated_at: 1 } });
});

await test('sourceTimestamps: a column the table lacks (null) is never produced', () => {
  const ts = sourceTimestamps({ createdAt: CREATED, updatedAt: UPDATED }, { createdAt: null, updatedAt: 'updated_at' });
  assert.deepEqual(Object.keys(ts.fields), ['updated_at']);
});

await test('requiredSourceDate / optionalSourceDate: source value wins; only a required column gets a generated fallback', () => {
  const stats = {};
  assert.deepEqual(requiredSourceDate({ issuedAt: CREATED }, 'issuedAt', 'issued_at', stats), { value: CREATED, generated: false });
  const fallback = requiredSourceDate({}, 'issuedAt', 'issued_at', stats);
  assert.equal(fallback.generated, true);
  assert.equal(optionalSourceDate({}, 'paidAt', 'paid_at', stats), null, 'a nullable column stays null, never invented');
  assert.equal(optionalSourceDate({ paidAt: UPDATED }, 'paidAt', 'paid_at', stats).toISOString(), UPDATED.toISOString());
  assert.deepEqual(stats, { preserved: { issued_at: 1, paid_at: 1 }, generated: { issued_at: 1 } });
});

await test('accountForSourceDates: mapped passes, declared loss is counted, an undeclared Date fails the document', () => {
  const stats = {};
  accountForSourceDates({ createdAt: CREATED, updatedAt: UPDATED, name: 'x' }, { mapped: ['createdAt'], unpreserved: ['updatedAt'] }, stats);
  assert.deepEqual(stats, { unpreserved: { updatedAt: 1 } });
  assert.throws(
    () => accountForSourceDates({ createdAt: CREATED, archivedAt: UPDATED }, { mapped: ['createdAt'] }, {}),
    /source date field "archivedAt" has no declared destination/
  );
});

function fakeClient({ rowCount = 1, failOn } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (failOn && sql.includes(failOn)) throw new Error(`fake failure on ${failOn}`);
      if (sql.startsWith('UPDATE')) return { rowCount };
      return { rowCount: 0, rows: [] };
    },
  };
}

await test('restoreSourceTimestamps: inside the caller transaction -> replica for exactly one timestamp-only UPDATE, then origin', async () => {
  const client = fakeClient();
  await restoreSourceTimestamps(client, { table: 'courses', id: 'c1', values: { created_at: CREATED, updated_at: UPDATED }, inTransaction: true });
  assert.deepEqual(client.queries.map((q) => q.sql), [
    'SET LOCAL session_replication_role = replica',
    'UPDATE courses SET created_at = $2, updated_at = $3 WHERE id = $1',
    'SET LOCAL session_replication_role = origin',
  ]);
  assert.deepEqual(client.queries[1].params, ['c1', CREATED, UPDATED]);
});

await test('restoreSourceTimestamps: without a caller transaction it opens and commits its own (SET LOCAL needs one)', async () => {
  const client = fakeClient();
  await restoreSourceTimestamps(client, { table: 'profiles', id: 'p1', values: { updated_at: UPDATED }, inTransaction: false });
  assert.equal(client.queries[0].sql, 'BEGIN');
  assert.equal(client.queries.at(-1).sql, 'COMMIT');
});

await test('restoreSourceTimestamps: not exactly one row -> throws and rolls its own transaction back', async () => {
  const client = fakeClient({ rowCount: 0 });
  await assert.rejects(
    restoreSourceTimestamps(client, { table: 'profiles', id: 'gone', values: { updated_at: UPDATED }, inTransaction: false }),
    /affected 0 row\(s\), expected exactly 1/
  );
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
});

await test('restoreSourceTimestamps: a role that may not set session_replication_role fails loudly, not silently', async () => {
  const client = fakeClient({ failOn: 'replica' });
  await assert.rejects(
    restoreSourceTimestamps(client, { table: 'payments', id: 'x', values: { updated_at: UPDATED }, inTransaction: false }),
    /fake failure on replica/
  );
});

await test('restoreSourceTimestamps: refuses any non-timestamp column or unsafe identifier', async () => {
  const client = fakeClient();
  await assert.rejects(restoreSourceTimestamps(client, { table: 'payments', id: 'x', values: { status: 'succeeded' }, inTransaction: true }), /non-timestamp column status/);
  await assert.rejects(restoreSourceTimestamps(client, { table: 'payments; drop', id: 'x', values: { updated_at: UPDATED }, inTransaction: true }), /invalid table/);
  assert.equal(client.queries.length, 0, 'nothing is sent for a refused call');
  await restoreSourceTimestamps(client, { table: 'payments', id: 'x', values: {}, inTransaction: true });
  assert.equal(client.queries.length, 0, 'no source timestamps -> no statement at all');
});

// --- the domain transforms themselves (DOMAINS, mongo-to-supabase.mjs) ---

const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
function planCtx() {
  // Plan-mode context: no profile exists, the source user does, so the
  // reference resolves to its deterministic planned id.
  return {
    dryRun: true,
    dateStats: {},
    userEmailMap: new Map([[userId, 'learner@example.invalid']]),
    pgClient: { async query() { return { rows: [] }; } },
    resolvePlanSlug: (name) => (String(name).toLowerCase() === 'starter' ? 'Starter' : null),
    planSlugToId: new Map([['Starter', plannedId('plans', 'Starter')]]),
  };
}

await test('payments transform: a paymob pending payment keeps status, amount, gateway, dates and the whole source document', async () => {
  const doc = {
    _id: 'p1', plan: 'Starter', amount: 56, currency: 'EUR', gateway: 'paymob', method: 'card', status: 'pending',
    userId, gatewayOrderId: 'ord-1', customer: { name: 'N', email: 'learner@example.invalid', phone: '1' },
    createdAt: CREATED, updatedAt: UPDATED, __v: 0,
  };
  const ctx = planCtx();
  const row = await DOMAINS.payments.transform(doc, ctx);
  assert.equal(row.gateway, 'paymob');
  assert.equal(row.status, 'pending', 'never promoted to succeeded/failed');
  assert.equal(row.amount_minor, 5600);
  assert.equal(row.plan_id, plannedId('plans', 'Starter'));
  assert.equal(row.user_id, plannedId('users', userId), 'plan mode links the planned account, never null');
  assert.equal(row.created_at.toISOString(), CREATED.toISOString());
  assert.equal(row.updated_at.toISOString(), UPDATED.toISOString());
  assert.deepEqual(row.__generatedFields, []);
  assert.equal(row._raw.method, 'card', 'a field payments has no column for survives in the raw snapshot');
  assert.deepEqual(row._raw.createdAt, { $date: CREATED.toISOString() });
  assert.deepEqual(ctx.dateStats, { preserved: { created_at: 1, updated_at: 1 } });
});

await test('payments transform: a userId that is not in the source fails the document (no silent guest payment)', async () => {
  const doc = { _id: 'p2', amount: 56, currency: 'EUR', gateway: 'paymob', status: 'pending', userId: 'bbbbbbbbbbbbbbbbbbbbbbbb' };
  await assert.rejects(DOMAINS.payments.transform(doc, planCtx()), /referenced user bbbbbbbbbbbbbbbbbbbbbbbb does not exist in the source users collection/);
});

await test('payments transform: error messages carry no amount, plan name or email', async () => {
  const bad = { _id: 'p3', amount: 56.123, currency: 'EUR', gateway: 'paymob', status: 'pending' };
  await assert.rejects(DOMAINS.payments.transform(bad, planCtx()), (err) => !/56/.test(err.message) && /minor units/.test(err.message));
  const badPlan = { _id: 'p4', amount: 56, currency: 'EUR', gateway: 'paymob', status: 'pending', plan: 'Secret Plan' };
  await assert.rejects(DOMAINS.payments.transform(badPlan, planCtx()), (err) => !/Secret Plan/.test(err.message));
});

await test('enrollments/trial_requests/subscribers/courses/quran_bookmarks transforms carry the source createdAt (and updatedAt where the table has it)', async () => {
  const ctx = planCtx();
  const enrollment = DOMAINS.enrollments.transform({ name: 'n', email: 'e@example.invalid', status: 'pending', createdAt: CREATED, updatedAt: UPDATED, paidAt: UPDATED }, ctx);
  assert.equal(enrollment.created_at.toISOString(), CREATED.toISOString());
  assert.equal(enrollment.updated_at.toISOString(), UPDATED.toISOString());
  assert.equal(enrollment.paid_at.toISOString(), UPDATED.toISOString());
  for (const name of ['trial_requests', 'subscribers', 'courses']) {
    const row = await DOMAINS[name].transform({ name: 'n', email: 'e@example.invalid', title: 't', description: 'd', createdAt: CREATED, updatedAt: UPDATED }, ctx);
    assert.equal(row.created_at.toISOString(), CREATED.toISOString(), `${name}.created_at`);
  }
  const bookmark = await DOMAINS.quran_bookmarks.transform({ user: userId, verseKey: '1:1', chapterId: 1, verseNum: 1, createdAt: CREATED }, ctx);
  assert.equal(bookmark.created_at.toISOString(), CREATED.toISOString());
});

await test('every domain declares its source dates, and every Date it maps is consumed or declared lost', () => {
  for (const [name, domain] of Object.entries(DOMAINS)) {
    assert.ok(domain.sourceDates, `${name} must declare sourceDates (mapped/unpreserved)`);
  }
  // The tables with no timestamp column at all name their losses.
  assert.deepEqual(DOMAINS.quran_reading_progress.sourceDates.unpreserved, ['createdAt', 'updatedAt']);
  assert.deepEqual(DOMAINS.quran_memorization_stats.sourceDates.unpreserved, ['createdAt', 'updatedAt']);
});

await test('invoices transform: source dates it cannot preserve fail the document instead of becoming the migration time', async () => {
  await assert.rejects(DOMAINS.invoices.transform({ payment: 'p1', createdAt: CREATED }, planCtx()), /cannot preserve/);
});

await test('plannedId: deterministic, UUID-shaped, distinct per kind and per source id', () => {
  const a = plannedId('users', 'x');
  assert.equal(a, plannedId('users', 'x'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, plannedId('courses', 'x'));
  assert.notEqual(a, plannedId('users', 'y'));
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
