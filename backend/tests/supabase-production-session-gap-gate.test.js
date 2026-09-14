import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

// Auth hardening security batch, task item 6: under DATA_BACKEND=supabase,
// a regular user's password change/reset does not invalidate that user's
// other already-issued session cookies (no tokenVersion equivalent in the
// Postgres schema — see middleware/auth.js's own comment and
// config/validateEnv.js's new gate). Closing this for real is a schema/
// migration decision out of this batch's unilateral scope (see
// validateEnv.js's comment for why), so instead this proves the documented
// BLOCKER actually blocks: config/validateEnv() must refuse to let the
// process start with DATA_BACKEND=supabase in NODE_ENV=production unless
// explicitly acknowledged, so an accidental real Supabase production
// cutover cannot happen silently while this gap stands.
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

test('DATA_BACKEND=supabase + NODE_ENV=production, unacknowledged: process exits non-zero (blocked)', () => {
  const res = runValidateEnv({ DATA_BACKEND: 'supabase', NODE_ENV: 'production' });
  assert.notEqual(res.status, 0, 'expected a non-zero exit code (blocked)');
  assert.doesNotMatch(res.stdout, /SURVIVED/);
});

test('DATA_BACKEND=supabase + NODE_ENV=production, explicitly acknowledged: process survives validateEnv()', () => {
  const res = runValidateEnv({
    DATA_BACKEND: 'supabase',
    NODE_ENV: 'production',
    SUPABASE_SESSION_INVALIDATION_GAP_ACKNOWLEDGED: 'true',
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /SURVIVED/);
});

test('DATA_BACKEND=supabase + NODE_ENV!=production (local/dev/test/CI): never blocked, acknowledgment not required', () => {
  for (const nodeEnv of ['development', 'test', undefined]) {
    const res = runValidateEnv({ DATA_BACKEND: 'supabase', ...(nodeEnv ? { NODE_ENV: nodeEnv } : {}) });
    assert.equal(res.status, 0, `NODE_ENV=${nodeEnv} must not be blocked`);
    assert.match(res.stdout, /SURVIVED/);
  }
});

test('DATA_BACKEND=mongodb (the default/production backend) is never affected by this gate, in any NODE_ENV', () => {
  const res = runValidateEnv({ DATA_BACKEND: 'mongodb', NODE_ENV: 'production' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /SURVIVED/);
});
