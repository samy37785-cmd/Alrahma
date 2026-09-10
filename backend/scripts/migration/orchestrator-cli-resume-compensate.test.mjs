#!/usr/bin/env node
// Stage 2J-B Part H, review round 5, item 1 -- CLI/main()-level
// integration tests for the production-import-orchestrator.mjs preflight
// bug (not runImport()-level tests -- the bug lives entirely inside
// runPreflight(), which ONLY main() ever calls, so a runImport()-level
// test structurally cannot see it).
//
// Bug being proven fixed: main() called runPreflight() (and therefore
// verifyNoUnrecordedData()) identically before EITHER runImport() OR
// compensate() ever ran, and verifyNoUnrecordedData() itself required
// profiles/subscriptions to be COMPLETELY EMPTY, unconditionally. That
// combination meant:
//   - any retry after users/profiles were created failed here, before
//     the worker scripts' own resume logic ever got a chance to run;
//   - any retry after subscriptions were created failed identically;
//   - --compensate -- whose entire purpose is a safe re-run after a
//     partial prior attempt -- was blocked by the exact same check;
//   - ensureMigrationSeedAdmin()'s own seed-admin profile row (created
//     the moment any domain needing plan-catalog seeding runs) could
//     alone block every later run, for any domain.
//
// Fixed: verifyNoUnrecordedData() is now provenance-aware for profiles/
// subscriptions (migration-seed admin identity, or an auth.users
// migrated_from tag -- see that function's own comment), and the
// ledger-backed check is now scoped to source_system/source_database
// (round 5 item 3, exercised together with item 1 here since every real
// run touches both).
//
// No real GoTrue/Supabase stack is used. verifySignupsOff() is satisfied
// by a minimal, disposable Docker container (busybox httpd) answering
// GoTrue's own /auth/v1/settings shape -- NOT an in-process Node HTTP
// server: this environment's sandbox does not allow a spawned child
// process (the orchestrator CLI, spawned via spawnSync) to reach a plain
// loopback server bound by its own parent process, confirmed by direct
// experiment, while a Docker-mapped 127.0.0.1 port (exactly how the
// disposable Mongo/Postgres containers are already reached everywhere in
// this directory) works fine. Every scenario that needs an "already
// migrated" account pre-seeds auth.users/profiles directly (the same
// technique every other live test in this directory already uses) so no
// real createUser() call is ever attempted.
//
// Discriminator used throughout: a runPreflight() failure (the OLD bug,
// and still the CORRECT behavior for a genuinely unknown row) throws
// BEFORE main() ever prints its JSON result -- empty stdout, a
// `[production-import-orchestrator] FATAL: ...` stderr line, nothing
// parses as JSON. A runImport()/compensate()-level failure (post-
// preflight) still prints a clean JSON result on stdout, even when
// result.ok is false. Every "must now succeed/resume" scenario below
// asserts `run.json` is truthy -- proof the preflight itself did not
// crash -- and the "unknown row" scenario asserts the opposite.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { TARGET_SUPABASE_REF, computeConfirmToken } from './production-import-orchestrator.mjs';
import { ensureMigrationSeedAdmin } from './lib/admin-rpc.mjs';
import { contentHashOf } from './lib/source-ledger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');
const ORCHESTRATOR_SCRIPT = path.join(__dirname, 'production-import-orchestrator.mjs');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const MONGO_NAME = `stage2jb-h-orchresumetest-mongo-${SUFFIX}`;
const PG_NAME = `stage2jb-h-orchresumetest-pg-${SUFFIX}`;
const GOTRUE_NAME = `stage2jb-h-orchresumetest-gotrue-${SUFFIX}`;

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
function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function currentGitShaSync() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

async function main() {
  console.log('=== SETUP: disposable Mongo + Postgres, schema applied, GoTrue-settings stub ===');
  const mongoPort = await startDisposableMongo();
  const pgPort = await startDisposablePostgres();
  const gotruePort = await startDisposableGotrueStub();
  const mongoUri = `mongodb://127.0.0.1:${mongoPort}/al-rahma`;
  const pgUri = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
  const gotrueUrl = `http://127.0.0.1:${gotruePort}`;

  const migrate = await runCommand(process.execPath, [RUN_MIGRATIONS], {
    env: { ...process.env, TEST_DATABASE_URL: pgUri },
  });
  if (migrate.code !== 0) throw new Error(`schema application failed: ${migrate.stderr}`);
  console.log('schema applied.');

  await mongoose.connect(mongoUri);
  const pgPool = new pg.Pool({ connectionString: pgUri });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage2jb-orch-resume-test-'));
  const backupFile = path.join(tmpDir, 'mongo-al-rahma.archive');
  fs.writeFileSync(backupFile, 'fixture-backup-content');

  function writeBackupManifest() {
    const sidecarPath = path.join(tmpDir, `backup-${crypto.randomUUID()}.json`);
    fs.writeFileSync(sidecarPath, JSON.stringify({
      filePath: backupFile, sha256: sha256File(backupFile), createdAt: new Date().toISOString(),
    }));
    return sidecarPath;
  }
  function writeApprovalManifest() {
    const gitSha = currentGitShaSync();
    const backupHash = sha256File(backupFile);
    const manifestPath = path.join(tmpDir, `approval-${crypto.randomUUID()}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify({
      projectRef: TARGET_SUPABASE_REF, gitSha, backupHash,
      confirmToken: computeConfirmToken({ projectRef: TARGET_SUPABASE_REF, gitSha, backupHash }),
      approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
    }));
    return manifestPath;
  }
  function writeDispositions(items, overrides = {}) {
    const filePath = path.join(tmpDir, `dispositions-${crypto.randomUUID()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      approvedBy: 'round-6-cli-test', approvedAt: '2026-09-10T00:00:00.000Z', items, ...overrides,
    }));
    return filePath;
  }

  function runOrchestratorCLI(args, envOverrides = {}) {
    const backupManifestPath = writeBackupManifest();
    const approvalManifestPath = writeApprovalManifest();
    const result = spawnSync(process.execPath, [
      ORCHESTRATOR_SCRIPT, ...args,
      `--backup-manifest=${backupManifestPath}`, `--approval-manifest=${approvalManifestPath}`,
    ], {
      cwd: __dirname,
      env: {
        ...process.env,
        MIGRATION_MONGO_URI: mongoUri,
        MIGRATION_DB_URL: pgUri,
        SUPABASE_URL: gotrueUrl,
        SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key-for-test',
        ...envOverrides,
      },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    let json = null;
    try { json = JSON.parse(result.stdout); } catch { /* leave null -- preflight crashed before printing */ }
    return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', json };
  }

  async function resetAll() {
    await pgPool.query(
      'TRUNCATE profiles, auth.users, migration_source_ledger, subscriptions, trial_requests RESTART IDENTITY CASCADE'
    );
    await mongoose.connection.collection('users').deleteMany({});
    await mongoose.connection.collection('adminusers').deleteMany({});
    await mongoose.connection.collection('trialrequests').deleteMany({});
  }

  async function seedLedgeredAccount(sourceDoc, migratedFrom = 'mongodb') {
    const id = crypto.randomUUID();
    await pgPool.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
      [id, sourceDoc.email, JSON.stringify({ migrated_from: migratedFrom, migrated_at: new Date().toISOString() })]
    );
    await pgPool.query(
      `INSERT INTO migration_source_ledger
         (source_system, source_database, source_collection, source_document_id, source_content_hash,
          target_table, target_id, status, migrated_at)
       VALUES ('mongodb', 'al-rahma', 'users', $1, $2, 'profiles', $3, 'reconciled', now())`,
      [String(sourceDoc._id), contentHashOf(sourceDoc), id]
    );
    return id;
  }
  async function seedUntaggedAccount(email) {
    const id = crypto.randomUUID();
    await pgPool.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, email]);
    return id;
  }
  async function profileCount() {
    return (await pgPool.query('SELECT count(*)::int AS n FROM profiles')).rows[0].n;
  }
  async function authUserCount() {
    return (await pgPool.query('SELECT count(*)::int AS n FROM auth.users')).rows[0].n;
  }
  async function migrationWriteCounts() {
    const tables = ['auth.users', 'profiles', 'subscriptions', 'parent_student_links', 'migration_source_ledger', 'plans'];
    const result = {};
    for (const table of tables) result[table] = (await pgPool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    return result;
  }

  // -----------------------------------------------------------------

  await test('baseline: a fully fresh, empty run succeeds end-to-end (harness sanity check)', async () => {
    await resetAll();
    const run = runOrchestratorCLI(['--execute']);
    assert.ok(run.json, `preflight must not crash on a genuinely fresh target -- stderr: ${run.stderr}`);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.json.ok, true);
    assert.equal(run.json.status, 'reconciled');
  });

  await test('item 1: partial user migration (profiles/auth.users already populated, migration-tagged) -> rerun resumes safely, no longer blocked by the old pristine-only preflight', async () => {
    await resetAll();
    const email = 'resume-user@example.invalid';
    const sourceDoc = { _id: new mongoose.Types.ObjectId(), email, role: 'student' };
    const preExistingId = await seedLedgeredAccount(sourceDoc, 'mongodb');
    await mongoose.connection.collection('users').insertOne(sourceDoc);

    const run = runOrchestratorCLI(['--execute']);
    assert.ok(run.json, `OLD BUG: preflight crashed instead of resuming -- stderr: ${run.stderr}`);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.json.ok, true);
    assert.equal(run.json.status, 'reconciled');
    // Every real (non-dry-run) domain migration run seeds the canonical
    // plan catalog unconditionally (mongo-to-supabase.mjs always calls
    // ensureMigrationSeedAdmin()/seedCanonicalPlans() once real domain
    // writes start, not only when subscription/payment data exists) --
    // so a fully successful run here is expected to leave exactly TWO
    // profiles: the one pre-existing (resumed, not duplicated) user, and
    // the migration-seed admin. This is exactly the scenario item 1's fix
    // targets: that seed-admin row must never itself block a later run.
    assert.equal(await profileCount(), 2, 'expected exactly the resumed user profile + the seed-admin profile -- no duplicate of either');
    const stillThere = await pgPool.query('SELECT 1 FROM profiles WHERE id = $1', [preExistingId]);
    assert.equal(stillThere.rows.length, 1, 'the pre-existing user profile must be the exact same row -- resumed, not duplicated');
  });

  await test('item 1 + item 3: partial domain failure -> rerun resumes safely (real fault injection, real rollback, real resume)', async () => {
    await resetAll();
    const email = 'resume-domain-user@example.invalid';
    const sourceDoc = { _id: new mongoose.Types.ObjectId(), email, role: 'student' };
    await seedLedgeredAccount(sourceDoc, 'mongodb');
    await mongoose.connection.collection('users').insertOne(sourceDoc);
    await mongoose.connection.collection('trialrequests').insertOne({ name: 'Resume Test', email: 'trial-resume@example.invalid', status: 'new' });

    // First attempt: a real fault fires mid-write for the one domain
    // record that exists (trial_requests) -- kill-window 2 (target write
    // + markCreated must commit or roll back TOGETHER, per round 4's own
    // fix), so the whole run fails closed with zero orphaned rows.
    const faulted = runOrchestratorCLI(['--execute'], { MIGRATION_FAULT_INJECT_STAGE: 'after_target_write_before_marked_created' });
    assert.ok(faulted.json, `preflight itself must not be what fails a fresh run -- stderr: ${faulted.stderr}`);
    assert.equal(faulted.code, 1, 'the faulted run must report failure');
    assert.equal(faulted.json.ok, false);
    assert.equal(faulted.json.failedAt, 'mongo_domains');
    const trialRowsAfterFault = await pgPool.query('SELECT count(*)::int AS n FROM trial_requests');
    assert.equal(trialRowsAfterFault.rows[0].n, 0, 'the target write must have rolled back with markCreated -- no orphan row');

    // Rerun, no fault: this is the property under test -- the SAME
    // profiles row (already tagged from the users step above, which
    // itself already completed once) and now also a partial-attempt
    // ledger state must NOT block the orchestrator's own preflight from
    // even starting.
    const resumed = runOrchestratorCLI(['--execute']);
    assert.ok(resumed.json, `OLD BUG: preflight blocked the resume -- stderr: ${resumed.stderr}`);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(resumed.json.ok, true);
    assert.equal(resumed.json.status, 'reconciled');
    const trialRowsAfterResume = await pgPool.query('SELECT count(*)::int AS n FROM trial_requests');
    assert.equal(trialRowsAfterResume.rows[0].n, 1, 'the resumed run must have completed the domain write exactly once');
  });

  await test('item 1: the migration-seed admin profile alone (ensureMigrationSeedAdmin, no domain data at all) never blocks a later run', async () => {
    await resetAll();
    // Exactly what a prior run's plan-catalog seeding (today: payments)
    // would have left behind -- created directly here via the same real
    // exported helper, without touching payments at all.
    await ensureMigrationSeedAdmin(pgPool);
    assert.equal(await profileCount(), 1, 'setup: the seed-admin profile row must exist before this run starts');

    const run = runOrchestratorCLI(['--execute']);
    assert.ok(run.json, `OLD BUG: the seed-admin's own profile row alone blocked the run -- stderr: ${run.stderr}`);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.json.ok, true);
    assert.equal(run.json.status, 'reconciled');
  });

  await test('item 1: --compensate now actually reaches compensation with pre-existing attributable data, and removes nothing', async () => {
    await resetAll();
    const email = 'compensate-user@example.invalid';
    const sourceDoc = { _id: new mongoose.Types.ObjectId(), email, role: 'student' };
    const id = await seedLedgeredAccount(sourceDoc, 'mongodb');
    await mongoose.connection.collection('users').insertOne(sourceDoc);

    const profilesBefore = await profileCount();
    const authUsersBefore = await authUserCount();

    const run = runOrchestratorCLI(['--compensate', '--execute']);
    assert.ok(run.json, `OLD BUG: --compensate was blocked by the same pristine-only preflight -- stderr: ${run.stderr}`);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.json.ok, true, 'compensate() re-invokes the idempotent forward path -- an already-existing, attributable account must succeed cleanly');

    // The resolved, already-reviewed design: compensate() never deletes a
    // pre-existing account, attributable or not -- it only re-invokes the
    // idempotent forward path. Row counts must be IDENTICAL before/after,
    // and the exact same account must still be the one that exists.
    assert.equal(await profileCount(), profilesBefore, 'compensate() must never delete a profiles row');
    assert.equal(await authUserCount(), authUsersBefore, 'compensate() must never delete an auth.users row');
    const stillThere = await pgPool.query('SELECT 1 FROM profiles WHERE id = $1', [id]);
    assert.equal(stillThere.rows.length, 1, 'the original attributable account must still be the exact one present, untouched');
  });

  await test('item 1 + item 3: an UNKNOWN, unattributed pre-existing row still fails closed -- in BOTH --execute and --compensate --execute', async () => {
    await resetAll();
    // Not tagged migrated_from, not the migration-seed admin identity --
    // exactly the kind of real, unrelated pre-existing account this
    // preflight exists to protect against.
    await seedUntaggedAccount('unknown-preexisting@example.invalid');

    const runExecute = runOrchestratorCLI(['--execute']);
    assert.equal(runExecute.json, null, 'an unknown row must still crash the preflight BEFORE any JSON result is ever printed');
    assert.equal(runExecute.code, 1);
    assert.match(runExecute.stderr, /FATAL/);
    assert.match(runExecute.stderr, /not attributable to this migration/);

    const runCompensate = runOrchestratorCLI(['--compensate', '--execute']);
    assert.equal(runCompensate.json, null, 'the SAME unattributed-data refusal must apply to --compensate -- it is not a bypass');
    assert.equal(runCompensate.code, 1);
    assert.match(runCompensate.stderr, /FATAL/);
    assert.match(runCompensate.stderr, /not attributable to this migration/);
  });

  await test('round 6 item 1: --compensate --execute with mixed valid + normalized-invalid users performs zero writes', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertMany([
      { email: 'valid-compensate@example.invalid', role: 'student', subscription: { plan: 'Starter' } },
      { email: ' BAD-EMAIL ', role: 'student' },
    ]);
    const before = await migrationWriteCounts();
    const run = runOrchestratorCLI(['--compensate', '--execute']);
    const after = await migrationWriteCounts();
    assert.ok(run.json, run.stderr);
    assert.equal(run.code, 1);
    assert.equal(run.json.ok, false);
    assert.deepEqual(after, before, 'compensation must inherit the worker zero-write validation gate');
  });

  await test('round 6 item 1: --compensate --execute with a dangling relationship performs zero writes', async () => {
    await resetAll();
    await mongoose.connection.collection('users').insertOne({
      email: 'dangling-compensate@example.invalid', role: 'student', teacher: 'missing-source-id',
    });
    const before = await migrationWriteCounts();
    const run = runOrchestratorCLI(['--compensate', '--execute']);
    const after = await migrationWriteCounts();
    assert.ok(run.json, run.stderr);
    assert.equal(run.code, 1);
    assert.deepEqual(after, before);
  });

  await test('round 6 item 2: production CLI forwards one approved disposition through plan, execute, and compensate', async () => {
    const modes = [[], ['--execute'], ['--compensate', '--execute']];
    for (const mode of modes) {
      await resetAll();
      const email = `approved-${mode.join('-') || 'plan'}@example.invalid`;
      const sourceDoc = { _id: new mongoose.Types.ObjectId(), email, role: 'student', teacher: 'missing-source-id' };
      if (mode.includes('--execute')) await seedLedgeredAccount(sourceDoc);
      await mongoose.connection.collection('users').insertOne(sourceDoc);
      const dispositions = writeDispositions([{
        signature: `relationship:teacher:${email}:missing-source-id`, reason: 'reviewed fixture gap',
      }]);
      const run = runOrchestratorCLI([...mode, `--approved-dispositions=${dispositions}`]);
      assert.ok(run.json, run.stderr);
      assert.equal(run.code, 0, run.stderr);
      assert.equal(run.json.ok, true);
      const saga = JSON.parse(fs.readFileSync(run.json.saga, 'utf8'));
      const binding = saga.steps.find((step) => step.step === 'approved_dispositions' && step.status === 'bound');
      assert.equal(binding.hash, sha256File(dispositions));
      assert.equal(binding.approvedBy, 'round-6-cli-test');
      assert.equal(binding.approvedAt, '2026-09-10T00:00:00.000Z');
    }
  });

  await test('round 6 item 2: production CLI rejects duplicate flags, malformed timestamps, and unused signatures', async () => {
    await resetAll();
    const empty = writeDispositions([]);
    const duplicate = runOrchestratorCLI([`--approved-dispositions=${empty}`, `--approved-dispositions=${empty}`]);
    assert.equal(duplicate.code, 1);
    assert.match(duplicate.stderr, /more than once/);

    const malformed = writeDispositions([], { approvedAt: 'not-an-instant' });
    const badTimestamp = runOrchestratorCLI([`--approved-dispositions=${malformed}`]);
    assert.equal(badTimestamp.code, 1);
    assert.match(badTimestamp.stderr, /valid ISO/);

    const unused = writeDispositions([{ signature: 'relationship:teacher:unused@example.invalid:none', reason: 'stale' }]);
    const stale = runOrchestratorCLI([`--approved-dispositions=${unused}`]);
    assert.equal(stale.code, 1);
    assert.ok(stale.json, stale.stderr);
    assert.equal(stale.json.failedAt, 'users_and_relationships_preflight');
    assert.match(stale.json.stderr, /matched no real problem/);
  });

  await pgPool.end();
  await mongoose.disconnect();

  console.log('\n=== CLEANUP ===');
  await runCommand('docker', ['rm', '-f', MONGO_NAME]);
  await runCommand('docker', ['rm', '-f', PG_NAME]);
  await runCommand('docker', ['rm', '-f', GOTRUE_NAME]);
  const mongoGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${MONGO_NAME}$`, '--format', '{{.Names}}']);
  const pgGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${PG_NAME}$`, '--format', '{{.Names}}']);
  const gotrueGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${GOTRUE_NAME}$`, '--format', '{{.Names}}']);
  if (mongoGone.stdout.trim() || pgGone.stdout.trim() || gotrueGone.stdout.trim()) {
    console.error('CRITICAL: cleanup not verified -- a test container is still present');
    process.exitCode = 1;
  } else {
    console.log('cleanup verified: all three test containers absent.');
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

// A disposable, minimal (busybox httpd) container serving the one static
// GoTrue endpoint these tests ever need (GET /auth/v1/settings ->
// {disable_signup:true}) -- deliberately NOT an in-process Node HTTP
// server: this environment's sandbox blocks a spawned child process from
// reaching a plain loopback server bound by its own parent process
// (confirmed by direct experiment), while a Docker-mapped 127.0.0.1 port
// works fine, exactly like the disposable Mongo/Postgres containers
// above. The response content-type does not matter -- verifySignupsOff()
// only checks res.ok and parses the body with res.json(), which does not
// inspect headers.
async function startDisposableGotrueStub() {
  const run = await runCommand('docker', [
    'run', '--rm', '-d', '--name', GOTRUE_NAME, '-p', '127.0.0.1::80', 'busybox',
    'sh', '-c', `mkdir -p /www/auth/v1 && printf '{"disable_signup":true}' > /www/auth/v1/settings && httpd -f -p 80 -h /www`,
  ]);
  if (run.code !== 0) throw new Error(`docker run (gotrue stub) failed: ${run.stderr}`);
  let port = null;
  for (let i = 0; i < 15; i++) {
    const p = await runCommand('docker', ['port', GOTRUE_NAME, '80/tcp']);
    const m = p.stdout.trim().match(/:(\d+)\s*$/);
    if (p.code === 0 && m) { port = m[1]; break; }
    await sleep(500);
  }
  if (!port) throw new Error('could not discover gotrue-stub host port');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/v1/settings`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return port;
    } catch { /* not ready yet */ }
    await sleep(500);
  }
  throw new Error('gotrue-stub did not become ready in time');
}

main().catch(async (err) => {
  console.error('[orchestrator-cli-resume-compensate.test] harness crashed:', err);
  await runCommand('docker', ['rm', '-f', MONGO_NAME]).catch(() => {});
  await runCommand('docker', ['rm', '-f', PG_NAME]).catch(() => {});
  await runCommand('docker', ['rm', '-f', GOTRUE_NAME]).catch(() => {});
  process.exitCode = 1;
});
