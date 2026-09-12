#!/usr/bin/env node
// Stage 2J-B — Production Enablement. Live CLI proofs (real spawned
// processes, real `git rev-parse HEAD` against THIS actual checkout) that
// the three production scripts (mongo-to-supabase.mjs, migrate-users-to-
// supabase-auth.mjs, production-import-orchestrator.mjs) genuinely wire
// lib/host-guard.mjs + lib/production-authorization.mjs into their own
// MIGRATION_DB_URL check, for both directions:
//   1. A non-local MIGRATION_DB_URL with no production authorization is
//      refused immediately, with the exact same guard message as before
//      -- this is the regression proof that default behavior (every
//      existing test in this directory) is completely unchanged.
//   2. A non-local (but deliberately non-resolvable) MIGRATION_DB_URL
//      WITH a genuine, fully-valid production authorization (real temp
//      approval/backup manifests, matching this checkout's real git SHA)
//      passes the guard -- proven by the process failing LATER, on an
//      actual connection/DNS error, never on the guard's own refusal
//      message. No real database is ever contacted; the host is
//      deliberately unresolvable so nothing could succeed even in
//      principle -- this test only proves the GATE opened, never that a
//      real production write occurred (that requires real credentials
//      this repo's own tooling structurally never touches).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeConfirmToken } from './lib/production-approval.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MONGO_TO_SUPABASE = path.join(__dirname, 'mongo-to-supabase.mjs');
const USER_MIGRATION = path.join(__dirname, 'migrate-users-to-supabase-auth.mjs');
const ORCHESTRATOR = path.join(__dirname, 'production-import-orchestrator.mjs');

const TARGET_SUPABASE_REF = 'difzynyphojgisrfvrkd';
// Deliberately unresolvable -- .invalid is IANA-reserved to never resolve
// (RFC 2606). Proves the guard opened without ever risking a real network
// call reaching anything, real or otherwise.
const FAKE_NONLOCAL_HOST = 'db.production-enablement-test.invalid';
const FAKE_PG_URI = `postgresql://user:pass@${FAKE_NONLOCAL_HOST}:5432/postgres`;

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

function realGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function makeValidProductionArtifacts(tmpDir) {
  const gitSha = realGitSha();
  const backupFile = path.join(tmpDir, 'mongodump.gz');
  fs.writeFileSync(backupFile, 'fake dump bytes for this gate-only test');
  const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  const backupManifest = path.join(tmpDir, 'backup-manifest.json');
  fs.writeFileSync(backupManifest, JSON.stringify({ filePath: backupFile, sha256: backupHash, createdAt: new Date().toISOString() }));

  const approvalManifest = path.join(tmpDir, 'approval.json');
  fs.writeFileSync(approvalManifest, JSON.stringify({
    projectRef: TARGET_SUPABASE_REF, gitSha, backupHash,
    confirmToken: computeConfirmToken({ projectRef: TARGET_SUPABASE_REF, gitSha, backupHash }),
    approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
  }));

  return { approvalManifest, backupManifest };
}

function runScript(scriptPath, args, env) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd: __dirname, env: { ...process.env, ...env }, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function main() {
  // -----------------------------------------------------------------
  // Regression: no production mode at all -- unchanged default refusal,
  // for all three scripts.
  // -----------------------------------------------------------------

  test('mongo-to-supabase.mjs: non-local MIGRATION_DB_URL with no production mode is refused exactly as before', () => {
    const run = runScript(MONGO_TO_SUPABASE, ['--domain=trial_requests', '--dry-run'], {
      MIGRATION_MONGO_URI: 'mongodb://127.0.0.1:1/al-rahma', MIGRATION_DB_URL: FAKE_PG_URI,
    });
    assert.notEqual(run.code, 0);
    assert.match(run.stderr, /MIGRATION_DB_URL host ".*" is not localhost\/127\.0\.0\.1, and no production authorization was provided/);
  });

  test('migrate-users-to-supabase-auth.mjs: non-local MIGRATION_DB_URL with no production mode is refused exactly as before', () => {
    const run = runScript(USER_MIGRATION, ['--execute'], {
      MIGRATION_MONGO_URI: 'mongodb://127.0.0.1:1/al-rahma', MIGRATION_DB_URL: FAKE_PG_URI,
      SUPABASE_URL: 'http://127.0.0.1:1/', SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key-for-test',
    });
    assert.notEqual(run.code, 0);
    assert.match(run.stderr, /MIGRATION_DB_URL host ".*" is not localhost\/127\.0\.0\.1, and no production authorization was provided/);
  });

  test('production-import-orchestrator.mjs: non-local MIGRATION_DB_URL with no production mode is refused exactly as before (--plan)', () => {
    const run = runScript(ORCHESTRATOR, [], { MIGRATION_DB_URL: FAKE_PG_URI });
    assert.notEqual(run.code, 0);
    assert.match(run.stderr, /MIGRATION_DB_URL host ".*" is not localhost\/127\.0\.0\.1, and no production authorization was provided/);
  });

  // -----------------------------------------------------------------
  // The gate genuinely opens with a real, fully-valid authorization --
  // proven by getting PAST the guard's own message (a DNS/connection
  // failure against the deliberately-unresolvable host follows instead).
  // -----------------------------------------------------------------

  test('mongo-to-supabase.mjs: a genuinely valid production authorization passes the guard (fails later, on connection, never on the guard itself)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-gate-'));
    try {
      const { approvalManifest, backupManifest } = makeValidProductionArtifacts(tmpDir);
      const run = runScript(MONGO_TO_SUPABASE, ['--domain=trial_requests', '--dry-run'], {
        MIGRATION_MONGO_URI: 'mongodb://127.0.0.1:1/al-rahma', MIGRATION_DB_URL: FAKE_PG_URI,
        MIGRATION_PRODUCTION_MODE: '1', MIGRATION_APPROVAL_MANIFEST: approvalManifest, MIGRATION_BACKUP_MANIFEST: backupManifest,
        SUPABASE_URL: `https://${TARGET_SUPABASE_REF}.supabase.co`,
      });
      assert.notEqual(run.code, 0, 'must still fail overall -- the host genuinely does not exist -- but NOT on the guard');
      assert.doesNotMatch(run.stderr, /no production authorization was provided/);
      assert.doesNotMatch(run.stderr, /is not a genuinely verified result/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('migrate-users-to-supabase-auth.mjs: a genuinely valid production authorization passes the guard', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-gate-'));
    try {
      const { approvalManifest, backupManifest } = makeValidProductionArtifacts(tmpDir);
      const run = runScript(USER_MIGRATION, ['--execute'], {
        MIGRATION_MONGO_URI: 'mongodb://127.0.0.1:1/al-rahma', MIGRATION_DB_URL: FAKE_PG_URI,
        MIGRATION_PRODUCTION_MODE: '1', MIGRATION_APPROVAL_MANIFEST: approvalManifest, MIGRATION_BACKUP_MANIFEST: backupManifest,
        SUPABASE_URL: `https://${TARGET_SUPABASE_REF}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key-for-test',
      });
      assert.notEqual(run.code, 0);
      assert.doesNotMatch(run.stderr, /no production authorization was provided/);
      assert.doesNotMatch(run.stderr, /is not a genuinely verified result/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('production-import-orchestrator.mjs: a genuinely valid production authorization passes the guard (--plan)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-gate-'));
    try {
      const { approvalManifest, backupManifest } = makeValidProductionArtifacts(tmpDir);
      const run = runScript(ORCHESTRATOR, [], {
        MIGRATION_DB_URL: FAKE_PG_URI,
        MIGRATION_PRODUCTION_MODE: '1', MIGRATION_APPROVAL_MANIFEST: approvalManifest, MIGRATION_BACKUP_MANIFEST: backupManifest,
        SUPABASE_URL: `https://${TARGET_SUPABASE_REF}.supabase.co`,
      });
      assert.notEqual(run.code, 0);
      assert.doesNotMatch(run.stderr, /no production authorization was provided/);
      assert.doesNotMatch(run.stderr, /is not a genuinely verified result/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('production-import-orchestrator.mjs: production mode with a manifest approved for a DIFFERENT git SHA is refused (never trusts a stale approval)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-gate-badsha-'));
    try {
      const backupFile = path.join(tmpDir, 'mongodump.gz');
      fs.writeFileSync(backupFile, 'fake dump bytes');
      const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
      const backupManifest = path.join(tmpDir, 'backup-manifest.json');
      fs.writeFileSync(backupManifest, JSON.stringify({ filePath: backupFile, sha256: backupHash, createdAt: new Date().toISOString() }));
      const wrongSha = 'f'.repeat(40);
      const approvalManifest = path.join(tmpDir, 'approval.json');
      fs.writeFileSync(approvalManifest, JSON.stringify({
        projectRef: TARGET_SUPABASE_REF, gitSha: wrongSha, backupHash,
        confirmToken: computeConfirmToken({ projectRef: TARGET_SUPABASE_REF, gitSha: wrongSha, backupHash }),
        approvedBy: 'test-operator', approvedAt: new Date().toISOString(),
      }));

      const run = runScript(ORCHESTRATOR, [], {
        MIGRATION_DB_URL: FAKE_PG_URI,
        MIGRATION_PRODUCTION_MODE: '1', MIGRATION_APPROVAL_MANIFEST: approvalManifest, MIGRATION_BACKUP_MANIFEST: backupManifest,
        SUPABASE_URL: `https://${TARGET_SUPABASE_REF}.supabase.co`,
      });
      assert.notEqual(run.code, 0);
      assert.match(run.stderr, /was approved for git SHA/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
