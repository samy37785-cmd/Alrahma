import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

// Full production cutover: the gap this gate used to block on — under
// DATA_BACKEND=supabase, a password change/reset did not invalidate a
// user's other already-issued session cookies (no tokenVersion equivalent
// in the Postgres schema) — is closed for real
// (0033_profiles_token_version.sql: profiles.token_version, bumped by the
// owner-only bump_token_version() RPC from data/supabase/authController.js
// 's updateMe()/resetPassword(), read by data/supabase/loadUser.js instead
// of the old hardcoded tokenVersion: 0). The real, end-to-end proof that a
// stale session is actually rejected after a password change/reset lives
// in backend/scripts/migration/rehearsal-password-reset-e2e.mjs (needs a
// real local GoTrue instance, so it isn't part of this fast unit suite).
// This file now proves the NEGATIVE: the former hard production gate
// (config/validateEnv.js's SUPABASE_SESSION_INVALIDATION_GAP_ACKNOWLEDGED
// check) is gone — DATA_BACKEND=supabase in NODE_ENV=production is no
// longer blocked by this specific, now-fixed gap, with no acknowledgment
// flag required or recognized.
//
// validateEnv() calls process.exit(1) on failure — cannot be called
// in-process here without killing the test runner, so this spawns a real
// child `node` process (same technique already used by this repo's
// migration-tooling host-guard/production-authorization tests) that only
// imports config/validateEnv.js (no Mongo/Postgres connection needed) and
// reports whether it exited.

function runValidateEnv(env) {
  const script = `
    import { validateEnv } from './config/validateEnv.js';
    validateEnv();
    console.log('SURVIVED');
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: backendRoot,
    env: {
      ...process.env,
      ...env,
      // REQUIRED vars validateEnv() checks unconditionally — irrelevant to
      // this gate, but must be present so the process doesn't exit for an
      // unrelated reason first.
      JWT_SECRET: 'test-jwt-secret',
      MONGO_URI: 'mongodb://127.0.0.1:1/unused-placeholder',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:1/unused-placeholder',
      SUPABASE_JWT_SECRET: 'test-supabase-jwt-secret',
    },
    encoding: 'utf8',
  });
}

test('DATA_BACKEND=supabase + NODE_ENV=production: no longer blocked — the session-invalidation gap this gate existed for is closed', () => {
  const res = runValidateEnv({ DATA_BACKEND: 'supabase', NODE_ENV: 'production' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /SURVIVED/);
});

test('the former SUPABASE_SESSION_INVALIDATION_GAP_ACKNOWLEDGED bypass flag has no effect either way — nothing left to acknowledge', () => {
  const withFlag = runValidateEnv({
    DATA_BACKEND: 'supabase',
    NODE_ENV: 'production',
    SUPABASE_SESSION_INVALIDATION_GAP_ACKNOWLEDGED: 'true',
  });
  const withoutFlag = runValidateEnv({ DATA_BACKEND: 'supabase', NODE_ENV: 'production' });
  assert.equal(withFlag.status, 0);
  assert.equal(withoutFlag.status, 0);
});

test('DATA_BACKEND=mongodb (the default/production backend) was never affected by this gate, in any NODE_ENV', () => {
  const res = runValidateEnv({ DATA_BACKEND: 'mongodb', NODE_ENV: 'production' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /SURVIVED/);
});
