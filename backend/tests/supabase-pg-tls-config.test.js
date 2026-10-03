import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildPgPoolConfig } from '../data/supabase/client.js';

// Direct tests of the Postgres TLS policy. buildPgPoolConfig() is pure — it
// never opens a socket, and pg.Client is only constructed (never .connect()ed)
// to inspect the effective TLS config pg would actually use. No real host,
// no real CA file, no production value appears anywhere in this file.

const REMOTE = 'postgresql://app_user:S3cretPw-do-not-leak@db.example.test:5432/appdb';
const FAKE_CA = '-----BEGIN CERTIFICATE-----\nFAKE-TEST-CA-NOT-REAL\n-----END CERTIFICATE-----\n';

const savedCaPath = process.env.SUPABASE_CA_CERT_PATH;
afterEach(() => {
  if (savedCaPath === undefined) delete process.env.SUPABASE_CA_CERT_PATH;
  else process.env.SUPABASE_CA_CERT_PATH = savedCaPath;
});

function spyLoader(value) {
  const spy = { calls: 0 };
  spy.fn = () => { spy.calls += 1; return value; };
  return spy;
}

// The TLS config pg would actually apply after merging the URL — the only
// thing that decides whether a connection is strict.
function effectiveSsl(cfg) {
  return new pg.Client({ connectionString: cfg.connectionString, ssl: cfg.ssl }).connectionParameters.ssl;
}

// ── Local URLs: unchanged behavior, CA loader never consulted ──────────────

for (const host of ['localhost', '127.0.0.1']) {
  test(`local host "${host}": ssl:false, original string untouched, CA loader never called`, () => {
    const loader = spyLoader(FAKE_CA);
    const url = `postgresql://app_user:pw@${host}:54322/appdb`;
    const cfg = buildPgPoolConfig(url, loader.fn);
    assert.equal(cfg.ssl, false);
    assert.equal(cfg.connectionString, url);
    assert.equal(loader.calls, 0);
  });
}

test('local host ignores a misconfigured SUPABASE_CA_CERT_PATH entirely (no file read, no throw)', () => {
  process.env.SUPABASE_CA_CERT_PATH = 'C:/definitely/does/not/exist.pem';
  const cfg = buildPgPoolConfig('postgresql://u:p@127.0.0.1:54322/appdb');
  assert.equal(cfg.ssl, false);
});

test('IPv6 loopback [::1] keeps its pre-existing treatment: NOT in the local list, so strict TLS applies (documented, not widened)', () => {
  const loader = spyLoader(undefined);
  const cfg = buildPgPoolConfig('postgresql://u:p@[::1]:54322/appdb', loader.fn);
  assert.equal(loader.calls, 1);
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true });
});

// ── Non-local URL: strict config is the one pg applies ─────────────────────

test('non-local host with a CA: ssl is exactly { rejectUnauthorized: true, ca: expectedCa }', () => {
  const cfg = buildPgPoolConfig(REMOTE, spyLoader(FAKE_CA).fn);
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true, ca: FAKE_CA });
  assert.equal(cfg.connectionString, REMOTE);
});

test('non-local host without a CA: ssl is exactly { rejectUnauthorized: true } (default trust store, never disabled)', () => {
  const cfg = buildPgPoolConfig(REMOTE, spyLoader(undefined).fn);
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true });
  assert.ok(!('ca' in cfg.ssl));
});

test('effective pg TLS for a remote host (no URL params) is the strict config, not a relaxed one', () => {
  const cfg = buildPgPoolConfig(REMOTE, spyLoader(FAKE_CA).fn);
  assert.deepEqual(effectiveSsl(cfg), { rejectUnauthorized: true, ca: FAKE_CA });
});

// ── Fail closed ────────────────────────────────────────────────────────────

test('fail closed: a configured-but-empty CA throws before any pool/connection, never falls back to the default store', () => {
  assert.throws(() => buildPgPoolConfig(REMOTE, spyLoader('').fn), /empty certificate; refusing to connect/);
});

test('fail closed: a CA loader that throws propagates the failure (no config returned)', () => {
  const loader = () => { throw new Error('SUPABASE_CA_CERT_PATH is set but the file could not be read'); };
  assert.throws(() => buildPgPoolConfig(REMOTE, loader), /could not be read/);
});

test('fail closed (real loader): SUPABASE_CA_CERT_PATH pointing at a missing file throws, and the error never shows the URL or password', () => {
  process.env.SUPABASE_CA_CERT_PATH = 'C:/nonexistent-ca-for-test.pem';
  let caught;
  try { buildPgPoolConfig(REMOTE); } catch (err) { caught = err; }
  assert.ok(caught, 'expected a throw');
  assert.match(caught.message, /could not be read/);
  assert.ok(!caught.message.includes('S3cretPw'), 'password must not appear in the error');
  assert.ok(!caught.message.includes('db.example.test'), 'host must not appear in the error');
});

test('fail closed (real loader): a CA file that is not a PEM certificate throws without echoing its contents', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-test-'));
  const file = path.join(dir, 'not-a-cert.pem');
  fs.writeFileSync(file, 'NOT-A-CERT-GARBAGE-CONTENT');
  process.env.SUPABASE_CA_CERT_PATH = file;
  try {
    let caught;
    try { buildPgPoolConfig(REMOTE); } catch (err) { caught = err; }
    assert.ok(caught, 'expected a throw');
    assert.match(caught.message, /does not contain a valid PEM certificate/);
    assert.ok(!caught.message.includes('NOT-A-CERT-GARBAGE-CONTENT'), 'file contents must not be echoed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Downgrade attempts: a URL cannot weaken the strict config ──────────────

for (const param of ['sslmode=disable', 'sslmode=no-verify', 'sslmode=require', 'sslmode=prefer', 'ssl=false', 'ssl=0', 'sslnegotiation=direct', 'uselibpqcompat=true']) {
  test(`downgrade via "${param}" is stripped: effective pg TLS stays strict`, () => {
    const cfg = buildPgPoolConfig(`${REMOTE}?${param}`, spyLoader(FAKE_CA).fn);
    assert.deepEqual(effectiveSsl(cfg), { rejectUnauthorized: true, ca: FAKE_CA });
    assert.ok(!cfg.connectionString.includes(param.split('=')[0] + '='), 'the TLS param must be removed from the string pg receives');
  });
}

test('downgrade via sslrootcert is stripped, so pg never reads an arbitrary local file named by the URL', () => {
  const cfg = buildPgPoolConfig(`${REMOTE}?sslrootcert=C:/Windows/win.ini`, spyLoader(FAKE_CA).fn);
  assert.ok(!cfg.connectionString.includes('sslrootcert'));
  assert.deepEqual(effectiveSsl(cfg), { rejectUnauthorized: true, ca: FAKE_CA });
});

test('non-TLS query parameters are preserved untouched', () => {
  const cfg = buildPgPoolConfig(`${REMOTE}?application_name=migration&sslmode=disable`, spyLoader(undefined).fn);
  assert.ok(cfg.connectionString.includes('application_name=migration'));
  assert.ok(!cfg.connectionString.includes('sslmode'));
});

// ── URL safety ─────────────────────────────────────────────────────────────

test('malformed URL throws a fixed message that does not echo the input or its credentials', () => {
  const bad = 'postgresql://app_user:S3cretPw@[not-a-valid-host';
  let caught;
  try { buildPgPoolConfig(bad, spyLoader(FAKE_CA).fn); } catch (err) { caught = err; }
  assert.ok(caught);
  assert.equal(caught.message, 'Postgres connection string is not a parseable URL');
  assert.ok(!caught.message.includes('S3cretPw'));
});

test('URL without a hostname throws before any CA lookup', () => {
  const loader = spyLoader(FAKE_CA);
  assert.throws(() => buildPgPoolConfig('postgresql:///appdb', loader.fn), /has no host/);
  assert.equal(loader.calls, 0);
});

test('hostname casing: an uppercase "LOCALHOST" is NOT local (non-special scheme keeps host case; same comparison as before), so it gets strict TLS', () => {
  const loader = spyLoader(undefined);
  const cfg = buildPgPoolConfig('postgresql://u:p@LOCALHOST:54322/appdb', loader.fn);
  assert.equal(loader.calls, 1);
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true });
});

test('hostname casing: an uppercase remote host is still treated as remote (strict), not local', () => {
  const cfg = buildPgPoolConfig('postgresql://u:p@DB.EXAMPLE.TEST/appdb', spyLoader(undefined).fn);
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true });
});

test('trailing-dot localhost ("localhost.") is NOT local: the unsafe direction is avoided by treating it as remote (strict)', () => {
  const loader = spyLoader(undefined);
  const cfg = buildPgPoolConfig('postgresql://u:p@localhost./appdb', loader.fn);
  assert.equal(loader.calls, 1);
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true });
});
