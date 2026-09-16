import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mongo-mode /ready readiness is already fully covered by
// ready-endpoint.test.js (live-connection 200, dropped-connection 503) — this
// file only covers what that one doesn't: that DATA_BACKEND=supabase no
// longer requires (or connects to) MongoDB at startup, closing the gap where
// config/validateEnv.js unconditionally required MONGO_URI and server.js
// unconditionally called connectDB() regardless of DATA_BACKEND.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_ENV = {
  DATA_BACKEND: 'supabase',
  JWT_SECRET: 'test-jwt-secret-for-boot-readiness-test',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:1/unused-placeholder',
  SUPABASE_JWT_SECRET: 'test-supabase-jwt-secret',
};

let savedEnv;

before(() => {
  savedEnv = { ...process.env };
});

after(() => {
  process.env = savedEnv;
});

function withEnv(vars, fn) {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      process.env = prev;
    });
}

test('validateEnv() does NOT require MONGO_URI when DATA_BACKEND=supabase', async () => {
  await withEnv({ ...SUPABASE_ENV, MONGO_URI: '' }, async () => {
    delete process.env.MONGO_URI;
    const exitMock = mock.method(process, 'exit', () => {
      throw new Error('process.exit should not have been called');
    });
    try {
      const { validateEnv } = await import(`../config/validateEnv.js?t=${Date.now()}-${Math.random()}`);
      assert.doesNotThrow(() => validateEnv());
      assert.equal(exitMock.mock.calls.length, 0);
    } finally {
      exitMock.mock.restore();
    }
  });
});

test('validateEnv() still requires MONGO_URI when DATA_BACKEND is unset/mongodb (regression guard)', async () => {
  await withEnv({ DATA_BACKEND: 'mongodb', JWT_SECRET: 'test-jwt-secret' }, async () => {
    delete process.env.MONGO_URI;
    let exitCode = null;
    const exitMock = mock.method(process, 'exit', (code) => {
      exitCode = code;
      throw new Error('__validateEnv_exit__');
    });
    try {
      const { validateEnv } = await import(`../config/validateEnv.js?t=${Date.now()}-${Math.random()}`);
      assert.throws(() => validateEnv(), /__validateEnv_exit__/);
      assert.equal(exitCode, 1);
    } finally {
      exitMock.mock.restore();
    }
  });
});

test('server.js gates its MongoDB connect behind isSupabaseBackend() (source-level regression guard)', () => {
  // server.js calls app.listen()/registers SIGTERM handlers as top-level side
  // effects with no exported handle to close them, so importing it directly
  // in a test process is unsafe (leaked open port/listeners). The behavioral
  // contract itself — "don't call connectDB() under DATA_BACKEND=supabase" —
  // is the same isSupabaseBackend() gate already integration-tested via
  // app.js's own DB-connection-check middleware (see
  // admin-authorization-consolidation.test.js and friends, which boot the
  // real app under both backends); this asserts server.js's source actually
  // wires that same gate around its connectDB() call, so a future edit that
  // removes it fails a test instead of only being caught in production.
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(source, /isSupabaseBackend/, 'server.js should import/use isSupabaseBackend()');
  const guarded = /if\s*\(\s*!\s*isSupabaseBackend\(\)\s*\)\s*\{\s*connectDB\(\)/.test(source);
  assert.ok(guarded, 'server.js should only call connectDB() when !isSupabaseBackend()');
});
