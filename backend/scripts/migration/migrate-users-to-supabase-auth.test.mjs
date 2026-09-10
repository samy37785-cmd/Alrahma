#!/usr/bin/env node
// Stage 2J-B Part H, review round 4, item 2 -- exit-code correctness for
// migrate-users-to-supabase-auth.mjs. Two layers, matching the pattern
// established for computeDomainWorkerPlan()/computeExitFailure()-style
// pure helpers elsewhere in this directory:
//   1. Pure unit tests for computeExitFailure()/validateSubscriptionPlan()
//      -- no live Mongo/Postgres/GoTrue needed, each of the 4 exit
//      conditions checked in isolation with a plain object.
//   2. Live integration tests (disposable Docker Mongo+Postgres, no real
//      GoTrue -- every scenario here pre-seeds auth.users/profiles
//      directly so no real createUser()/generateLink() call is ever
//      reached) proving the REAL script, run for real, actually exits
//      non-zero for a genuine document-level failure -- in --plan mode
//      (an error detectable without any write) and in --execute mode.
//
// Bug being proven fixed: this process's own exit code previously stayed
// 0 as long as nothing THREW, even when report.users.errors /
// report.admins.errors / report.subscriptions.failed held real entries,
// or report.reconciliation.consistent was false -- the exact same class
// of "caller checking only the exit code sees success" bug already fixed
// in mongo-to-supabase.mjs (see its own changelog) and in
// production-import-orchestrator.mjs's runImport(), now closed here too.
// Also: --plan previously could never detect an unresolvable subscription
// plan/provider at all (that whole check lived inside `if (execute)`) --
// fixed by extracting validateSubscriptionPlan() as a pure, write-free
// check reused by both modes.
//
// Review round 5, item 2 additions: users/admins with a missing, invalid,
// or conflicting/duplicate email were silently `continue`d -- never an
// error, never even detected in --plan. Teacher/parent-child
// relationships that would be skipped for lack of a target were computed
// ONLY under --execute (never in --plan at all), and
// computeExitFailure() never inspected them regardless of mode. Fixed:
// computeIdentityEmailProblems()/computeRelationshipPlan() are pure,
// write-free checks (the validateSubscriptionPlan() pattern) run
// identically in both modes BEFORE either per-document loop writes
// anything; a problem/skip fails the run closed unless it matches a
// signature in an explicit, human-authored --approved-dispositions file
// (partitionByDisposition()/loadApprovedDispositions()).
//
// This file imports migrate-users-to-supabase-auth.mjs's pure exports
// directly for layer 1 -- safe only because that file is now guarded
// with `if (process.argv[1] === fileURLToPath(import.meta.url))` (it
// was not, before this round; every OTHER test in this directory still
// drives it via child-process CLI invocation only, which is how layer 2
// below does it too).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import {
  computeExitFailure,
  validateSubscriptionPlan,
  computeIdentityEmailProblems,
  computeInvalidDocIds,
  computeRelationshipPlan,
  computeAdminRoleMappingProblems,
  computeSubscriptionProblems,
  emailProblemSignature,
  relationshipSkipSignature,
  partitionByDisposition,
  loadApprovedDispositions,
  parseApprovedDispositions,
  findUnusedApprovedSignatures,
  migrateSubscription,
} from './migrate-users-to-supabase-auth.mjs';
import { contentHashOf } from './lib/source-ledger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const USER_MIGRATION_SCRIPT = path.join(__dirname, 'migrate-users-to-supabase-auth.mjs');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const MONGO_NAME = `stage2jb-h-usersexittest-mongo-${SUFFIX}`;
const PG_NAME = `stage2jb-h-usersexittest-pg-${SUFFIX}`;

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function baseReport() {
  return {
    users: { created: 0, alreadyExists: 0, wouldCreate: 0, errors: [] },
    admins: { created: 0, alreadyExists: 0, wouldCreate: 0, errors: [] },
    relationships: null,
    subscriptions: { migrated: 0, skipped: 0, wouldMigrate: 0, failed: [] },
    reconciliation: { consistent: true },
  };
}

async function main() {
  // -----------------------------------------------------------------
  // Layer 1: pure unit tests, no infra needed at all.
  // -----------------------------------------------------------------

  await test('computeExitFailure: clean report, either mode -> false', () => {
    assert.equal(computeExitFailure(baseReport(), false), false);
    assert.equal(computeExitFailure(baseReport(), true), false);
  });

  await test('computeExitFailure: users.errors non-empty -> true, in BOTH modes', () => {
    const report = baseReport();
    report.users.errors.push({ email: 'x@example.invalid', message: 'boom' });
    assert.equal(computeExitFailure(report, false), true);
    assert.equal(computeExitFailure(report, true), true);
  });

  await test('computeExitFailure: admins.errors non-empty -> true, in BOTH modes', () => {
    const report = baseReport();
    report.admins.errors.push({ email: 'admin@example.invalid', message: 'unmapped role' });
    assert.equal(computeExitFailure(report, false), true);
    assert.equal(computeExitFailure(report, true), true);
  });

  await test('computeExitFailure: subscriptions.failed non-empty -> true, in BOTH modes', () => {
    const report = baseReport();
    report.subscriptions.failed.push({ email: 'u@example.invalid', reason: 'unresolvable plan' });
    assert.equal(computeExitFailure(report, false), true);
    assert.equal(computeExitFailure(report, true), true);
  });

  await test('computeExitFailure: reconciliation.consistent !== true -> true ONLY in --execute mode', () => {
    const report = baseReport();
    report.reconciliation.consistent = false;
    assert.equal(computeExitFailure(report, true), true, 'an execute run with a real inconsistency must fail');
    assert.equal(computeExitFailure(report, false), false, 'a --plan run\'s reconciliation.consistent is always "n/a (dry-run)" -- not applicable, not a failure');
  });

  await test('computeExitFailure: all 4 conditions are independent -- any ONE alone is enough', () => {
    const onlyUsers = { ...baseReport(), users: { errors: [{ email: 'a', message: 'x' }] } };
    const onlyAdmins = { ...baseReport(), admins: { errors: [{ email: 'a', message: 'x' }] } };
    const onlySubs = { ...baseReport(), subscriptions: { failed: [{ email: 'a', reason: 'x' }] } };
    const onlyRecon = { ...baseReport(), reconciliation: { consistent: false } };
    for (const r of [onlyUsers, onlyAdmins, onlySubs]) {
      assert.equal(computeExitFailure(r, false), true);
      assert.equal(computeExitFailure(r, true), true);
    }
    assert.equal(computeExitFailure(onlyRecon, true), true);
  });

  await test('validateSubscriptionPlan: no subscription / no plan name -> ok, skip', () => {
    assert.deepEqual(validateSubscriptionPlan(null), { ok: true, skip: true });
    assert.deepEqual(validateSubscriptionPlan({}), { ok: true, skip: true });
  });

  await test('validateSubscriptionPlan: unresolvable plan name -> FAIL, detectable without any write', () => {
    const result = validateSubscriptionPlan({ plan: 'Definitely Not A Real Plan' });
    assert.equal(result.ok, false);
    assert.match(result.reason, /unresolvable plan name/);
  });

  await test('validateSubscriptionPlan: a real canonical plan name resolves -> ok', () => {
    const result = validateSubscriptionPlan({ plan: 'Starter' });
    assert.equal(result.ok, true);
    assert.equal(result.slug, 'Starter');
  });

  await test('validateSubscriptionPlan: unknown provider on an otherwise-valid plan -> FAIL', () => {
    const result = validateSubscriptionPlan({ plan: 'Starter', provider: 'some-unknown-gateway' });
    assert.equal(result.ok, false);
    assert.match(result.reason, /unknown subscription provider/);
  });

  // -----------------------------------------------------------------
  // Round 5, item 2: computeIdentityEmailProblems -- pure, write-free.
  // -----------------------------------------------------------------

  await test('computeIdentityEmailProblems: clean, unique, valid emails -> no problems', () => {
    const users = [{ _id: 'u1', email: 'a@example.invalid' }, { _id: 'u2', email: 'b@example.invalid' }];
    const admins = [{ _id: 'ad1', email: 'admin@example.invalid' }];
    assert.deepEqual(computeIdentityEmailProblems(users, admins), []);
  });

  await test('computeIdentityEmailProblems: a missing email is reported, never silently dropped', () => {
    const problems = computeIdentityEmailProblems([{ _id: 'u1' }, { _id: 'u2', email: '' }], []);
    assert.equal(problems.length, 2);
    assert.ok(problems.every((p) => p.reason === 'missing email' && p.kind === 'user'));
  });

  await test('computeIdentityEmailProblems: an invalid-format email is reported', () => {
    const problems = computeIdentityEmailProblems([{ _id: 'u1', email: 'not-an-email' }], []);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].reason, 'invalid email format');
  });

  await test('invalid email normalization: case/whitespace is canonicalized and the source document remains invalid by stable identity', () => {
    const problems = computeIdentityEmailProblems([{ _id: 'u-bad', email: ' BAD-EMAIL ' }], []);
    assert.equal(problems[0].email, 'bad-email');
    assert.equal(problems[0].rawEmail, ' BAD-EMAIL ');
    assert.deepEqual([...computeInvalidDocIds(problems)], ['user:u-bad']);
  });

  await test('computeIdentityEmailProblems: two user docs sharing one email -> a duplicate problem, both users individually clean', () => {
    const users = [{ _id: 'u1', email: 'shared@example.invalid' }, { _id: 'u2', email: 'Shared@Example.Invalid ' }];
    const problems = computeIdentityEmailProblems(users, []);
    assert.equal(problems.length, 1, 'exactly one duplicate problem, not two');
    assert.equal(problems[0].kind, 'duplicate');
    assert.match(problems[0].reason, /email used by 2 source documents/);
  });

  await test('computeIdentityEmailProblems: a user and an admin sharing one email is ALSO a duplicate (cross-collection)', () => {
    const problems = computeIdentityEmailProblems(
      [{ _id: 'u1', email: 'shared@example.invalid' }],
      [{ _id: 'ad1', email: 'shared@example.invalid' }]
    );
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, 'duplicate');
    assert.match(problems[0].reason, /user:u1/);
    assert.match(problems[0].reason, /admin:ad1/);
  });

  // -----------------------------------------------------------------
  // Round 5, item 2: computeRelationshipPlan -- pure, write-free.
  // -----------------------------------------------------------------

  await test('computeRelationshipPlan: a resolvable teacher and a resolvable child are both counted resolved', () => {
    const users = [
      { _id: 's1', email: 'student@example.invalid', teacher: 't1', children: [] },
      { _id: 't1', email: 'teacher@example.invalid' },
      { _id: 'p1', email: 'parent@example.invalid', children: ['s1'] },
    ];
    const plan = computeRelationshipPlan(users, new Set());
    assert.equal(plan.teacherLinksResolved, 1);
    assert.equal(plan.parentLinksResolved, 1);
    assert.equal(plan.teacherLinksSkippedNoTarget, 0);
    assert.equal(plan.parentLinksSkippedNoTarget, 0);
    assert.deepEqual(plan.skipped, []);
  });

  await test('computeRelationshipPlan: a dangling teacher reference (no such source document) is skipped, not silently dropped', () => {
    const users = [{ _id: 's1', email: 'student@example.invalid', teacher: 'does-not-exist' }];
    const plan = computeRelationshipPlan(users, new Set());
    assert.equal(plan.teacherLinksSkippedNoTarget, 1);
    assert.equal(plan.skipped.length, 1);
    assert.equal(plan.skipped[0].kind, 'teacher');
    assert.equal(plan.skipped[0].studentEmail, 'student@example.invalid');
    assert.equal(plan.skipped[0].targetMongoId, 'does-not-exist');
  });

  await test('computeRelationshipPlan: a teacher reference that resolves to a document whose OWN identity is invalid is skipped', () => {
    const users = [
      { _id: 's1', email: 'student@example.invalid', teacher: 't1' },
      { _id: 't1', email: 'badteacher@example.invalid' },
    ];
    const plan = computeRelationshipPlan(users, new Set(['user:t1']));
    assert.equal(plan.teacherLinksSkippedNoTarget, 1);
    assert.equal(plan.teacherLinksResolved, 0);
  });

  await test('computeRelationshipPlan: a dangling child reference is skipped as parent-child', () => {
    const users = [{ _id: 'p1', email: 'parent@example.invalid', children: ['ghost-child'] }];
    const plan = computeRelationshipPlan(users, new Set());
    assert.equal(plan.parentLinksSkippedNoTarget, 1);
    assert.equal(plan.skipped[0].kind, 'parent-child');
  });

  await test('computeRelationshipPlan: a student whose OWN identity is invalid contributes no relationship problem at all (already reported separately)', () => {
    const users = [
      { _id: 's1', email: 'badstudent@example.invalid', teacher: 't1' },
      { _id: 't1', email: 'teacher@example.invalid' },
    ];
    const plan = computeRelationshipPlan(users, new Set(['user:s1']));
    assert.equal(plan.teacherLinksResolved, 0);
    assert.equal(plan.teacherLinksSkippedNoTarget, 0);
    assert.deepEqual(plan.skipped, [], 'the student\'s own bad identity is already an identity problem -- not ALSO a relationship problem');
  });

  await test('computeRelationshipPlan: an invalid target with raw/normalized email differences is never counted resolved', () => {
    const users = [
      { _id: 'student', email: 'student@example.invalid', teacher: 'bad-target' },
      { _id: 'bad-target', email: ' BAD-EMAIL ' },
    ];
    const invalidIds = computeInvalidDocIds(computeIdentityEmailProblems(users, []));
    const plan = computeRelationshipPlan(users, invalidIds);
    assert.equal(plan.teacherLinksResolved, 0);
    assert.equal(plan.teacherLinksSkippedNoTarget, 1);
  });

  await test('admin-role and subscription structural validation are pure and complete before writes', () => {
    assert.equal(computeAdminRoleMappingProblems([{ _id: 'a1', email: 'a@example.invalid', role: 'bogus' }]).length, 1);
    assert.equal(computeSubscriptionProblems([{ _id: 'u1', email: 'u@example.invalid', subscription: { plan: 'unknown' } }]).length, 1);
  });

  // -----------------------------------------------------------------
  // Round 5, item 2: disposition signatures + partitioning + loader.
  // -----------------------------------------------------------------

  await test('emailProblemSignature / relationshipSkipSignature: deterministic and distinct per distinct problem', () => {
    const p1 = { kind: 'user', id: 'u1', email: null, reason: 'missing email' };
    const p2 = { kind: 'user', id: 'u2', email: null, reason: 'missing email' };
    assert.equal(emailProblemSignature(p1), emailProblemSignature(p1));
    assert.notEqual(emailProblemSignature(p1), emailProblemSignature(p2));

    const s1 = { kind: 'teacher', studentEmail: 'a@example.invalid', targetMongoId: 't1' };
    const s2 = { kind: 'teacher', studentEmail: 'a@example.invalid', targetMongoId: 't2' };
    assert.equal(relationshipSkipSignature(s1), relationshipSkipSignature(s1));
    assert.notEqual(relationshipSkipSignature(s1), relationshipSkipSignature(s2));
  });

  await test('partitionByDisposition: only items whose signature is explicitly approved move to `approved`', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const sig = (i) => `sig:${i.id}`;
    const { approved, unapproved } = partitionByDisposition(items, sig, ['sig:b']);
    assert.deepEqual(approved.map((i) => i.id), ['b']);
    assert.deepEqual(unapproved.map((i) => i.id), ['a', 'c']);
  });

  await test('loadApprovedDispositions: no path -> empty array (nothing pre-approved by default)', () => {
    assert.deepEqual(loadApprovedDispositions(null), []);
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage2jb-dispositions-test-'));
  function writeDispositions(obj) {
    const p = path.join(tmpDir, `dispositions-${crypto.randomUUID()}.json`);
    fs.writeFileSync(p, JSON.stringify(obj));
    return p;
  }

  await test('loadApprovedDispositions: a well-formed file returns exactly the signatures, in order', () => {
    const p = writeDispositions({
      approvedBy: 'ops-lead', approvedAt: new Date().toISOString(),
      items: [{ signature: 'sig-a', reason: 'known legacy gap, reviewed' }, { signature: 'sig-b', reason: 'reviewed' }],
    });
    assert.deepEqual(loadApprovedDispositions(p), ['sig-a', 'sig-b']);
  });

  await test('approved dispositions reject malformed timestamps, duplicate signatures, and report unused signatures', () => {
    assert.throws(
      () => parseApprovedDispositions(JSON.stringify({ approvedBy: 'ops', approvedAt: '2026-01-01', items: [] })),
      /valid ISO/
    );
    assert.throws(
      () => parseApprovedDispositions(JSON.stringify({
        approvedBy: 'ops', approvedAt: new Date().toISOString(),
        items: [{ signature: 'same', reason: 'a' }, { signature: 'same', reason: 'b' }],
      })),
      /duplicate signature/
    );
    assert.deepEqual(findUnusedApprovedSignatures(['known', 'stale'], ['known']), ['stale']);
  });

  await test('migrateSubscription: ON CONFLICT DO NOTHING with no prior target provenance is FAIL, never migrated', async () => {
    const queries = [];
    const fakePg = {
      async query(sql) {
        queries.push(sql);
        if (sql.includes('SELECT id, source_content_hash')) return { rows: [] };
        if (sql.includes('SELECT id FROM subscriptions WHERE user_id')) return { rows: [] };
        if (sql.includes('INSERT INTO migration_source_ledger')) return { rows: [{ id: 'ledger-1' }] };
        if (sql.includes('INSERT INTO subscriptions')) return { rows: [] };
        if (sql.includes('UPDATE migration_source_ledger')) return { rows: [] };
        throw new Error(`unexpected SQL in fake: ${sql}`);
      },
    };
    const result = await migrateSubscription(
      fakePg,
      'profile-1',
      { _id: 'mongo-1', subscription: { plan: 'Starter', status: 'active', validUntil: '2999-01-01T00:00:00.000Z' } },
      new Map([['Starter', 'plan-1']])
    );
    assert.equal(result.status, 'FAIL');
    assert.equal(queries.filter((sql) => sql.includes('INSERT INTO subscriptions')).length, 1);
    assert.equal(queries.filter((sql) => sql.includes("status = 'failed'")).length, 1);
  });

  await test('loadApprovedDispositions: fail-closed on a malformed file -- missing "items", missing "approvedBy", missing a "reason"', () => {
    assert.throws(() => loadApprovedDispositions(writeDispositions({ approvedBy: 'x', approvedAt: 'y' })), /"items" array/);
    assert.throws(() => loadApprovedDispositions(writeDispositions({ approvedAt: 'y', items: [] })), /"approvedBy"/);
    // approvedAt must be a valid ISO instant here so this case actually
    // exercises the per-item "reason" check, not the (now stricter)
    // round-6 approvedAt-format check tested separately above.
    assert.throws(
      () => loadApprovedDispositions(writeDispositions({
        approvedBy: 'x', approvedAt: new Date().toISOString(), items: [{ signature: 's1' }],
      })),
      /"reason"/
    );
  });

  // -----------------------------------------------------------------
  // Round 5, item 2: computeExitFailure extended -- identity/relationship
  // conditions, checked in BOTH modes (unlike reconciliation).
  // -----------------------------------------------------------------

  await test('computeExitFailure: report.identity.unapprovedCount > 0 -> true, in BOTH modes', () => {
    const report = { ...baseReport(), identity: { problems: [{}], approvedCount: 0, unapprovedCount: 1 } };
    assert.equal(computeExitFailure(report, false), true);
    assert.equal(computeExitFailure(report, true), true);
  });

  await test('computeExitFailure: report.relationships.unapprovedSkippedCount > 0 -> true, in BOTH modes (not execute-only)', () => {
    const report = {
      ...baseReport(),
      relationships: { teacherLinksResolved: 0, teacherLinksSkippedNoTarget: 1, parentLinksResolved: 0, parentLinksSkippedNoTarget: 0, skipped: [{}], approvedSkippedCount: 0, unapprovedSkippedCount: 1 },
    };
    assert.equal(computeExitFailure(report, false), true, 'a --plan run with a real skipped relationship must fail closed too, not just --execute');
    assert.equal(computeExitFailure(report, true), true);
  });

  await test('computeExitFailure: an APPROVED-only identity problem / relationship skip (unapprovedCount=0) does NOT fail the run', () => {
    const report = {
      ...baseReport(),
      identity: { problems: [{}], approvedCount: 1, unapprovedCount: 0 },
      relationships: { teacherLinksResolved: 0, teacherLinksSkippedNoTarget: 1, parentLinksResolved: 0, parentLinksSkippedNoTarget: 0, skipped: [{}], approvedSkippedCount: 1, unapprovedSkippedCount: 0 },
    };
    assert.equal(computeExitFailure(report, false), false);
    assert.equal(computeExitFailure(report, true), false);
  });

  await test('computeExitFailure: report.identity/report.relationships being null (old-shape report) is tolerated safely as no-failure', () => {
    assert.equal(computeExitFailure({ ...baseReport(), identity: null, relationships: null }, false), false);
  });

  // -----------------------------------------------------------------
  // Layer 2: live integration, real disposable Mongo+Postgres, no real
  // GoTrue (every scenario pre-seeds auth.users/profiles directly so no
  // createUser()/generateLink() call is ever reached -- SUPABASE_URL/
  // SUPABASE_SERVICE_ROLE_KEY are set to harmless placeholder values
  // only to satisfy main()'s own required-env-var check).
  // -----------------------------------------------------------------

  console.log('=== SETUP: disposable Mongo + Postgres, schema applied ===');
  const mongoPort = await startDisposableMongo();
  const pgPort = await startDisposablePostgres();
  const mongoUri = `mongodb://127.0.0.1:${mongoPort}/al-rahma`;
  const pgUri = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;

  const migrate = await runCommand(process.execPath, [RUN_MIGRATIONS], {
    env: { ...process.env, TEST_DATABASE_URL: pgUri },
  });
  if (migrate.code !== 0) throw new Error(`schema application failed: ${migrate.stderr}`);
  console.log('schema applied.');

  await mongoose.connect(mongoUri);
  const pgPool = new pg.Pool({ connectionString: pgUri });

  function runUserMigrationCLI(args) {
    const result = spawnSync(process.execPath, [USER_MIGRATION_SCRIPT, ...args], {
      cwd: __dirname,
      env: {
        ...process.env,
        MIGRATION_MONGO_URI: mongoUri,
        MIGRATION_DB_URL: pgUri,
        SUPABASE_URL: 'http://127.0.0.1:1/',
        SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key-for-test',
      },
      encoding: 'utf8',
    });
    let report = null;
    try { report = JSON.parse(result.stdout); } catch { /* leave null if the process crashed before printing */ }
    return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', report };
  }

  async function resetAll() {
    await pgPool.query('TRUNCATE profiles, auth.users, migration_source_ledger, subscriptions RESTART IDENTITY CASCADE');
    await mongoose.connection.collection('users').deleteMany({});
    await mongoose.connection.collection('adminusers').deleteMany({});
  }
  async function seedExistingProfile(email) {
    const id = crypto.randomUUID();
    await pgPool.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [id, email]);
    return id;
  }
  async function addProfileLedger(sourceDoc, profileId, sourceCollection = 'users') {
    await pgPool.query(
      `INSERT INTO migration_source_ledger
         (source_system, source_database, source_collection, source_document_id, source_content_hash,
          target_table, target_id, status, migrated_at)
       VALUES ('mongodb', 'al-rahma', $1, $2, $3, 'profiles', $4, 'reconciled', now())`,
      [sourceCollection, String(sourceDoc._id), contentHashOf(sourceDoc), profileId]
    );
  }

  await test('--plan: an unmapped AdminUser role is a document-level error detectable without any write, and fails the whole run closed', async () => {
    await resetAll();
    await mongoose.connection.collection('adminusers').insertOne({ email: 'badrole@example.invalid', role: 'bogus-role' });

    const run = runUserMigrationCLI([]);
    assert.equal(run.code, 1, 'a --plan run with a detectable document-level error must exit non-zero');
    assert.ok(run.report, 'the report must still be printed even though the exit code is non-zero');
    assert.equal(run.report.admins.errors.length, 1);
    assert.match(run.report.admins.errors[0].message, /unmapped AdminUser role/);
  });

  await test('--plan: an unresolvable subscription plan name is now ALSO detected (was previously invisible to --plan entirely)', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertOne({
      email: 'subuser@example.invalid', role: 'student', subscription: { plan: 'Definitely Not A Real Plan' },
    });

    const run = runUserMigrationCLI([]);
    assert.equal(run.code, 1, 'a --plan run must fail on an error detectable without writes -- previously this whole check only ran under --execute');
    assert.equal(run.report.subscriptions.failed.length, 1);
    assert.match(run.report.subscriptions.failed[0].reason, /unresolvable plan name/);
    assert.equal(run.report.subscriptions.wouldMigrate, 0);
  });

  await test('--plan: a resolvable subscription plan is correctly reported as wouldMigrate, not a failure', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertOne({
      email: 'gooduser@example.invalid', role: 'student', subscription: { plan: 'Starter' },
    });

    const run = runUserMigrationCLI([]);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.report.subscriptions.failed.length, 0);
    assert.equal(run.report.subscriptions.wouldMigrate, 1);
  });

  await test('--execute: an unresolvable subscription plan still fails the whole run closed (no real GoTrue needed -- profile pre-exists)', async () => {
    await resetAll();
    const email = 'execsubuser@example.invalid';
    await seedExistingProfile(email);
    await mongoose.connection.collection('users').insertOne({
      email, role: 'student', subscription: { plan: 'Definitely Not A Real Plan' },
    });

    const run = runUserMigrationCLI(['--execute']);
    assert.equal(run.code, 1, 'an --execute run with a real subscription failure must exit non-zero, never merely logged');
    assert.equal(run.report.subscriptions.failed.length, 1);
    assert.match(run.report.subscriptions.failed[0].reason, /unresolvable plan name/);
  });

  await test('--execute: a genuinely inconsistent reconciliation also fails the run closed (via a document-level error whose email still has a stale matching profile)', async () => {
    await resetAll();
    // A deterministic way to force reconciliation.consistent=false without
    // a real GoTrue instance: this email already has a real profiles row
    // (matchingProfilesRows counts it) but its ONLY Mongo appearance is an
    // admin with an unmapped role (erroredEmails excludes it from
    // expectedEmails) -- a genuine, real mismatch between "profiles rows
    // that exist" and "profiles rows this run actually expected/produced".
    const email = 'stale-profile-errored-admin@example.invalid';
    await seedExistingProfile(email);
    await mongoose.connection.collection('adminusers').insertOne({ email, role: 'bogus-role' });

    const run = runUserMigrationCLI(['--execute']);
    assert.equal(run.code, 1);
    assert.equal(run.report.reconciliation.consistent, false, 'this scenario must genuinely produce consistent=false, not just an unrelated error');
  });

  await test('--execute: a fully clean run (valid admin role, valid subscription) exits 0 with consistent=true', async () => {
    await resetAll();
    const email = 'cleanadmin@example.invalid';
    const sourceDoc = { _id: new mongoose.Types.ObjectId(), email, role: 'admin' };
    await seedExistingProfile(email);
    const existing = await pgPool.query('SELECT id FROM auth.users WHERE email = $1', [email]);
    await addProfileLedger(sourceDoc, existing.rows[0].id, 'adminusers');
    await mongoose.connection.collection('adminusers').insertOne(sourceDoc);

    const run = runUserMigrationCLI(['--execute']);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.report.admins.errors.length, 0);
    assert.equal(run.report.reconciliation.consistent, true);
  });

  await test('genuine partial subscription migration resumes from exact source ledger without inserting a duplicate', async () => {
    await resetAll();
    const email = 'resume-subscription@example.invalid';
    const sourceDoc = {
      _id: new mongoose.Types.ObjectId(), email, role: 'student',
      subscription: { plan: 'Starter', status: 'inactive', validUntil: '2025-01-01T00:00:00.000Z' },
    };
    const profileId = await seedExistingProfile(email);
    await addProfileLedger(sourceDoc, profileId);
    // enforce_subscription_transition (0006/0010) requires canceled_at to
    // be set iff status='canceled', on INSERT as well as UPDATE.
    const inserted = await pgPool.query(
      `INSERT INTO subscriptions (user_id, provider, status, canceled_at) VALUES ($1, 'manual', 'canceled', now()) RETURNING id`,
      [profileId]
    );
    await pgPool.query(
      `INSERT INTO migration_source_ledger
         (source_system, source_database, source_collection, source_document_id, source_content_hash,
          target_table, target_id, status, migrated_at)
       VALUES ('mongodb', 'al-rahma', 'users', $1, $2, 'subscriptions', $3, 'created', now())`,
      [String(sourceDoc._id), contentHashOf(sourceDoc.subscription), inserted.rows[0].id]
    );
    const client = await pgPool.connect();
    try {
      const result = await migrateSubscription(client, profileId, sourceDoc, new Map([['Starter', crypto.randomUUID()]]));
      assert.equal(result.status, 'migrated');
      assert.equal(result.resumed, true);
      assert.equal((await pgPool.query('SELECT count(*)::int AS n FROM subscriptions')).rows[0].n, 1);
      const ledger = await pgPool.query(
        `SELECT status FROM migration_source_ledger WHERE target_table = 'subscriptions' AND source_document_id = $1`,
        [String(sourceDoc._id)]
      );
      assert.equal(ledger.rows[0].status, 'reconciled');
    } finally {
      client.release();
    }
  });

  await test('conflicting active subscription: a real, unrelated pre-existing active subscription is never silently claimed by this migration', async () => {
    // Live-DB proof (not the mocked-pg unit test above): a profile that
    // already has a real active subscription this migration never wrote
    // (no ledger entry at all) must FAIL rather than silently succeed --
    // caught here by migrateSubscription()'s own "any pre-existing
    // subscription with no matching ledger entry" guard, which fires
    // before the INSERT is even attempted (the strictest possible
    // outcome: never even reaching the real subscriptions_one_active_per_user
    // partial unique index / ON CONFLICT DO NOTHING path this same
    // condition would otherwise hit for a genuinely concurrent writer --
    // that specific branch is covered directly by the mocked-pg unit test
    // above, since this earlier guard makes it unreachable via a plain
    // sequential call here).
    await resetAll();
    const email = 'conflicting-active-subscription@example.invalid';
    const sourceDoc = {
      _id: new mongoose.Types.ObjectId(), email, role: 'student',
      subscription: { plan: 'Starter', status: 'active', validUntil: '2999-01-01T00:00:00.000Z' },
    };
    const profileId = await seedExistingProfile(email);
    const preExisting = await pgPool.query(
      `INSERT INTO subscriptions (user_id, provider, status, current_period_end)
       VALUES ($1, 'manual', 'active', '2999-01-01T00:00:00.000Z') RETURNING id`,
      [profileId]
    );

    const client = await pgPool.connect();
    try {
      const result = await migrateSubscription(client, profileId, sourceDoc, new Map([['Starter', crypto.randomUUID()]]));
      assert.equal(result.status, 'FAIL');
      assert.match(result.reason, /no matching source-scoped migration_source_ledger entry/);
      const rows = await pgPool.query('SELECT id FROM subscriptions WHERE user_id = $1', [profileId]);
      assert.equal(rows.rows.length, 1, 'no second row must ever be inserted');
      assert.equal(rows.rows[0].id, preExisting.rows[0].id, 'the original, unrelated active subscription must be the exact row still present, untouched');
      const ledger = await pgPool.query(
        `SELECT status FROM migration_source_ledger WHERE target_table = 'subscriptions' AND source_document_id = $1`,
        [String(sourceDoc._id)]
      );
      assert.equal(ledger.rows.length, 0, 'a pre-write-detected conflict must never even reach markPlanned -- no ledger row at all for this source document');
    } finally {
      client.release();
    }
  });

  // -----------------------------------------------------------------
  // Round 5, item 2: live CLI proof -- plan fails BEFORE any write for
  // each identity/relationship case, and execute cannot report success
  // with a non-zero skipped-relationship count either.
  // -----------------------------------------------------------------

  await test('--plan: a user with a missing email is reported and fails plan closed, never silently skipped', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertOne({ role: 'student' }); // no email at all

    const run = runUserMigrationCLI([]);
    assert.equal(run.code, 1, 'a --plan run with a missing-email user must exit non-zero, detectable without any write');
    assert.equal(run.report.identity.unapprovedCount, 1);
    assert.equal(run.report.identity.problems[0].reason, 'missing email');
    assert.equal((await pgPool.query('SELECT count(*)::int AS n FROM auth.users')).rows[0].n, 0, 'no write must have happened for this run');
  });

  await test('--plan: an admin with an invalid-format email is reported and fails plan closed', async () => {
    await resetAll();
    await mongoose.connection.collection('adminusers').insertOne({ email: 'not-an-email', role: 'admin' });

    const run = runUserMigrationCLI([]);
    assert.equal(run.code, 1);
    assert.equal(run.report.identity.unapprovedCount, 1);
    assert.equal(run.report.identity.problems[0].reason, 'invalid email format');
  });

  await test('--plan: two users sharing one email (conflicting/duplicate) fails plan closed, before any write', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertMany([
      { email: 'dup@example.invalid', role: 'student' },
      { email: 'DUP@example.invalid ', role: 'student' },
    ]);

    const run = runUserMigrationCLI([]);
    assert.equal(run.code, 1);
    assert.equal(run.report.identity.unapprovedCount, 1);
    assert.equal(run.report.identity.problems[0].kind, 'duplicate');
  });

  await test('--plan: a teacher relationship that would be skipped for lack of a target fails plan closed (relationships are now computed in --plan too)', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertOne({
      email: 'student-dangling-teacher@example.invalid', role: 'student', teacher: 'does-not-exist-in-source',
    });

    const run = runUserMigrationCLI([]);
    assert.equal(run.code, 1, 'a --plan run with a real skipped relationship must fail closed -- previously relationships were never even computed in --plan');
    assert.ok(run.report.relationships, 'report.relationships must be populated in --plan mode now, not null');
    assert.equal(run.report.relationships.teacherLinksSkippedNoTarget, 1);
    assert.equal(run.report.relationships.unapprovedSkippedCount, 1);
  });

  await test('--execute cannot report success with a non-zero skipped-relationship count', async () => {
    await resetAll();
    const email = 'student-dangling-teacher-exec@example.invalid';
    await seedExistingProfile(email);
    await mongoose.connection.collection('users').insertOne({ email, role: 'student', teacher: 'does-not-exist-in-source' });

    const run = runUserMigrationCLI(['--execute']);
    assert.equal(run.code, 1, 'execute must not report success while a real relationship was skipped');
    assert.equal(run.report.relationships.unapprovedSkippedCount, 1);
    assert.equal(run.report.relationships.teacherLinksSkippedNoTarget, 1);
  });

  async function writeCounts() {
    const names = ['auth.users', 'profiles', 'subscriptions', 'parent_student_links', 'plans', 'migration_source_ledger'];
    const counts = {};
    for (const name of names) counts[name] = (await pgPool.query(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n;
    return counts;
  }

  await test('--execute: mixed valid + case/whitespace-invalid source fails before every auth/profile/relationship/plan/subscription write', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertMany([
      { email: 'valid-before-invalid@example.invalid', role: 'student', subscription: { plan: 'Starter' } },
      { email: ' BAD-EMAIL ', role: 'student' },
    ]);
    const before = await writeCounts();
    const run = runUserMigrationCLI(['--execute']);
    const after = await writeCounts();
    assert.equal(run.code, 1);
    assert.equal(run.report.identity.problems[0].email, 'bad-email');
    assert.deepEqual(after, before, 'validation failure must leave every writable target and ledger unchanged');
  });

  await test('--execute: dangling relationship fails before every auth/profile/relationship/plan/subscription write', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertMany([
      { email: 'valid-a@example.invalid', role: 'student', teacher: 'missing-source-id' },
      { email: 'valid-b@example.invalid', role: 'student', subscription: { plan: 'Starter' } },
    ]);
    const before = await writeCounts();
    const run = runUserMigrationCLI(['--execute']);
    const after = await writeCounts();
    assert.equal(run.code, 1);
    assert.equal(run.report.relationships.teacherLinksSkippedNoTarget, 1);
    assert.deepEqual(after, before, 'relationship validation failure must occur before all writes and plan seeding');
  });

  await test('--approved-dispositions CLI rejects duplicate flags and unused signatures', async () => {
    await resetAll();
    const one = writeDispositions({ approvedBy: 'ops', approvedAt: new Date().toISOString(), items: [] });
    const duplicate = runUserMigrationCLI([`--approved-dispositions=${one}`, `--approved-dispositions=${one}`]);
    assert.equal(duplicate.code, 1);
    assert.match(duplicate.stderr, /more than once/);

    const unused = writeDispositions({
      approvedBy: 'ops', approvedAt: new Date().toISOString(),
      items: [{ signature: 'relationship:teacher:nobody@example.invalid:missing', reason: 'stale' }],
    });
    const stale = runUserMigrationCLI([`--approved-dispositions=${unused}`]);
    assert.equal(stale.code, 1);
    assert.match(stale.stderr, /matched no real problem/);
  });

  await test('--approved-dispositions: an explicitly approved, reviewed skip no longer fails the run (but is still fully reported, never silently dropped)', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertOne({
      email: 'student-approved-gap@example.invalid', role: 'student', teacher: 'does-not-exist-in-source',
    });

    // First, WITHOUT any dispositions: confirm it fails closed and
    // capture the real signature the run itself computed.
    const before = runUserMigrationCLI([]);
    assert.equal(before.code, 1);
    const skip = before.report.relationships.skipped[0];
    assert.ok(skip, 'the skip must be present in the report even though the run failed -- never silently dropped');

    const dispositionsPath = writeDispositions({
      approvedBy: 'ops-lead', approvedAt: new Date().toISOString(),
      items: [{ signature: relationshipSkipSignature(skip), reason: 'known legacy data gap, reviewed and accepted for this migration' }],
    });

    const after = runUserMigrationCLI([`--approved-dispositions=${dispositionsPath}`]);
    assert.equal(after.code, 0, after.stderr);
    assert.equal(after.report.relationships.unapprovedSkippedCount, 0);
    assert.equal(after.report.relationships.approvedSkippedCount, 1);
    assert.equal(after.report.relationships.teacherLinksSkippedNoTarget, 1, 'the skip itself is still reported -- approval does not make it disappear, only stops it from failing the run');
  });

  await test('--approved-dispositions: a malformed file makes the CLI itself refuse to run (fail-closed on trusted operator input)', async () => {
    await resetAll();
    const badPath = writeDispositions({ approvedAt: 'y', items: [] }); // missing approvedBy
    const run = runUserMigrationCLI([`--approved-dispositions=${badPath}`]);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /approvedBy/);
  });

  await pgPool.end();
  await mongoose.disconnect();

  console.log('\n=== CLEANUP ===');
  await runCommand('docker', ['rm', '-f', MONGO_NAME]);
  await runCommand('docker', ['rm', '-f', PG_NAME]);
  const mongoGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${MONGO_NAME}$`, '--format', '{{.Names}}']);
  const pgGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${PG_NAME}$`, '--format', '{{.Names}}']);
  if (mongoGone.stdout.trim() || pgGone.stdout.trim()) {
    console.error('CRITICAL: cleanup not verified -- a test container is still present');
    process.exitCode = 1;
  } else {
    console.log('cleanup verified: both test containers absent.');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

async function startDisposableMongo() {
  const run = await runCommand('docker', ['run', '--rm', '-d', '--name', MONGO_NAME, '-p', '127.0.0.1::27017', 'mongo:7']);
  if (run.code !== 0) throw new Error(`docker run (mongo) failed: ${run.stderr}`);
  let port = null;
  for (let i = 0; i < 15; i++) {
    const p = await runCommand('docker', ['port', MONGO_NAME, '27017/tcp']);
    const m = p.stdout.trim().match(/:(\d+)\s*$/);
    if (p.code === 0 && m) { port = m[1]; break; }
    await sleep(500);
  }
  if (!port) throw new Error('could not discover Mongo host port');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const check = await runCommand('docker', ['exec', MONGO_NAME, 'mongosh', '--quiet', '--eval', "print('ready')"]);
    if (check.code === 0 && check.stdout.includes('ready')) return port;
    await sleep(1000);
  }
  throw new Error('Mongo did not become ready in time');
}

async function startDisposablePostgres() {
  const run = await runCommand('docker', [
    'run', '--rm', '-d', '--name', PG_NAME, '-e', 'POSTGRES_PASSWORD=postgres', '-p', '127.0.0.1::5432', 'postgres:17',
  ]);
  if (run.code !== 0) throw new Error(`docker run (postgres) failed: ${run.stderr}`);
  let port = null;
  for (let i = 0; i < 15; i++) {
    const p = await runCommand('docker', ['port', PG_NAME, '5432/tcp']);
    const m = p.stdout.trim().match(/:(\d+)\s*$/);
    if (p.code === 0 && m) { port = m[1]; break; }
    await sleep(500);
  }
  if (!port) throw new Error('could not discover Postgres host port');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const check = await runCommand('docker', ['exec', PG_NAME, 'pg_isready', '-U', 'postgres']);
    if (check.code === 0) return port;
    await sleep(500);
  }
  throw new Error('Postgres did not become ready in time');
}

main().catch(async (err) => {
  console.error('[migrate-users-to-supabase-auth.test] harness crashed:', err);
  await runCommand('docker', ['rm', '-f', MONGO_NAME]).catch(() => {});
  await runCommand('docker', ['rm', '-f', PG_NAME]).catch(() => {});
  process.exitCode = 1;
});
