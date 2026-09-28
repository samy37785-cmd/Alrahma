// server.js Mongo-vs-Supabase conditional startup — real subprocess boot tests.
//
// server.js is the actual Render entry point (Start Command: "node server.js")
// and has real process-level side effects (an eager top-level connectDB()
// call, process.exit() on failure, OS signal handlers) that make it unsafe to
// dynamically import into this test file's own process — a reintroduced bug
// would call process.exit() for real and kill the entire test runner. Every
// test below instead spawns a genuine child `node server.js` process
// (127.0.0.1 only, no real Mongo/Supabase, only local dummy values) and
// observes only its exit code / HTTP responses / listening state.
//
// Background: a read-only Render Staging preflight found that server.js
// called connectDB() unconditionally, with no isSupabaseBackend() guard —
// so a DATA_BACKEND=supabase deployment with a placeholder MONGO_URI would
// crash at boot before ever accepting a request. This file proves the fix:
// Mongo stays the required, fail-closed default, while Supabase mode never
// touches Mongo at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const serverPath = path.join(backendRoot, 'server.js');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Builds a child env from the parent's own process.env (same pattern as the
// other local contract gates' orchestrator scripts), then applies explicit
// string overrides and deletes. Never inherits RENDER_EXTERNAL_URL, so
// keepAlive.js never starts a real self-ping interval in these tests.
function buildEnv({ set = {}, unset = [] } = {}) {
  const env = { ...process.env, ...set };
  delete env.RENDER_EXTERNAL_URL;
  for (const key of unset) delete env[key];
  return env;
}

function spawnServer(env) {
  const child = spawn(process.execPath, [serverPath], { cwd: backendRoot, env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  return { child, getOutput: () => ({ stdout, stderr }) };
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`process did not exit within ${timeoutMs}ms`)), timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return res.json();
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw lastErr || new Error('timed out waiting for /health');
}

// kill() force-terminates on Windows (no real SIGTERM delivery there) and
// sends a real SIGTERM on POSIX — either way this only guarantees the OS
// process is gone, which is all cleanup here needs.
function killAndWait(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
  });
}

test('Mongo default (DATA_BACKEND unset) + missing MONGO_URI: fails validation before listening', async () => {
  const env = buildEnv({
    set: { JWT_SECRET: 'local-only-test-secret', PORT: '0' },
    unset: ['DATA_BACKEND', 'MONGO_URI'],
  });
  const { child, getOutput } = spawnServer(env);
  try {
    const code = await waitForExit(child, 15_000);
    assert.notEqual(code, 0, `expected a non-zero exit (validateEnv should reject a missing MONGO_URI under the default Mongo backend), got ${code}. stderr: ${getOutput().stderr}`);
  } finally {
    await killAndWait(child);
  }
});

test('DATA_BACKEND=supabase + no MONGO_URI at all: boots, /health responds, stays up (connectDB() never called)', async () => {
  const port = await getFreePort();
  const env = buildEnv({
    set: {
      DATA_BACKEND: 'supabase',
      JWT_SECRET: 'local-only-test-secret',
      // Structurally valid, non-routable local values — nothing in this test
      // ever queries Postgres or calls Supabase Auth (only /health, a pure
      // DB-free responder, is hit).
      SUPABASE_URL: 'http://127.0.0.1:1',
      SUPABASE_ANON_KEY: 'local-only-dummy-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'local-only-dummy-service-role-key',
      SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:1/unused-placeholder',
      SUPABASE_JWT_SECRET: 'local-only-dummy-supabase-jwt-secret',
      PORT: String(port),
    },
    unset: ['MONGO_URI'],
  });
  const { child, getOutput } = spawnServer(env);
  try {
    const body = await waitForHealth(port, 20_000).catch((err) => {
      throw new Error(`/health never responded — if connectDB() were called with no MONGO_URI it would reject and the process would exit before/soon after listening. stderr: ${getOutput().stderr}. Original error: ${err.message}`);
    });
    assert.equal(body.status, 'ok');

    // Close the race where a delayed, reintroduced connectDB() call rejects
    // just after the first successful response: confirm the process is
    // still alive and still answering a short moment later.
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(child.exitCode, null, `server exited unexpectedly after the first /health response — stderr: ${getOutput().stderr}`);
    const secondBody = await waitForHealth(port, 2_000);
    assert.equal(secondBody.status, 'ok');
  } finally {
    await killAndWait(child);
  }
});

test('DATA_BACKEND=mongodb (explicit) + unreachable MONGO_URI: still fails closed (regression)', async () => {
  const env = buildEnv({
    set: {
      DATA_BACKEND: 'mongodb',
      JWT_SECRET: 'local-only-test-secret',
      MONGO_URI: 'mongodb://127.0.0.1:1/unreachable-on-purpose',
      PORT: '0',
    },
  });
  const { child, getOutput } = spawnServer(env);
  try {
    const code = await waitForExit(child, 25_000);
    assert.notEqual(code, 0, `expected a non-zero exit (Mongo mode must still fail closed on a bad MONGO_URI), got ${code}. stderr: ${getOutput().stderr}`);
  } finally {
    await killAndWait(child);
  }
});

test('invalid DATA_BACKEND value: logs a clear message and never boots into a listening state', async () => {
  // Confirmed by actually running this (not assumed): getDataBackend()'s
  // throw is caught by config/logger.js's winston `exceptionHandlers`, which
  // logs it clearly to stdout but does NOT process.exit() (exitOnError:
  // false, a pre-existing, unrelated logger setting) — the process then
  // exits 0 once its drained event loop has nothing left to do, since
  // app.listen() was never reached. So the correct assertion here is "never
  // reaches a working listening state", not "non-zero exit code".
  const port = await getFreePort();
  const env = buildEnv({
    set: { DATA_BACKEND: 'not-a-real-backend', JWT_SECRET: 'local-only-test-secret', PORT: String(port) },
    unset: ['MONGO_URI'],
  });
  const { child, getOutput } = spawnServer(env);
  try {
    await waitForExit(child, 15_000);
    assert.match(getOutput().stdout, /Invalid DATA_BACKEND/);
    await assert.rejects(() => waitForHealth(port, 1_000), /timed out|fetch failed|ECONNREFUSED/);
  } finally {
    await killAndWait(child);
  }
});
