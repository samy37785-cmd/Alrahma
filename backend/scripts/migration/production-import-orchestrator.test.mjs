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
import {
  TARGET_SUPABASE_REF,
  SOURCE_DATABASE,
  computeConfirmToken,
  verifyApprovalManifest,
  verifyFreshBackup,
  computeDomainWorkerPlan,
  runImport,
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

  fs.rmSync(tmpDir, { recursive: true, force: true });

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

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[production-import-orchestrator.test] harness crashed:', err);
  process.exitCode = 1;
});
