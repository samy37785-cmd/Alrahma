#!/usr/bin/env node
// Stage 2J-B — Production Enablement. Pure/unit tests for
// loadAndVerifyProductionAuthorization() and extractSupabaseProjectRef()
// -- no Docker, no real infrastructure. Injectable seams
// (verifyApprovalManifestFn/verifyFreshBackupFn/currentGitShaFn/env) make
// every precondition testable in isolation with plain objects/functions,
// exactly the pattern this directory already uses for its other pure
// exports (e.g. computeExitFailure()).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadAndVerifyProductionAuthorization,
  extractSupabaseProjectRef,
} from './production-authorization.mjs';
import { verifyApprovalManifest, verifyFreshBackup, computeConfirmToken, TARGET_SUPABASE_REF } from './production-approval.mjs';

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

const REAL_GIT_SHA = 'a'.repeat(40);
const REAL_BACKUP_HASH = 'b'.repeat(64);
function fakeVerifyFreshBackupFn() { return { filePath: '/fake/backup.gz', sha256: REAL_BACKUP_HASH, ageHours: 1 }; }
function fakeVerifyApprovalManifestFn() { return true; } // never actually called with wrong args in these tests
function fakeCurrentGitShaFn() { return REAL_GIT_SHA; }

function baseEnv(overrides = {}) {
  return {
    MIGRATION_PRODUCTION_MODE: '1',
    MIGRATION_APPROVAL_MANIFEST: '/fake/approval.json',
    MIGRATION_BACKUP_MANIFEST: '/fake/backup-manifest.json',
    SUPABASE_URL: `https://${TARGET_SUPABASE_REF}.supabase.co`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// extractSupabaseProjectRef()
// ---------------------------------------------------------------------

test('extractSupabaseProjectRef: a real Supabase URL extracts its project ref', () => {
  assert.equal(extractSupabaseProjectRef('https://difzynyphojgisrfvrkd.supabase.co'), 'difzynyphojgisrfvrkd');
  assert.equal(extractSupabaseProjectRef('https://difzynyphojgisrfvrkd.supabase.co/'), 'difzynyphojgisrfvrkd');
});

test('extractSupabaseProjectRef: a non-Supabase domain fails closed', () => {
  assert.throws(() => extractSupabaseProjectRef('https://evil.example.com'), /does not look like a real Supabase project URL/);
});

test('extractSupabaseProjectRef: a bare IP fails closed', () => {
  assert.throws(() => extractSupabaseProjectRef('http://127.0.0.1:5432'), /does not look like a real Supabase project URL/);
});

test('extractSupabaseProjectRef: a malformed URL fails closed', () => {
  assert.throws(() => extractSupabaseProjectRef('not a url at all'), /is not a valid URL/);
});

// ---------------------------------------------------------------------
// loadAndVerifyProductionAuthorization() -- closed by default.
// ---------------------------------------------------------------------

test('default (no MIGRATION_PRODUCTION_MODE): returns null, no checks attempted at all', () => {
  const result = loadAndVerifyProductionAuthorization({ env: {} });
  assert.equal(result, null);
});

test('MIGRATION_PRODUCTION_MODE set to anything other than exactly "1": returns null', () => {
  assert.equal(loadAndVerifyProductionAuthorization({ env: { MIGRATION_PRODUCTION_MODE: 'true' } }), null);
  assert.equal(loadAndVerifyProductionAuthorization({ env: { MIGRATION_PRODUCTION_MODE: 'yes' } }), null);
  assert.equal(loadAndVerifyProductionAuthorization({ env: { MIGRATION_PRODUCTION_MODE: '' } }), null);
});

// ---------------------------------------------------------------------
// MIGRATION_PRODUCTION_MODE=1 -- every precondition individually.
// ---------------------------------------------------------------------

test('MIGRATION_PRODUCTION_MODE=1 with no MIGRATION_APPROVAL_MANIFEST: throws', () => {
  assert.throws(
    () => loadAndVerifyProductionAuthorization({ env: { MIGRATION_PRODUCTION_MODE: '1' } }),
    /requires MIGRATION_APPROVAL_MANIFEST/,
  );
});

test('MIGRATION_PRODUCTION_MODE=1 with no MIGRATION_BACKUP_MANIFEST: throws', () => {
  assert.throws(
    () => loadAndVerifyProductionAuthorization({ env: { MIGRATION_PRODUCTION_MODE: '1', MIGRATION_APPROVAL_MANIFEST: '/x.json' } }),
    /requires MIGRATION_BACKUP_MANIFEST/,
  );
});

test('MIGRATION_PRODUCTION_MODE=1 with an approval manifest path that does not exist: throws', () => {
  assert.throws(
    () => loadAndVerifyProductionAuthorization({
      env: baseEnv({ MIGRATION_APPROVAL_MANIFEST: path.join(os.tmpdir(), `nonexistent-${crypto.randomUUID()}.json`) }),
      verifyFreshBackupFn: fakeVerifyFreshBackupFn,
    }),
    /does not exist/,
  );
});

test('MIGRATION_PRODUCTION_MODE=1 with no SUPABASE_URL: throws', () => {
  const tmpManifest = path.join(os.tmpdir(), `approval-${crypto.randomUUID()}.json`);
  fs.writeFileSync(tmpManifest, '{}');
  try {
    assert.throws(
      () => loadAndVerifyProductionAuthorization({
        env: { MIGRATION_PRODUCTION_MODE: '1', MIGRATION_APPROVAL_MANIFEST: tmpManifest, MIGRATION_BACKUP_MANIFEST: '/x.json' },
      }),
      /requires SUPABASE_URL/,
    );
  } finally {
    fs.rmSync(tmpManifest, { force: true });
  }
});

test('MIGRATION_PRODUCTION_MODE=1 with a SUPABASE_URL pointing at the WRONG project: throws, never proceeds to manifest checks', () => {
  const tmpManifest = path.join(os.tmpdir(), `approval-${crypto.randomUUID()}.json`);
  fs.writeFileSync(tmpManifest, '{}');
  let backupFnCalled = false;
  try {
    assert.throws(
      () => loadAndVerifyProductionAuthorization({
        env: baseEnv({ SUPABASE_URL: 'https://some-other-project-ref.supabase.co', MIGRATION_APPROVAL_MANIFEST: tmpManifest }),
        verifyFreshBackupFn: () => { backupFnCalled = true; return fakeVerifyFreshBackupFn(); },
      }),
      /does not match the hardcoded target/,
    );
    assert.equal(backupFnCalled, false, 'must fail on the project-ref mismatch BEFORE ever touching the backup manifest');
  } finally {
    fs.rmSync(tmpManifest, { force: true });
  }
});

test('MIGRATION_PRODUCTION_MODE=1 with a stale/invalid backup (verifyFreshBackupFn throws): propagates the real failure, never swallowed', () => {
  const tmpManifest = path.join(os.tmpdir(), `approval-${crypto.randomUUID()}.json`);
  fs.writeFileSync(tmpManifest, '{}');
  try {
    assert.throws(
      () => loadAndVerifyProductionAuthorization({
        env: baseEnv({ MIGRATION_APPROVAL_MANIFEST: tmpManifest }),
        verifyFreshBackupFn: () => { throw new Error('backup at /x is 40.0h old -- max allowed is 24h'); },
      }),
      /40\.0h old/,
    );
  } finally {
    fs.rmSync(tmpManifest, { force: true });
  }
});

test('MIGRATION_PRODUCTION_MODE=1 with a manifest that fails verifyApprovalManifest (wrong gitSha): propagates the real failure', () => {
  const tmpManifest = path.join(os.tmpdir(), `approval-${crypto.randomUUID()}.json`);
  fs.writeFileSync(tmpManifest, JSON.stringify({
    projectRef: TARGET_SUPABASE_REF, gitSha: 'c'.repeat(40), backupHash: REAL_BACKUP_HASH,
    confirmToken: computeConfirmToken({ projectRef: TARGET_SUPABASE_REF, gitSha: 'c'.repeat(40), backupHash: REAL_BACKUP_HASH }),
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }));
  try {
    assert.throws(
      () => loadAndVerifyProductionAuthorization({
        env: baseEnv({ MIGRATION_APPROVAL_MANIFEST: tmpManifest }),
        verifyFreshBackupFn: fakeVerifyFreshBackupFn,
        currentGitShaFn: fakeCurrentGitShaFn, // REAL_GIT_SHA, not 'c'.repeat(40)
        verifyApprovalManifestFn: verifyApprovalManifest, // the REAL function, not a stub
      }),
      /was approved for git SHA/,
    );
  } finally {
    fs.rmSync(tmpManifest, { force: true });
  }
});

test('MIGRATION_PRODUCTION_MODE=1 with EVERY precondition genuinely satisfied: returns the fully verified authorization object', () => {
  const tmpManifest = path.join(os.tmpdir(), `approval-${crypto.randomUUID()}.json`);
  fs.writeFileSync(tmpManifest, JSON.stringify({
    projectRef: TARGET_SUPABASE_REF, gitSha: REAL_GIT_SHA, backupHash: REAL_BACKUP_HASH,
    confirmToken: computeConfirmToken({ projectRef: TARGET_SUPABASE_REF, gitSha: REAL_GIT_SHA, backupHash: REAL_BACKUP_HASH }),
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }));
  try {
    const result = loadAndVerifyProductionAuthorization({
      env: baseEnv({ MIGRATION_APPROVAL_MANIFEST: tmpManifest }),
      verifyFreshBackupFn: fakeVerifyFreshBackupFn,
      currentGitShaFn: fakeCurrentGitShaFn,
      verifyApprovalManifestFn: verifyApprovalManifest,
    });
    assert.equal(result.verified, true);
    assert.equal(result.projectRef, TARGET_SUPABASE_REF);
    assert.equal(result.gitSha, REAL_GIT_SHA);
    assert.equal(result.backupHash, REAL_BACKUP_HASH);
  } finally {
    fs.rmSync(tmpManifest, { force: true });
  }
});

// ---------------------------------------------------------------------
// End-to-end with the REAL verifyFreshBackup() too (a real temp backup
// file, genuinely hashed and re-verified from disk) -- not just the
// approval-manifest half.
// ---------------------------------------------------------------------

test('end-to-end with REAL verifyFreshBackup() and REAL verifyApprovalManifest(): a genuinely fresh, correctly-hashed backup plus a matching manifest authorizes successfully', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-prodauth-'));
  const backupFile = path.join(tmpDir, 'mongodump.gz');
  fs.writeFileSync(backupFile, 'fake dump bytes, content irrelevant to this test');
  const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  const backupManifest = path.join(tmpDir, 'backup-manifest.json');
  fs.writeFileSync(backupManifest, JSON.stringify({ filePath: backupFile, sha256: backupHash, createdAt: new Date().toISOString() }));

  const approvalManifest = path.join(tmpDir, 'approval.json');
  fs.writeFileSync(approvalManifest, JSON.stringify({
    projectRef: TARGET_SUPABASE_REF, gitSha: REAL_GIT_SHA, backupHash,
    confirmToken: computeConfirmToken({ projectRef: TARGET_SUPABASE_REF, gitSha: REAL_GIT_SHA, backupHash }),
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }));

  try {
    const result = loadAndVerifyProductionAuthorization({
      env: baseEnv({ MIGRATION_APPROVAL_MANIFEST: approvalManifest, MIGRATION_BACKUP_MANIFEST: backupManifest }),
      verifyFreshBackupFn: verifyFreshBackup, // REAL function
      verifyApprovalManifestFn: verifyApprovalManifest, // REAL function
      currentGitShaFn: fakeCurrentGitShaFn,
    });
    assert.equal(result.verified, true);
    assert.equal(result.backupHash, backupHash);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('end-to-end: a backup file tampered with AFTER the manifest was written is caught by the REAL verifyFreshBackup(), not silently accepted', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-prodauth-tamper-'));
  const backupFile = path.join(tmpDir, 'mongodump.gz');
  fs.writeFileSync(backupFile, 'original bytes');
  const originalHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  const backupManifest = path.join(tmpDir, 'backup-manifest.json');
  fs.writeFileSync(backupManifest, JSON.stringify({ filePath: backupFile, sha256: originalHash, createdAt: new Date().toISOString() }));
  // Tamper with the backup file AFTER its manifest recorded the original hash.
  fs.writeFileSync(backupFile, 'tampered bytes -- a different dump entirely');

  const approvalManifest = path.join(tmpDir, 'approval.json');
  fs.writeFileSync(approvalManifest, JSON.stringify({
    projectRef: TARGET_SUPABASE_REF, gitSha: REAL_GIT_SHA, backupHash: originalHash,
    confirmToken: computeConfirmToken({ projectRef: TARGET_SUPABASE_REF, gitSha: REAL_GIT_SHA, backupHash: originalHash }),
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }));

  try {
    assert.throws(
      () => loadAndVerifyProductionAuthorization({
        env: baseEnv({ MIGRATION_APPROVAL_MANIFEST: approvalManifest, MIGRATION_BACKUP_MANIFEST: backupManifest }),
        verifyFreshBackupFn: verifyFreshBackup,
        verifyApprovalManifestFn: verifyApprovalManifest,
        currentGitShaFn: fakeCurrentGitShaFn,
      }),
      /does not match its manifest's recorded sha256/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('end-to-end: a stale (>24h) backup is caught by the REAL verifyFreshBackup(), not silently accepted', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-prodauth-stale-'));
  const backupFile = path.join(tmpDir, 'mongodump.gz');
  fs.writeFileSync(backupFile, 'old dump bytes');
  const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  const backupManifest = path.join(tmpDir, 'backup-manifest.json');
  const staleCreatedAt = new Date(Date.now() - 30 * 3_600_000).toISOString(); // 30h old
  fs.writeFileSync(backupManifest, JSON.stringify({ filePath: backupFile, sha256: backupHash, createdAt: staleCreatedAt }));

  const approvalManifest = path.join(tmpDir, 'approval.json');
  fs.writeFileSync(approvalManifest, JSON.stringify({
    projectRef: TARGET_SUPABASE_REF, gitSha: REAL_GIT_SHA, backupHash,
    confirmToken: computeConfirmToken({ projectRef: TARGET_SUPABASE_REF, gitSha: REAL_GIT_SHA, backupHash }),
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }));

  try {
    assert.throws(
      () => loadAndVerifyProductionAuthorization({
        env: baseEnv({ MIGRATION_APPROVAL_MANIFEST: approvalManifest, MIGRATION_BACKUP_MANIFEST: backupManifest }),
        verifyFreshBackupFn: verifyFreshBackup,
        verifyApprovalManifestFn: verifyApprovalManifest,
        currentGitShaFn: fakeCurrentGitShaFn,
      }),
      /old.*max allowed is 24h/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
