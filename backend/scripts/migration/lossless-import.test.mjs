#!/usr/bin/env node
// Owner decisions DATES_DECISION / PAYMENTS_DECISION / PLAN_MODE_DECISION /
// LOGGING_DECISION, proven end to end against real, disposable Mongo +
// Postgres (the full drizzle schema) through the real CLIs:
//
//   0. no canonical plans on the target: both tools stop with
//      PLAN_CATALOG_MISSING in plan AND execute mode before anything is
//      written -- no account, no row (NO_MIGRATION_SERVICE_IDENTITY: the
//      tools never create plans or an identity to create them with);
//   1. plan against an EMPTY target (plans present as a local fixture):
//      migrate-users --plan and
//      mongo-to-supabase --domain=all --dry-run both succeed with every
//      relation planned; zero rows change anywhere in public/auth (row
//      counts AND pg_stat write counters), and zero HTTP requests reach a
//      GoTrue stand-in (a recording busybox httpd, positive-controlled);
//   2. execute: every source document lands, payments as historical
//      'paymob'/'pending' rows linked to their user with the whole source
//      document in payment_source_snapshots, and every source date equal to
//      the source instant (to the millisecond) -- including the columns
//      0029 added (DATES_MUST_BE_PRESERVED), which stay NULL where the
//      source document has no date; no domain reports a date as lost;
//   3. rerun: nothing new is written, nothing is duplicated;
//   4. a changed source document goes through the UPDATE path and keeps
//      the source updatedAt despite the set_updated_at() trigger;
//   5. no seeded email, name, phone, hash or connection string appears in
//      any stdout/stderr, report file or checkpoint file.
//
// Accounts themselves (GoTrue) are covered by real-gotrue-correlation.
// test.mjs; here they are pre-seeded straight into auth.users, as every
// other live test in this directory does.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { DOMAINS } from './mongo-to-supabase.mjs';
import { CANONICAL_PLANS } from './lib/plan-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');
const DOMAIN_SCRIPT = path.join(__dirname, 'mongo-to-supabase.mjs');
const USERS_SCRIPT = path.join(__dirname, 'migrate-users-to-supabase-auth.mjs');
const CHECKPOINT_DIR = path.join(__dirname, '.checkpoints');
const OUT_DIR = path.join(__dirname, 'out');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const MONGO_NAME = `lossless-import-mongo-${SUFFIX}`;
const PG_NAME = `lossless-import-pg-${SUFFIX}`;
const GOTRUE_NAME = `lossless-import-gotrue-${SUFFIX}`;
const STARTED_AT = Date.now();

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => new Date(d).toISOString();

// --- source fixture: distinct, recognizable instants per field ---------
const id = () => new mongoose.Types.ObjectId();
const U1 = id();
const U2 = id();
const COURSE = id();
const HASH = '$2a$04$RI/NjbXHyr4JLF1rz.4j8ODfZjwVClmGT6rCBmHHygLezXAeoRN3C';
const PII = {
  emails: ['lossless-one@example.invalid', 'lossless-two@example.invalid', 'lossless-trial@example.invalid', 'lossless-sub@example.invalid', 'lossless-enrol@example.invalid'],
  names: ['Fixture Learner Alpha', 'Fixture Learner Beta', 'Fixture Trial Person'],
  phones: ['+201000111222', '+201000333444'],
};
const T = (n) => new Date(Date.UTC(2026, 5, 14, 10, 11, n, 345));

const SOURCE = {
  users: [
    { _id: U1, email: PII.emails[0], name: PII.names[0], role: 'student', password: HASH, createdAt: T(1), updatedAt: T(2) },
    { _id: U2, email: PII.emails[1], name: PII.names[1], role: 'student', password: HASH, createdAt: T(3), updatedAt: T(4) },
  ],
  courses: [{ _id: COURSE, title: 'Course A', description: 'desc', level: 'Beginner', price: 10, published: true, createdAt: T(5), updatedAt: T(6) }],
  enrollments: [
    { _id: id(), name: PII.names[2], email: PII.emails[4], whatsapp: PII.phones[0], status: 'pending', createdAt: T(7), updatedAt: T(8) },
    { _id: id(), name: PII.names[0], email: PII.emails[0], status: 'paid', paidAt: T(9), renewalAt: T(10), createdAt: T(11), updatedAt: T(12) },
  ],
  payments: [
    {
      _id: id(), plan: 'Starter', amount: 56, currency: 'EUR', gateway: 'paymob', method: 'card', status: 'pending', userId: U1,
      gatewayOrderId: 'order-fixture-1', customer: { name: PII.names[0], email: PII.emails[0], phone: PII.phones[1] },
      createdAt: T(13), updatedAt: T(14), __v: 0,
    },
    {
      _id: id(), plan: 'Standard', amount: 84, currency: 'EUR', gateway: 'paymob', method: 'wallet', status: 'pending', userId: U2,
      gatewayOrderId: 'order-fixture-2', customer: { name: PII.names[1], email: PII.emails[1] }, createdAt: T(15), updatedAt: T(16), __v: 0,
    },
  ],
  // The second document of a pair has no updatedAt (or no dates at all):
  // the nullable 0029 columns must stay NULL for it, never the migration time.
  trialrequests: [
    { _id: id(), name: PII.names[2], email: PII.emails[2], phone: PII.phones[0], status: 'new', createdAt: T(17), updatedAt: T(18) },
    { _id: id(), name: PII.names[1], email: PII.emails[1], status: 'contacted', createdAt: T(27) },
  ],
  subscribers: [{ _id: id(), email: PII.emails[3], createdAt: T(19), updatedAt: T(20) }],
  quranbookmarks: [
    { _id: id(), user: U1, verseKey: '2:255', chapterId: 2, verseNum: 255, createdAt: T(21), updatedAt: T(22) },
    { _id: id(), user: U2, verseKey: '1:1', chapterId: 1, verseNum: 1, createdAt: T(28) },
  ],
  quranreadingprogresses: [
    { _id: id(), user: U1, lastPosition: { surah: 2 }, streak: { current: 3, longest: 5, lastReadDate: '2026-06-13' }, createdAt: T(23), updatedAt: T(24) },
    { _id: id(), user: U2, lastPosition: {}, streak: { current: 0 } },
  ],
  quranmemorizationstats: [{ _id: id(), user: U2, stats: { totalRecordings: 2 }, streak: { current: 1 }, createdAt: T(25), updatedAt: T(26) }],
};

async function main() {
  console.log('=== SETUP: disposable Mongo + Postgres (schema applied) + GoTrue request recorder ===');
  const mongoPort = await startContainer(MONGO_NAME, ['-p', '127.0.0.1::27017', 'mongo:7'], '27017/tcp');
  const pgPort = await startContainer(PG_NAME, ['-e', 'POSTGRES_PASSWORD=postgres', '-p', '127.0.0.1::5432', 'postgres:17'], '5432/tcp');
  // Any request at all is logged by httpd -vv; the test asserts none arrive.
  const gotruePort = await startContainer(
    GOTRUE_NAME, ['-p', '127.0.0.1::80', 'busybox', 'sh', '-c', 'mkdir -p /www && httpd -f -vv -p 80 -h /www'], '80/tcp'
  );
  await waitFor(async () => (await runCommand('docker', ['exec', MONGO_NAME, 'mongosh', '--quiet', '--eval', "print('ready')"])).stdout.includes('ready'));
  await waitFor(async () => (await runCommand('docker', ['exec', PG_NAME, 'pg_isready', '-U', 'postgres'])).code === 0);

  const mongoUri = `mongodb://127.0.0.1:${mongoPort}/al-rahma`;
  const pgUri = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
  const gotrueUrl = `http://127.0.0.1:${gotruePort}`;
  const migrate = await runCommand(process.execPath, [RUN_MIGRATIONS], { env: { ...process.env, TEST_DATABASE_URL: pgUri } });
  if (migrate.code !== 0) throw new Error(`schema application failed: ${migrate.stderr}`);

  await mongoose.connect(mongoUri);
  for (const [collection, docs] of Object.entries(SOURCE)) await mongoose.connection.collection(collection).insertMany(docs);
  const pool = new pg.Pool({ connectionString: pgUri });
  for (const domain of Object.keys(DOMAINS)) fs.rmSync(path.join(CHECKPOINT_DIR, `${domain}.json`), { force: true });

  const usersCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lossless-users-'));
  const outputs = [];
  const env = {
    ...process.env, MIGRATION_MONGO_URI: mongoUri, MIGRATION_DB_URL: pgUri,
    SUPABASE_URL: gotrueUrl, SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key-for-test',
  };
  const run = (script, args, cwd = __dirname) => {
    const r = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
    outputs.push(r.stdout ?? '', r.stderr ?? '');
    const reportPath = /report written to (.+\.json)/.exec(r.stdout ?? '')?.[1]?.trim();
    return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', report: reportPath ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null };
  };

  async function tableCounts() {
    const tables = await pool.query(
      `SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_schema IN ('public','auth') AND table_type = 'BASE TABLE' ORDER BY 1, 2`
    );
    const counts = {};
    for (const t of tables.rows) {
      counts[`${t.table_schema}.${t.table_name}`] = Number((await pool.query(`SELECT count(*) FROM "${t.table_schema}"."${t.table_name}"`)).rows[0].count);
    }
    return counts;
  }
  async function writeCounter() {
    await sleep(1200); // a finished backend's stats are flushed at exit; give it a moment
    const c = await pool.connect();
    try {
      await c.query('SELECT pg_stat_clear_snapshot()');
      const r = await c.query(
        `SELECT coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0)::bigint AS n FROM pg_stat_all_tables WHERE schemaname IN ('public','auth')`
      );
      return Number(r.rows[0].n);
    } finally {
      c.release();
    }
  }
  async function gotrueRequestLines() {
    const logs = await runCommand('docker', ['logs', GOTRUE_NAME]);
    return `${logs.stdout}\n${logs.stderr}`.split('\n').filter((l) => l.trim()).length;
  }

  // Accounts as the user migration would leave them (auth.users ->
  // handle_new_user() -> profiles); only used from step 2 on.
  async function seedAccounts() {
    for (const u of SOURCE.users) {
      await pool.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [crypto.randomUUID(), u.email]);
    }
  }

  await test('no canonical plans: users --plan, domains --dry-run and domains execute all stop with PLAN_CATALOG_MISSING; 0 writes, 0 accounts, 0 GoTrue requests', async () => {
    const countsBefore = await tableCounts();
    const writesBefore = await writeCounter();
    const requestsBefore = await gotrueRequestLines();
    const users = run(USERS_SCRIPT, [], usersCwd);
    assert.equal(users.code, 1);
    assert.equal(JSON.parse(users.stdout).planCatalog.code, 'PLAN_CATALOG_MISSING');
    for (const args of [['--domain=all', '--dry-run'], ['--domain=all']]) {
      const r = run(DOMAIN_SCRIPT, args);
      assert.equal(r.code, 1, `${args.join(' ')} must fail`);
      assert.match(r.stderr, /PLAN_CATALOG_MISSING: .*Starter, Standard, Premium/);
      assert.equal(r.report, null, 'it stopped before the first domain, so no run report was written');
    }
    assert.deepEqual(await tableCounts(), countsBefore, 'a row count changed');
    assert.equal(await writeCounter(), writesBefore, 'a tuple was written');
    assert.equal(countsBefore['auth.users'], 0, 'no account exists');
    assert.equal(await gotrueRequestLines(), requestsBefore, 'GoTrue was contacted');
  });

  // The plans exist from here on, as a local fixture standing in for the
  // admin flow that creates them before a real migration.
  for (const plan of CANONICAL_PLANS) {
    await pool.query('INSERT INTO plans (slug, name, amount_minor) VALUES ($1, $2, $3)', [plan.slug, plan.name, plan.amountMinor]);
  }

  await test('plan against an empty target: users + all domains plan cleanly, 0 rows written, 0 GoTrue requests', async () => {
    const countsBefore = await tableCounts();
    const writesBefore = await writeCounter();
    const requestsBefore = await gotrueRequestLines();

    const users = run(USERS_SCRIPT, [], usersCwd);
    assert.equal(users.code, 0, users.stderr);
    const usersReport = JSON.parse(users.stdout);
    assert.equal(usersReport.users.wouldCreate, 2);
    assert.equal(usersReport.passwords.importableHashes, 2);
    assert.deepEqual(usersReport.passwords.problems, []);
    assert.deepEqual(usersReport.emailConfirmation, { source_had_no_verification_step: 2 });

    const plan = run(DOMAIN_SCRIPT, ['--domain=all', '--dry-run']);
    assert.equal(plan.code, 0, plan.stderr);
    const byDomain = Object.fromEntries(plan.report.results.map((r) => [r.domain, r]));
    for (const r of plan.report.results) assert.equal(r.failed, 0, `${r.domain} failed in plan mode`);
    assert.equal(byDomain.payments.imported, 2, 'both payments plan against planned accounts and planned plans');
    assert.equal(byDomain.quran_bookmarks.imported, SOURCE.quranbookmarks.length);
    assert.equal(byDomain.enrollments.imported, 2);

    assert.deepEqual(await tableCounts(), countsBefore, 'plan mode changed a row count');
    assert.equal(await writeCounter(), writesBefore, 'plan mode inserted/updated/deleted a tuple');
    assert.equal(await gotrueRequestLines(), requestsBefore, 'plan mode sent a request to GoTrue');
  });

  await test('the GoTrue recorder itself records requests (positive control for the 0 above)', async () => {
    const before = await gotrueRequestLines();
    await fetch(`${gotrueUrl}/auth/v1/admin/users`).catch(() => {});
    await sleep(300);
    assert.ok((await gotrueRequestLines()) > before, 'a real request must show up in the recorder log');
  });

  await test('execute: every document lands; payments stay paymob/pending, linked, with the whole source document kept', async () => {
    await seedAccounts();
    const exec = run(DOMAIN_SCRIPT, ['--domain=all']);
    assert.equal(exec.code, 0, exec.stderr);
    for (const r of exec.report.results) assert.equal(r.failed, 0, `${r.domain} failed`);

    const count = async (t) => Number((await pool.query(`SELECT count(*) FROM ${t}`)).rows[0].count);
    assert.equal(await count('payments'), 2);
    assert.equal(await count('payment_source_snapshots'), 2);
    assert.equal(await count('enrollments'), 2);
    assert.equal(await count('courses'), 1);
    assert.equal(await count('trial_requests'), 2);
    assert.equal(await count('subscribers'), 1);
    assert.equal(await count('quran_bookmarks'), 2);
    assert.equal(await count('quran_reading_progress'), 2);
    assert.equal(await count('quran_memorization_stats'), 1);

    const pay = await pool.query(
      `SELECT p.gateway, p.status, p.amount_minor, p.gateway_order_id, pr.email, pl.slug, s.raw_payload
         FROM payments p JOIN profiles pr ON pr.id = p.user_id JOIN plans pl ON pl.id = p.plan_id
         JOIN payment_source_snapshots s ON s.payment_id = p.id ORDER BY p.gateway_order_id`
    );
    assert.equal(pay.rows.length, 2, 'both payments are linked to their user and plan');
    assert.deepEqual(pay.rows.map((r) => [r.gateway, r.status, r.amount_minor, r.slug, r.email]), [
      ['paymob', 'pending', 5600, 'Starter', PII.emails[0]],
      ['paymob', 'pending', 8400, 'Standard', PII.emails[1]],
    ]);
    assert.equal(pay.rows[0].raw_payload.method, 'card', 'payments has no method column; the snapshot keeps it');
    assert.equal(pay.rows[1].raw_payload.method, 'wallet');
    assert.deepEqual(pay.rows[0].raw_payload.createdAt, { $date: iso(T(13)) });

    // Users are accounts, not domain rows (migrate-users ledgers those).
    const domainDocs = Object.entries(SOURCE).filter(([c]) => c !== 'users').reduce((n, [, docs]) => n + docs.length, 0);
    assert.equal(await count('auth.users'), SOURCE.users.length, 'exactly the source accounts -- no service identity');
    assert.equal(await count('admin_role_assignments'), 0, 'no admin role was granted to anything');
    const ledger = await pool.query(`SELECT status, count(*)::int AS n FROM migration_source_ledger GROUP BY status`);
    assert.deepEqual(ledger.rows, [{ status: 'reconciled', n: domainDocs }], 'every imported document is reconciled in the ledger');
  });

  await test('execute: every source date equals the source instant exactly; a source without a date keeps NULL; no date is reported lost', async () => {
    const expectDate = async (sql, params, expected, label) => {
      const r = await pool.query(sql, params);
      assert.equal(r.rows.length, 1, `${label}: exactly one row`);
      for (const [col, value] of Object.entries(expected)) {
        assert.equal(r.rows[0][col] === null ? null : iso(r.rows[0][col]), value === null ? null : iso(value), `${label}.${col}`);
      }
    };
    await expectDate('SELECT created_at, updated_at FROM courses', [], { created_at: T(5), updated_at: T(6) }, 'courses');
    await expectDate('SELECT created_at, updated_at, paid_at, renewal_at FROM enrollments WHERE status = $1', ['new'],
      { created_at: T(7), updated_at: T(8), paid_at: null, renewal_at: null }, 'enrollments[pending]');
    await expectDate('SELECT created_at, updated_at, paid_at, renewal_at FROM enrollments WHERE status = $1', ['paid'],
      { created_at: T(11), updated_at: T(12), paid_at: T(9), renewal_at: T(10) }, 'enrollments[paid]');
    await expectDate('SELECT created_at, updated_at FROM payments WHERE gateway_order_id = $1', ['order-fixture-1'], { created_at: T(13), updated_at: T(14) }, 'payments[1]');
    await expectDate('SELECT created_at, updated_at FROM payments WHERE gateway_order_id = $1', ['order-fixture-2'], { created_at: T(15), updated_at: T(16) }, 'payments[2]');
    // 0029's columns: the source instant, or NULL when the source has none.
    await expectDate('SELECT created_at, updated_at FROM trial_requests WHERE status = $1', ['new'], { created_at: T(17), updated_at: T(18) }, 'trial_requests[1]');
    await expectDate('SELECT created_at, updated_at FROM trial_requests WHERE status = $1', ['contacted'], { created_at: T(27), updated_at: null }, 'trial_requests[no updatedAt]');
    await expectDate('SELECT created_at, updated_at FROM subscribers', [], { created_at: T(19), updated_at: T(20) }, 'subscribers');
    await expectDate('SELECT created_at, updated_at FROM quran_bookmarks WHERE verse_key = $1', ['2:255'], { created_at: T(21), updated_at: T(22) }, 'quran_bookmarks[1]');
    await expectDate('SELECT created_at, updated_at FROM quran_bookmarks WHERE verse_key = $1', ['1:1'], { created_at: T(28), updated_at: null }, 'quran_bookmarks[no updatedAt]');
    await expectDate('SELECT created_at, updated_at FROM quran_reading_progress WHERE streak = $1', [3], { created_at: T(23), updated_at: T(24) }, 'quran_reading_progress[1]');
    await expectDate('SELECT created_at, updated_at FROM quran_reading_progress WHERE streak = $1', [0], { created_at: null, updated_at: null }, 'quran_reading_progress[no dates]');
    await expectDate('SELECT created_at, updated_at FROM quran_memorization_stats', [], { created_at: T(25), updated_at: T(26) }, 'quran_memorization_stats');
    const progress = await pool.query('SELECT last_read_date FROM quran_reading_progress WHERE streak = 3');
    assert.equal(progress.rows[0].last_read_date, '2026-06-13', 'a date-only string is kept verbatim');

    // The run report counts every source date by what happened to it.
    const reportFiles = fs.readdirSync(OUT_DIR).filter((f) => f.startsWith('migration-report-')).map((f) => path.join(OUT_DIR, f))
      .filter((f) => fs.statSync(f).mtimeMs >= STARTED_AT).sort();
    const lastExec = JSON.parse(fs.readFileSync(reportFiles.at(-1), 'utf8'));
    const dates = Object.fromEntries(lastExec.results.map((r) => [r.domain, r.dates]));
    assert.deepEqual(dates.trial_requests, { preserved: { created_at: 2, updated_at: 1 }, absentKeptNull: { updated_at: 1 } });
    assert.deepEqual(dates.subscribers, { preserved: { created_at: 1, updated_at: 1 } });
    assert.deepEqual(dates.quran_bookmarks, { preserved: { created_at: 2, updated_at: 1 }, absentKeptNull: { updated_at: 1 } });
    assert.deepEqual(dates.quran_reading_progress, { preserved: { created_at: 1, updated_at: 1 }, absentKeptNull: { created_at: 1, updated_at: 1 } });
    assert.deepEqual(dates.quran_memorization_stats, { preserved: { created_at: 1, updated_at: 1 } });
    assert.deepEqual(dates.payments, { preserved: { created_at: 2, updated_at: 2 } });
    for (const r of lastExec.results) {
      assert.equal(r.dates.generated, undefined, `${r.domain} generated a date although every source document had one`);
      assert.equal(r.dates.unpreserved, undefined, `${r.domain} reported a source date as lost (DATES_MUST_BE_PRESERVED)`);
    }
  });

  await test('rerun: nothing new is written, nothing is duplicated, every document reports unchanged', async () => {
    const before = await tableCounts();
    const rerun = run(DOMAIN_SCRIPT, ['--domain=all']);
    assert.equal(rerun.code, 0, rerun.stderr);
    for (const r of rerun.report.results) {
      assert.equal(r.failed, 0, `${r.domain} failed on rerun`);
      assert.equal(r.imported, 0, `${r.domain} re-imported on rerun`);
      assert.equal(r.skippedUnchanged, r.mongoCount, `${r.domain} did not report every document unchanged`);
    }
    assert.deepEqual(await tableCounts(), before, 'a rerun changed a row count (duplicate or loss)');
    assert.equal(before['auth.users'], SOURCE.users.length, 'still only the source accounts after the rerun');
  });

  await test('a changed source document takes the UPDATE path and keeps the source updatedAt despite set_updated_at()', async () => {
    const newUpdatedAt = new Date('2026-07-01T08:09:10.111Z');
    await mongoose.connection.collection('courses').updateOne({ _id: COURSE }, { $set: { title: 'Course A (revised)', updatedAt: newUpdatedAt } });
    const r = run(DOMAIN_SCRIPT, ['--domain=courses']);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.report.results[0].imported, 1);
    const row = (await pool.query('SELECT title, created_at, updated_at FROM courses')).rows;
    assert.equal(row.length, 1, 'updated in place, not duplicated');
    assert.equal(row[0].title, 'Course A (revised)');
    assert.equal(iso(row[0].updated_at), iso(newUpdatedAt), 'the trigger stamp was replaced by the source updatedAt');
    assert.equal(iso(row[0].created_at), iso(T(5)));
  });

  await test('0029 columns on the UPDATE / ON CONFLICT paths: the source updatedAt replaces the trigger stamp, and a missing one stays NULL', async () => {
    const newUpdatedAt = new Date('2026-07-02T09:10:11.222Z');
    const trials = mongoose.connection.collection('trialrequests');
    await trials.updateOne({ status: 'new' }, { $set: { message: 'changed', updatedAt: newUpdatedAt } });
    await trials.updateOne({ status: 'contacted' }, { $set: { message: 'changed too' } });
    await mongoose.connection.collection('subscribers').updateOne({}, { $set: { updatedAt: newUpdatedAt } });
    await mongoose.connection.collection('quranbookmarks').updateOne({ verseKey: '1:1' }, { $set: { note: 'changed' } });
    const progress = mongoose.connection.collection('quranreadingprogresses');
    await progress.updateOne({ 'streak.current': 3 }, { $set: { 'streak.current': 4, updatedAt: newUpdatedAt } });
    await progress.updateOne({ 'streak.current': 0 }, { $set: { 'streak.current': 1 } });
    const r = run(DOMAIN_SCRIPT, ['--domain=all']);
    assert.equal(r.code, 0, r.stderr);
    const imported = Object.fromEntries(r.report.results.filter((x) => x.imported > 0).map((x) => [x.domain, x.imported]));
    assert.deepEqual(imported, { trial_requests: 2, subscribers: 1, quran_bookmarks: 1, quran_reading_progress: 2 }, 'only the changed documents are re-imported');

    const one = async (sql, params) => (await pool.query(sql, params)).rows;
    const t1 = await one('SELECT message, created_at, updated_at FROM trial_requests WHERE status = $1', ['new']);
    assert.equal(t1.length, 1, 'updated in place, not duplicated');
    assert.equal(t1[0].message, 'changed');
    assert.equal(iso(t1[0].updated_at), iso(newUpdatedAt), 'trial_requests: the trigger stamp was replaced by the source updatedAt');
    assert.equal(iso(t1[0].created_at), iso(T(17)));
    const t2 = await one('SELECT message, updated_at FROM trial_requests WHERE status = $1', ['contacted']);
    assert.equal(t2[0].message, 'changed too');
    assert.equal(t2[0].updated_at, null, 'trial_requests: no source updatedAt -> NULL, not the trigger stamp');
    const s = await one('SELECT created_at, updated_at FROM subscribers', []);
    assert.equal(iso(s[0].updated_at), iso(newUpdatedAt), 'subscribers (ON CONFLICT): source updatedAt kept');
    assert.equal(iso(s[0].created_at), iso(T(19)));
    const b = await one('SELECT note, created_at, updated_at FROM quran_bookmarks WHERE verse_key = $1', ['1:1']);
    assert.equal(b[0].note, 'changed');
    assert.equal(b[0].updated_at, null, 'quran_bookmarks (ON CONFLICT): no source updatedAt -> NULL');
    assert.equal(iso(b[0].created_at), iso(T(28)));
    const p1 = await one('SELECT created_at, updated_at FROM quran_reading_progress WHERE streak = 4', []);
    assert.equal(iso(p1[0].updated_at), iso(newUpdatedAt), 'quran_reading_progress (ON CONFLICT): source updatedAt kept');
    assert.equal(iso(p1[0].created_at), iso(T(23)));
    const p2 = await one('SELECT created_at, updated_at FROM quran_reading_progress WHERE streak = 1', []);
    assert.equal(p2[0].created_at, null, 'quran_reading_progress: no source createdAt -> NULL');
    assert.equal(p2[0].updated_at, null, 'quran_reading_progress: no source updatedAt -> NULL, not the trigger stamp');
  });

  await test('no seeded email, name, phone, password hash or connection string in any output, report or checkpoint', async () => {
    const files = [
      ...fs.readdirSync(OUT_DIR).map((f) => path.join(OUT_DIR, f)).filter((f) => fs.statSync(f).mtimeMs >= STARTED_AT),
      ...fs.readdirSync(CHECKPOINT_DIR).map((f) => path.join(CHECKPOINT_DIR, f)).filter((f) => fs.statSync(f).mtimeMs >= STARTED_AT),
      ...fs.readdirSync(path.join(usersCwd, '.checkpoints')).map((f) => path.join(usersCwd, '.checkpoints', f)),
    ];
    assert.ok(files.length >= 3, 'report and checkpoint files were produced and are scanned');
    const haystacks = [...outputs, ...files.map((f) => fs.readFileSync(f, 'utf8'))];
    const needles = [...PII.emails, ...PII.names, ...PII.phones, HASH, pgUri, mongoUri, 'postgres:postgres@'];
    for (const needle of needles) {
      const hit = haystacks.findIndex((h) => h.toLowerCase().includes(needle.toLowerCase()));
      assert.equal(hit, -1, `found a seeded sensitive value (${needle.slice(0, 6)}...) in output/file #${hit}`);
    }
  });

  await pool.end();
  await mongoose.disconnect();
  fs.rmSync(usersCwd, { recursive: true, force: true });
  for (const domain of Object.keys(DOMAINS)) fs.rmSync(path.join(CHECKPOINT_DIR, `${domain}.json`), { force: true });
  for (const f of fs.readdirSync(OUT_DIR)) {
    const full = path.join(OUT_DIR, f);
    if (f.startsWith('migration-report-') && fs.statSync(full).mtimeMs >= STARTED_AT) fs.rmSync(full);
  }

  console.log('\n=== CLEANUP ===');
  await cleanupContainers();
  const left = await runCommand('docker', ['ps', '-a', '--filter', `name=lossless-import-.*-${SUFFIX}`, '--format', '{{.Names}}']);
  if (left.stdout.trim()) {
    console.error('CRITICAL: cleanup not verified -- a test container is still present');
    process.exitCode = 1;
  } else {
    console.log('cleanup verified: all test containers absent.');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

async function startContainer(name, args, containerPort) {
  const r = await runCommand('docker', ['run', '--rm', '-d', '--name', name, ...args]);
  if (r.code !== 0) throw new Error(`docker run ${name} failed: ${r.stderr}`);
  for (let i = 0; i < 30; i++) {
    const p = await runCommand('docker', ['port', name, containerPort]);
    const m = p.stdout.trim().match(/:(\d+)\s*$/m);
    if (p.code === 0 && m) return m[1];
    await sleep(500);
  }
  throw new Error(`could not discover the host port of ${name}`);
}

async function waitFor(check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await sleep(500);
  }
  throw new Error('container did not become ready in time');
}

async function cleanupContainers() {
  for (const name of [MONGO_NAME, PG_NAME, GOTRUE_NAME]) await runCommand('docker', ['rm', '-f', '-v', name]).catch(() => {});
}

main().catch(async (err) => {
  console.error('[lossless-import.test] harness crashed:', err);
  await cleanupContainers();
  process.exitCode = 1;
});
