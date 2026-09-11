#!/usr/bin/env node
// Stage 2J-B Part G/J — pure-logic unit tests for the production import
// orchestrator's approval/backup verification, no live Postgres/Mongo/
// GoTrue required (those paths — verifyMigrationJournal, verifySignupsOff,
// verifyNoUnrecordedData, the advisory lock, and the full runImport()
// sequencing — are exercised by the real-data offline rehearsal in
// Part H instead, which does have a live local stack).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TARGET_SUPABASE_REF,
  SOURCE_DATABASE,
  computeConfirmToken,
  verifyApprovalManifest,
  verifyFreshBackup,
  computeDomainWorkerPlan,
  runImport,
  compensate,
  parseCliArgs,
} from './production-import-orchestrator.mjs';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.message}`);
  }
}

function sha256Of(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main() {
  await test('hardcoded targets are the exact real project ref and source database — never overridable', () => {
    assert.equal(TARGET_SUPABASE_REF, 'difzynyphojgisrfvrkd');
    assert.equal(SOURCE_DATABASE, 'al-rahma');
  });

  await test('computeConfirmToken is deterministic and changes with any one input', () => {
    const base = { projectRef: 'ref1', gitSha: 'sha1', backupHash: 'hash1' };
    const a = computeConfirmToken(base);
    const b = computeConfirmToken(base);
    assert.equal(a, b);
    assert.notEqual(a, computeConfirmToken({ ...base, projectRef: 'ref2' }));
    assert.notEqual(a, computeConfirmToken({ ...base, gitSha: 'sha2' }));
    assert.notEqual(a, computeConfirmToken({ ...base, backupHash: 'hash2' }));
  });

  await test('verifyApprovalManifest accepts a correctly-constructed manifest', () => {
    const projectRef = TARGET_SUPABASE_REF;
    const gitSha = 'deadbeef'.repeat(5);
    const backupHash = 'cafebabe'.repeat(5);
    const manifest = {
      projectRef, gitSha, backupHash,
      confirmToken: computeConfirmToken({ projectRef, gitSha, backupHash }),
      approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
    };
    assert.equal(verifyApprovalManifest(manifest, { gitSha, backupHash }), true);
  });

  await test('verifyApprovalManifest rejects a manifest for the wrong project ref', () => {
    const gitSha = 'a'.repeat(40), backupHash = 'b'.repeat(64);
    const manifest = {
      projectRef: 'some-other-project', gitSha, backupHash,
      confirmToken: computeConfirmToken({ projectRef: 'some-other-project', gitSha, backupHash }),
      approvedBy: 'x', approvedAt: new Date().toISOString(),
    };
    assert.throws(() => verifyApprovalManifest(manifest, { gitSha, backupHash }), /projectRef/);
  });

  await test('verifyApprovalManifest rejects a manifest approved for a different git SHA than HEAD', () => {
    const projectRef = TARGET_SUPABASE_REF, backupHash = 'c'.repeat(64);
    const manifest = {
      projectRef, gitSha: 'old-sha', backupHash,
      confirmToken: computeConfirmToken({ projectRef, gitSha: 'old-sha', backupHash }),
      approvedBy: 'x', approvedAt: new Date().toISOString(),
    };
    assert.throws(() => verifyApprovalManifest(manifest, { gitSha: 'current-sha', backupHash }), /git SHA/);
  });

  await test('verifyApprovalManifest rejects a manifest whose backupHash does not match the backup actually present', () => {
    const projectRef = TARGET_SUPABASE_REF, gitSha = 'd'.repeat(40);
    const manifest = {
      projectRef, gitSha, backupHash: 'approved-hash',
      confirmToken: computeConfirmToken({ projectRef, gitSha, backupHash: 'approved-hash' }),
      approvedBy: 'x', approvedAt: new Date().toISOString(),
    };
    assert.throws(() => verifyApprovalManifest(manifest, { gitSha, backupHash: 'different-hash' }), /backupHash/);
  });

  await test('verifyApprovalManifest rejects a hand-edited manifest whose confirmToken no longer matches', () => {
    const projectRef = TARGET_SUPABASE_REF, gitSha = 'e'.repeat(40), backupHash = 'f'.repeat(64);
    const manifest = {
      projectRef, gitSha, backupHash,
      confirmToken: 'not-the-real-token',
      approvedBy: 'x', approvedAt: new Date().toISOString(),
    };
    assert.throws(() => verifyApprovalManifest(manifest, { gitSha, backupHash }), /confirmToken/);
  });

  await test('verifyApprovalManifest rejects a manifest missing a required field', () => {
    assert.throws(() => verifyApprovalManifest({ projectRef: TARGET_SUPABASE_REF }, { gitSha: 'x', backupHash: 'y' }), /missing required field/);
  });

  // -----------------------------------------------------------------
  // verifyFreshBackup — real temp files, no mocking.
  // -----------------------------------------------------------------
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage2jb-orch-test-'));
  const backupFile = path.join(tmpDir, 'mongo-al-rahma.archive');
  fs.writeFileSync(backupFile, 'fixture-backup-content');

  function writeSidecar(overrides) {
    const sidecarPath = path.join(tmpDir, `sidecar-${crypto.randomUUID()}.json`);
    const base = { filePath: backupFile, sha256: sha256Of(backupFile), createdAt: new Date().toISOString() };
    fs.writeFileSync(sidecarPath, JSON.stringify({ ...base, ...overrides }));
    return sidecarPath;
  }

  await test('verifyFreshBackup accepts a real, fresh, unmodified backup file', () => {
    const result = verifyFreshBackup(writeSidecar({}), { maxAgeHours: 24 });
    assert.equal(result.filePath, backupFile);
  });

  await test('verifyFreshBackup rejects a stale backup', () => {
    const sidecarPath = writeSidecar({ createdAt: new Date(Date.now() - 48 * 3_600_000).toISOString() });
    assert.throws(() => verifyFreshBackup(sidecarPath, { maxAgeHours: 24 }), /old/);
  });

  await test('verifyFreshBackup rejects a backup whose file no longer matches its recorded hash (tampered/replaced)', () => {
    const sidecarPath = writeSidecar({ sha256: 'not-the-real-hash' });
    assert.throws(() => verifyFreshBackup(sidecarPath, { maxAgeHours: 24 }), /does not match/);
  });

  await test('verifyFreshBackup rejects a missing manifest file', () => {
    assert.throws(() => verifyFreshBackup(path.join(tmpDir, 'does-not-exist.json')), /no backup manifest/);
  });

  // Stage 2J-B Part H, review round 2: operator-acknowledged deferral
  // only -- nothing is ever excluded by a hardcoded default.
  await test('computeDomainWorkerPlan excludes and defers NOTHING by default', () => {
    const { excludeArg, deferred } = computeDomainWorkerPlan();
    assert.equal(excludeArg, null);
    assert.deepEqual(deferred, []);
  });

  await test('computeDomainWorkerPlan defers exactly the domain(s) the operator names, with a canned reason for a known one', () => {
    const result = computeDomainWorkerPlan({ deferDomains: ['payments'] });
    assert.equal(result.excludeArg, 'payments');
    assert.equal(result.deferred.length, 1);
    assert.equal(result.deferred[0].domain, 'payments');
    assert.match(result.deferred[0].reason, /DEFERRED_BY_OPERATOR/);
    assert.match(result.deferred[0].reason, /paymob/);
  });

  await test('computeDomainWorkerPlan can defer a domain with no canned reason on file, without rejecting it', () => {
    const result = computeDomainWorkerPlan({ deferDomains: ['courses'] });
    assert.equal(result.excludeArg, 'courses');
    assert.equal(result.deferred[0].domain, 'courses');
    assert.match(result.deferred[0].reason, /DEFERRED_BY_OPERATOR/);
    assert.match(result.deferred[0].reason, /no canned reason/);
  });

  await test('computeDomainWorkerPlan deduplicates a repeated domain name', () => {
    const result = computeDomainWorkerPlan({ deferDomains: ['payments', 'payments'] });
    assert.equal(result.excludeArg, 'payments');
    assert.equal(result.deferred.length, 1);
  });

  await test('computeDomainWorkerPlan never mutates its input array', () => {
    const input = ['payments'];
    computeDomainWorkerPlan({ deferDomains: input });
    assert.deepEqual(input, ['payments']);
  });

  // -----------------------------------------------------------------
  // Stage 2J-B Part H, review round 3, item 1: BOTH the user-migration
  // plan/preflight AND the full domain dry-run must run BEFORE either
  // one is ever allowed to execute/write. Proven purely in-process, no
  // live Postgres/Mongo/GoTrue needed, via runWorkerFn (an injectable
  // stand-in for the real child-process spawn used ONLY by tests) --
  // this asserts the exact call sequence runImport() actually issues.
  // -----------------------------------------------------------------

  function makeRecordingWorker(responses) {
    const calls = [];
    const fn = (scriptPath, args) => {
      calls.push({ args: [...args] });
      const r = responses[calls.length - 1] ?? { code: 0 };
      return { code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    };
    fn.calls = calls;
    return fn;
  }

  await test('runImport (--plan): only the two preflight/dry-run calls ever happen, neither ever carries --execute', async () => {
    const runWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 0 }]);
    const result = await runImport({ pgClient: null, execute: false, runWorkerFn });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'reconciled');
    assert.equal(runWorkerFn.calls.length, 2, 'a --plan run must never call more than the two preflight steps');
    assert.deepEqual(runWorkerFn.calls[0].args, [], 'step 1 must be the user-migration preflight, with no --execute');
    assert.deepEqual(runWorkerFn.calls[1].args, ['--domain=all', '--dry-run'], 'step 2 must be the domain dry-run preflight');
  });

  await test('runImport (--execute, both preflights pass): preflights run FIRST, in full, before either execute call', async () => {
    const runWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 0 }, { code: 0 }, { code: 0 }]);
    const result = await runImport({ pgClient: null, execute: true, runWorkerFn });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'reconciled');
    assert.equal(runWorkerFn.calls.length, 4, 'an --execute run must issue exactly 4 calls: 2 preflights + 2 real writes');
    assert.deepEqual(runWorkerFn.calls[0].args, [], 'call 1: user-migration preflight, NOT --execute');
    assert.deepEqual(runWorkerFn.calls[1].args, ['--domain=all', '--dry-run'], 'call 2: domain preflight, dry-run');
    assert.deepEqual(runWorkerFn.calls[2].args, ['--execute'], 'call 3 (only after both preflights passed): user-migration for real');
    assert.deepEqual(runWorkerFn.calls[3].args, ['--domain=all'], 'call 4 (only after both preflights passed): domains for real, no --dry-run');
  });

  await test('runImport (--execute): a failing user-migration preflight stops EVERYTHING -- zero further calls, zero writes anywhere', async () => {
    const runWorkerFn = makeRecordingWorker([{ code: 1, stderr: 'boom' }]);
    const result = await runImport({ pgClient: null, execute: true, runWorkerFn });
    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'users_and_relationships_preflight');
    assert.equal(runWorkerFn.calls.length, 1, 'the domain preflight, and both execute calls, must never even be attempted');
  });

  await test('runImport (--execute): a failing domain dry-run preflight stops BOTH executes -- neither users nor domains ever write', async () => {
    const runWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 1, stderr: 'a domain would fail' }]);
    const result = await runImport({ pgClient: null, execute: true, runWorkerFn });
    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'mongo_domains_preflight');
    assert.equal(runWorkerFn.calls.length, 2, 'neither the user-migration --execute call nor the domain --execute call may ever run after this');
  });

  await test('runImport (--plan): a failing user-migration preflight still stops before the domain preflight even runs', async () => {
    const runWorkerFn = makeRecordingWorker([{ code: 1, stderr: 'boom' }]);
    const result = await runImport({ pgClient: null, execute: false, runWorkerFn });
    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'users_and_relationships_preflight');
    assert.equal(runWorkerFn.calls.length, 1);
  });

  // -----------------------------------------------------------------
  // Review round 3 correction: the comment claiming a caller checking
  // only `ok` could never mistake 'completed_with_deferred' for
  // 'reconciled' was itself false -- `ok` is `true` for both. This
  // asserts the actually-true property: `status`/`deferredDomains` are
  // what distinguish them, `ok` alone cannot.
  // -----------------------------------------------------------------

  await test('runImport: `ok` is true for BOTH reconciled and completed_with_deferred -- only `status`/`deferredDomains` distinguish them', async () => {
    const plainRunWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 0 }]);
    const plain = await runImport({ pgClient: null, execute: false, runWorkerFn: plainRunWorkerFn });
    const deferredRunWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 0 }]);
    const deferred = await runImport({ pgClient: null, execute: false, deferDomains: ['payments'], runWorkerFn: deferredRunWorkerFn });

    assert.equal(plain.ok, true);
    assert.equal(deferred.ok, true);
    assert.equal(plain.ok, deferred.ok, '`ok` alone is identical for both -- it cannot be what tells them apart');
    assert.equal(plain.status, 'reconciled');
    assert.equal(deferred.status, 'completed_with_deferred');
    assert.deepEqual(plain.deferredDomains, []);
    assert.deepEqual(deferred.deferredDomains, ['payments']);
  });

  // -----------------------------------------------------------------
  // Review round 4, item 2: with migrate-users-to-supabase-auth.mjs now
  // exiting non-zero for a genuine document-level failure (users.errors/
  // admins.errors/subscriptions.failed/reconciliation.consistent -- see
  // its own changelog and migrate-users-to-supabase-auth.test.mjs), this
  // orchestrator must react to that non-zero exit correctly in BOTH the
  // --plan preflight call and the real --execute call: the sequence
  // stops immediately, and the run can never be recorded as 'reconciled'
  // (or 'completed_with_deferred') -- `result.status` simply does not
  // exist on an `ok:false` result, structurally, not by convention.
  // -----------------------------------------------------------------

  await test('runImport: a user-migration PLAN-mode document-level failure stops the sequence before the domain preflight, and is never recorded as reconciled', async () => {
    const runWorkerFn = makeRecordingWorker([{ code: 1, stdout: JSON.stringify({ admins: { errors: [{ email: 'x', message: 'unmapped AdminUser role' }] } }) }]);
    const result = await runImport({ pgClient: null, execute: false, runWorkerFn });
    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'users_and_relationships_preflight');
    assert.equal(result.status, undefined, 'an ok:false result must never carry a status field at all -- it cannot be mistaken for reconciled or completed_with_deferred');
    assert.equal(runWorkerFn.calls.length, 1, 'the domain preflight must never even be attempted after a user-migration plan failure');
  });

  await test('runImport: a user-migration EXECUTE-mode document-level failure stops the sequence before any domain write, and is never recorded as reconciled', async () => {
    const runWorkerFn = makeRecordingWorker([
      { code: 0 }, // user-migration preflight: passes
      { code: 0 }, // domain dry-run preflight: passes
      { code: 1, stdout: JSON.stringify({ subscriptions: { failed: [{ email: 'x', reason: 'unresolvable plan name' }] } }) }, // user-migration --execute: a real document-level failure
    ]);
    const result = await runImport({ pgClient: null, execute: true, runWorkerFn });
    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'users_and_relationships');
    assert.equal(result.status, undefined);
    assert.equal(runWorkerFn.calls.length, 3, 'the domain --execute call must never be attempted after users_and_relationships fails for real');
  });

  function writeDispositions(overrides = {}) {
    const filePath = path.join(tmpDir, `dispositions-${crypto.randomUUID()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      approvedBy: 'round-6-reviewer',
      approvedAt: '2026-09-10T00:00:00.000Z',
      items: [],
      ...overrides,
    }));
    return filePath;
  }

  await test('approved dispositions: plan/execute receive the SAME private snapshot path (never the operator\'s own path), and the snapshot is cleaned up afterward', async () => {
    // PR #70 review round 7, item 5: the operator's own path is read ONCE
    // and copied into a private, orchestrator-owned snapshot -- every
    // child invocation is forwarded the SNAPSHOT path, never the original.
    const dispositionPath = writeDispositions();
    const originalHash = sha256Of(dispositionPath);
    const runWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 0 }, { code: 0 }, { code: 0 }]);
    const result = await runImport({ pgClient: null, execute: true, runWorkerFn, approvedDispositionsPath: dispositionPath });

    assert.equal(runWorkerFn.calls[0].args.length, 1);
    const forwardedArg = runWorkerFn.calls[0].args[0];
    assert.match(forwardedArg, /^--approved-dispositions=/);
    const snapshotPath = forwardedArg.slice('--approved-dispositions='.length);
    assert.notEqual(snapshotPath, dispositionPath, 'the child must never be given the operator\'s own mutable path');
    assert.match(path.basename(snapshotPath), /^approved-dispositions-snapshot-/);
    assert.deepEqual(runWorkerFn.calls[2].args, ['--execute', `--approved-dispositions=${snapshotPath}`], 'plan and execute must receive the exact SAME snapshot path');

    const saga = JSON.parse(fs.readFileSync(result.saga, 'utf8'));
    const binding = saga.steps.find((s) => s.step === 'approved_dispositions' && s.status === 'bound');
    assert.equal(binding.hash, originalHash, 'the snapshot must be a byte-faithful copy of the operator\'s original file');
    assert.equal(binding.path, dispositionPath, 'the saga still records the ORIGINAL path for audit purposes');
    assert.equal(binding.snapshotPath, snapshotPath);
    assert.equal(binding.approvedBy, 'round-6-reviewer');
    assert.equal(binding.approvedAt, '2026-09-10T00:00:00.000Z');

    assert.equal(fs.existsSync(snapshotPath), false, 'the private snapshot must be deleted (and verified gone) once the run finishes');
    assert.equal(fs.existsSync(dispositionPath), true, 'the operator\'s own original file is never touched or deleted');
  });

  await test('approved dispositions: mutating the OPERATOR\'S ORIGINAL file after the snapshot was taken has no effect -- the run only ever reads the snapshot', async () => {
    // This is the direct proof of what item 5 actually closes: before
    // round 7, re-hashing the SAME operator path twice (once at bind time,
    // once right before execute) still left a live TOCTOU window against
    // whatever the child process itself read a moment later. Now the
    // child never reads the operator's path at all -- mutating it after
    // snapshot creation is provably inert.
    const dispositionPath = writeDispositions();
    const runWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 0 }, { code: 0 }, { code: 0 }]);
    const base = runWorkerFn.bind(null);
    let calls = 0;
    const mutatingWorker = (...args) => {
      calls += 1;
      if (calls === 1) fs.appendFileSync(dispositionPath, ' '); // mutate the ORIGINAL right after the snapshot was taken from it
      return base(...args);
    };
    mutatingWorker.calls = runWorkerFn.calls;
    const result = await runImport({ pgClient: null, execute: true, runWorkerFn: mutatingWorker, approvedDispositionsPath: dispositionPath });
    assert.equal(result.ok, true, 'mutating the operator\'s own original file after the snapshot was taken must never fail the run');
    assert.equal(runWorkerFn.calls.length, 4);
  });

  await test('approved dispositions: mutating the PRIVATE SNAPSHOT itself between the preflight and execute passes is rejected before either execute worker runs', async () => {
    const dispositionPath = writeDispositions();
    const runWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 0 }]);
    const base = runWorkerFn.bind(null);
    let snapshotPath = null;
    let calls = 0;
    const mutatingWorker = (scriptPath, args) => {
      calls += 1;
      const dispositionArg = args.find((a) => a.startsWith('--approved-dispositions='));
      if (dispositionArg) snapshotPath = dispositionArg.slice('--approved-dispositions='.length);
      if (calls === 2 && snapshotPath) fs.appendFileSync(snapshotPath, ' ');
      return base(scriptPath, args);
    };
    mutatingWorker.calls = runWorkerFn.calls;
    const result = await runImport({ pgClient: null, execute: true, runWorkerFn: mutatingWorker, approvedDispositionsPath: dispositionPath });
    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'approved_dispositions_integrity');
    assert.equal(runWorkerFn.calls.length, 2, 'neither execute worker may ever run once the snapshot itself is found mutated');
    assert.equal(fs.existsSync(snapshotPath), false, 'the (now-mutated) snapshot is still cleaned up on the way out');
  });

  await test('approved dispositions: a snapshot deleted out from under the run before the execute pass is treated exactly like a mutation -- fail closed, never silently skipped', async () => {
    const dispositionPath = writeDispositions();
    const runWorkerFn = makeRecordingWorker([{ code: 0 }, { code: 0 }]);
    const base = runWorkerFn.bind(null);
    let snapshotPath = null;
    let calls = 0;
    const deletingWorker = (scriptPath, args) => {
      calls += 1;
      const dispositionArg = args.find((a) => a.startsWith('--approved-dispositions='));
      if (dispositionArg) snapshotPath = dispositionArg.slice('--approved-dispositions='.length);
      if (calls === 2 && snapshotPath) fs.rmSync(snapshotPath, { force: true });
      return base(scriptPath, args);
    };
    deletingWorker.calls = runWorkerFn.calls;
    const result = await runImport({ pgClient: null, execute: true, runWorkerFn: deletingWorker, approvedDispositionsPath: dispositionPath });
    assert.equal(result.ok, false);
    assert.equal(result.failedAt, 'approved_dispositions_integrity');
    assert.match(result.stderr, /missing/);
  });

  await test('approved dispositions: malformed timestamp and duplicate signatures are rejected before worker invocation', async () => {
    const worker = makeRecordingWorker([]);
    await assert.rejects(
      () => runImport({ pgClient: null, execute: false, runWorkerFn: worker, approvedDispositionsPath: writeDispositions({ approvedAt: 'tomorrow' }) }),
      /valid ISO/
    );
    await assert.rejects(
      () => runImport({
        pgClient: null, execute: false, runWorkerFn: worker,
        approvedDispositionsPath: writeDispositions({ items: [{ signature: 'x', reason: 'a' }, { signature: 'x', reason: 'b' }] }),
      }),
      /duplicate signature/
    );
    assert.equal(worker.calls.length, 0);
  });

  await test('orchestrator CLI parser rejects duplicate/bare disposition flags and preserves paths containing equals signs', () => {
    assert.throws(() => parseCliArgs(['--approved-dispositions=a', '--approved-dispositions=b']), /more than once/);
    assert.throws(() => parseCliArgs(['--approved-dispositions']), /non-empty/);
    assert.equal(parseCliArgs(['--approved-dispositions=C:\\tmp\\a=b.json'])['approved-dispositions'], 'C:\\tmp\\a=b.json');
  });

  // -----------------------------------------------------------------
  // PR #70 review round 7, item 1: strict CLI parser -- explicit
  // allowlist, boolean flags reject ANY "=value" (never coerced from a
  // truthy string), and an unknown/typo'd flag is a hard error, never a
  // silent no-op.
  // -----------------------------------------------------------------

  await test('CLI parser: --execute=false is REJECTED, never silently coerced to true (the exact truthy-string bug this round closes)', () => {
    assert.throws(() => parseCliArgs(['--execute=false']), /boolean flag/);
    assert.throws(() => parseCliArgs(['--execute=true']), /boolean flag/);
    assert.throws(() => parseCliArgs(['--execute=']), /boolean flag/);
    assert.throws(() => parseCliArgs(['--execute=0']), /boolean flag/);
  });

  await test('CLI parser: --compensate=false is REJECTED the same way', () => {
    assert.throws(() => parseCliArgs(['--compensate=false']), /boolean flag/);
  });

  await test('CLI parser: an unknown/typo\'d flag (e.g. --compansate) is a hard error, never a silent no-op', () => {
    assert.throws(() => parseCliArgs(['--compansate']), /unknown flag/);
    assert.throws(() => parseCliArgs(['--compansate', '--execute']), /unknown flag/);
  });

  await test('CLI parser: a bare --execute / --compensate (no "=value") is accepted and parses to exactly `true`', () => {
    assert.equal(parseCliArgs(['--execute']).execute, true);
    assert.equal(parseCliArgs(['--compensate']).compensate, true);
  });

  await test('CLI: --compansate --execute (typo) never reaches any DB/network access -- fails during argument parsing, before main() reads a single env var or opens a connection', async () => {
    // Live CLI proof, not just the pure parser above: spawn the real
    // script with a typo'd flag and an env that would hang/error loudly
    // if any DB connection were ever attempted (no MIGRATION_DB_URL at
    // all -- main() would normally fail with "MIGRATION_DB_URL must be
    // set", a LATER check than CLI parsing; seeing the "unknown flag"
    // error instead proves parsing happened first and nothing after it
    // ever ran).
    const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'production-import-orchestrator.mjs');
    const cleanEnv = { ...process.env };
    delete cleanEnv.MIGRATION_DB_URL;
    delete cleanEnv.SUPABASE_URL;
    delete cleanEnv.SUPABASE_SERVICE_ROLE_KEY;
    const result = spawnSync(process.execPath, [scriptPath, '--compansate', '--execute'], {
      encoding: 'utf8',
      env: cleanEnv,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown flag/);
    assert.doesNotMatch(result.stderr, /MIGRATION_DB_URL must be set/, 'must never reach the env-var check -- parsing must fail first');
  });

  await test('compensate forwards the SAME private snapshot path in both plan and execute modes, cleaned up afterward', async () => {
    const dispositionPath = writeDispositions();
    const originalHash = sha256Of(dispositionPath);

    const planWorker = makeRecordingWorker([{ code: 0 }]);
    const plan = await compensate({ pgClient: null, execute: false, runWorkerFn: planWorker, approvedDispositionsPath: dispositionPath });
    assert.equal(plan.ok, true);
    const planArg = planWorker.calls[0].args[0];
    assert.match(planArg, /^--approved-dispositions=/);
    const planSnapshotPath = planArg.slice('--approved-dispositions='.length);
    assert.notEqual(planSnapshotPath, dispositionPath);
    assert.equal(fs.existsSync(planSnapshotPath), false, 'compensate must clean up its own snapshot after returning');

    const executeWorker = makeRecordingWorker([{ code: 0 }]);
    const executeResult = await compensate({ pgClient: null, execute: true, runWorkerFn: executeWorker, approvedDispositionsPath: dispositionPath });
    assert.equal(executeResult.ok, true);
    const execArgs = executeWorker.calls[0].args;
    assert.equal(execArgs[0], '--execute');
    assert.match(execArgs[1], /^--approved-dispositions=/);
    const execSnapshotPath = execArgs[1].slice('--approved-dispositions='.length);
    assert.notEqual(execSnapshotPath, dispositionPath);
    assert.equal(fs.existsSync(execSnapshotPath), false);

    const saga = JSON.parse(fs.readFileSync(executeResult.saga, 'utf8'));
    const binding = saga.steps.find((s) => s.step === 'approved_dispositions' && s.status === 'bound');
    assert.equal(binding.hash, originalHash);
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[production-import-orchestrator.test] harness crashed:', err);
  process.exitCode = 1;
});
