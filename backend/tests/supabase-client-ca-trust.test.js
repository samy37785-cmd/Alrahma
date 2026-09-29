// Proves data/supabase/client.js's getPool() TLS/CA behavior (the
// SUPABASE_CA_CERT_PATH escape hatch for "self-signed certificate in
// certificate chain") without ever making a real network connection:
// getPool() only *constructs* a pg.Pool (pg connects lazily, on first
// query/connect — never at construction), so every test here just inspects
// the resulting pool.options.ssl.
//
// client.js's `pool` is an unexported module-level singleton with no reset
// hook, so a single process can only observe one getPool() outcome. Each
// scenario below therefore spawns a fresh child process that imports
// client.js from scratch and reports either the resulting ssl option or the
// thrown error's message — never a real DB/network call either way.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

function buildEnv(overrides) {
  const env = { ...process.env };
  delete env.SUPABASE_DB_URL;
  delete env.SUPABASE_CA_CERT_PATH;
  Object.assign(env, overrides);
  return env;
}

// Imports data/supabase/client.js in a fresh child process and calls
// getPool() exactly once, reporting either { ok: true, ssl } (the
// constructed pool's ssl option) or { ok: false, message } (the thrown
// error's message) as JSON on stdout. Constructing a pg.Pool never opens a
// socket, so this performs zero network I/O.
function runGetPool(overrides) {
  const script = [
    "import { getPool } from './data/supabase/client.js';",
    'try {',
    '  const pool = getPool();',
    "  process.stdout.write(JSON.stringify({ ok: true, ssl: pool.options.ssl }));",
    '} catch (err) {',
    "  process.stdout.write(JSON.stringify({ ok: false, message: err.message }));",
    '}',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: backendRoot,
    env: buildEnv(overrides),
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.error) throw result.error;
  const out = (result.stdout || '').trim();
  if (!out) {
    throw new Error(`no stdout from child process. status=${result.status} stderr=${result.stderr}`);
  }
  return JSON.parse(out);
}

// getPool()'s isLocal check only cares whether the hostname is
// 'localhost'/'127.0.0.1' — any other hostname exercises the identical
// "remote host" branch, so this deliberately uses an RFC 2606 reserved,
// guaranteed-unresolvable .invalid host rather than a real-looking Supabase
// pooler URL. This repo's own CI secret scan hard-fails, with no
// exceptions by design, on any diff line shaped like a Postgres connection
// URL that names a Supabase host — a fake, unrelated host still proves the
// exact same code path without ever looking like a live credential.
const REMOTE_URL = 'postgresql://test-user:test-pass@db.example-remote-host.invalid:5432/postgres';
const LOCAL_IP_URL = 'postgresql://test-user:test-pass@127.0.0.1:54322/postgres';
const LOCALHOST_URL = 'postgresql://test-user:test-pass@localhost:54322/postgres';

// Generates a throwaway, local-only self-signed CA (never committed,
// written under a temp dir, deleted at the end of this file) so the
// "valid CA path" test can prove a real PEM file is read and passed
// through as-is. Runs synchronously at module load, before any test()
// registration below, so the resulting `opensslAvailable` flag can gate
// that one test's registration. The two error-path tests (unreadable path,
// invalid content) need no real certificate and always run.
let tmpDir;
let validCaPath;
let validCaPem;
let opensslAvailable = true;
try {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'supabase-ca-trust-test-'));
  const keyPath = path.join(tmpDir, 'key.pem');
  validCaPath = path.join(tmpDir, 'ca.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', validCaPath,
    '-days', '1', '-subj', '/CN=test-only-local-ca-never-real',
  ], { stdio: 'ignore', timeout: 15_000 });
  validCaPem = readFileSync(validCaPath, 'utf8');
} catch {
  opensslAvailable = false;
}

test('local connection (127.0.0.1) stays TLS-off — SUPABASE_CA_CERT_PATH has no effect there', () => {
  const res = runGetPool({ SUPABASE_DB_URL: LOCAL_IP_URL });
  assert.equal(res.ok, true, res.message);
  assert.equal(res.ssl, false);
});

test('local connection (localhost) also stays TLS-off', () => {
  const res = runGetPool({ SUPABASE_DB_URL: LOCALHOST_URL });
  assert.equal(res.ok, true, res.message);
  assert.equal(res.ssl, false);
});

test('remote connection with SUPABASE_CA_CERT_PATH unset: unchanged strict TLS, no ca key added', () => {
  const res = runGetPool({ SUPABASE_DB_URL: REMOTE_URL });
  assert.equal(res.ok, true, res.message);
  assert.deepEqual(res.ssl, { rejectUnauthorized: true });
});

test(
  'remote connection with a valid PEM CA file: the exact file contents are passed to the Pool, TLS stays strict',
  { skip: opensslAvailable ? false : 'openssl CLI not available in this environment — cannot generate a test certificate' },
  () => {
    const res = runGetPool({ SUPABASE_DB_URL: REMOTE_URL, SUPABASE_CA_CERT_PATH: validCaPath });
    assert.equal(res.ok, true, res.message);
    assert.equal(res.ssl.rejectUnauthorized, true);
    assert.equal(res.ssl.ca, validCaPem);
  },
);

test('SUPABASE_CA_CERT_PATH pointing at a nonexistent file fails closed with a clear error', () => {
  const missingPath = path.join(tmpDir || tmpdir(), 'does-not-exist-ca.pem');
  const res = runGetPool({ SUPABASE_DB_URL: REMOTE_URL, SUPABASE_CA_CERT_PATH: missingPath });
  assert.equal(res.ok, false, 'expected getPool() to throw for a missing CA file, not silently proceed');
  assert.match(res.message, /could not be read/);
});

test('SUPABASE_CA_CERT_PATH pointing at a file with invalid (non-PEM) content fails closed with a clear error', () => {
  const invalidPath = path.join(tmpDir || tmpdir(), 'invalid-ca.pem');
  writeFileSync(invalidPath, 'this is not a certificate\njust some text\n', 'utf8');
  const res = runGetPool({ SUPABASE_DB_URL: REMOTE_URL, SUPABASE_CA_CERT_PATH: invalidPath });
  assert.equal(res.ok, false, 'expected getPool() to throw for invalid CA content, not silently proceed');
  assert.match(res.message, /does not contain a valid PEM certificate/);
  rmSync(invalidPath, { force: true });
});

test('no scenario ever produces rejectUnauthorized: false for a non-local host', () => {
  const noCa = runGetPool({ SUPABASE_DB_URL: REMOTE_URL });
  assert.equal(noCa.ok, true, noCa.message);
  assert.notEqual(noCa.ssl && noCa.ssl.rejectUnauthorized, false);

  if (opensslAvailable) {
    const withCa = runGetPool({ SUPABASE_DB_URL: REMOTE_URL, SUPABASE_CA_CERT_PATH: validCaPath });
    assert.equal(withCa.ok, true, withCa.message);
    assert.notEqual(withCa.ssl && withCa.ssl.rejectUnauthorized, false);
  }

  const missingPath = path.join(tmpDir || tmpdir(), 'still-does-not-exist-ca.pem');
  const badPath = runGetPool({ SUPABASE_DB_URL: REMOTE_URL, SUPABASE_CA_CERT_PATH: missingPath });
  // A bad CA path must fail closed (throw), never fall through to a Pool
  // with weakened verification.
  assert.equal(badPath.ok, false);
});

after(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});
