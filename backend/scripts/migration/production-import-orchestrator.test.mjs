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

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[production-import-orchestrator.test] harness crashed:', err);
  process.exitCode = 1;
});
