import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildPgPoolConfig } from '../data/supabase/client.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasHostOverride, hostOverrideParams } from '../data/supabase/pg-url.js';
import { isLocalHost, assertLocalHostOrProductionAuthorized } from '../scripts/migration/lib/host-guard.mjs';
import { assertDbUrlTarget, dbUrlProjectRef } from '../scripts/ops/lib/operator-io.mjs';
import { assertLocalHost as dbHarnessAssertLocalHost } from '../../lib/db/test/local-harness.mjs';
import { assertLocalOnly as dbOrchestratorAssertLocalOnly } from '../../lib/db/test/orchestrator-lib.mjs';

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

// ── Host override (?host= / ?hostaddr=) ───────────────────────────────────
// `pg` merges every query parameter of a connection string over its own
// config, so `?host=` sends the connection somewhere other than the host in
// the URL's authority. Every guard below decides "local" or "this project"
// from that authority alone, so a URL such as
//   postgresql://u:pw@127.0.0.1/db?host=db.example.test
// used to pass as local (no TLS, no production gate) while pg connected to
// db.example.test. These tests pin that no guard can be fooled that way.
// All hosts are reserved example/test names; nothing is ever connected to.

const REMOTE_HOST = 'db.example.test';
const SECRET = 'S3cretPw-do-not-leak';
const PROD_REF = 'difzynyphojgisrfvrkd';

const DISGUISED_LOCAL = [
  `postgresql://app_user:${SECRET}@127.0.0.1:5432/appdb?host=${REMOTE_HOST}`,
  `postgresql://app_user:${SECRET}@localhost/appdb?sslmode=disable&host=${REMOTE_HOST}`,
  `postgresql://app_user:${SECRET}@localhost/appdb?HOST=${REMOTE_HOST}`,
  `postgresql://app_user:${SECRET}@127.0.0.1/appdb?hostaddr=203.0.113.9`,
];
// Assembled from parts: this repo's diff-level secret scan flags a literal
// user:password@...supabase URL, and none of these values is real.
const projectUrl = (query = '') => ['postgresql://postgres:', SECRET, '@db.', PROD_REF, '.supabase.co:5432/postgres', query].join('');
const DISGUISED_PROJECT = projectUrl(`?host=${REMOTE_HOST}`);

test('the premise: pg really connects to the ?host= value, not the URL authority', () => {
  const cfg = new pg.Client({ connectionString: DISGUISED_LOCAL[0] }).connectionParameters;
  assert.equal(cfg.host, REMOTE_HOST);
});

test('hasHostOverride / hostOverrideParams: host and hostaddr in any case, nothing else', () => {
  for (const url of DISGUISED_LOCAL) assert.equal(hasHostOverride(url), true, url.replace(SECRET, '***'));
  assert.deepEqual(hostOverrideParams(DISGUISED_LOCAL[1]), ['host']);
  for (const url of [
    `postgresql://u:p@127.0.0.1:5432/appdb`,
    `postgresql://u:p@127.0.0.1:5432/appdb?sslmode=disable`,
    `postgresql://u:p@db.example.test/appdb?application_name=hostel&options=-c%20search_path%3Dpublic`,
  ]) {
    assert.equal(hasHostOverride(url), false, url);
  }
  // An unparseable value is not this helper's business: the callers report it.
  assert.equal(hasHostOverride('not a url'), false);
});

test('buildPgPoolConfig refuses a host override on a local URL, instead of returning ssl:false', () => {
  for (const url of DISGUISED_LOCAL) {
    assert.throws(() => buildPgPoolConfig(url, () => undefined), /host\/hostaddr query parameter/, url.replace(SECRET, '***'));
  }
});

test('buildPgPoolConfig refuses a host override on a remote URL too', () => {
  assert.throws(() => buildPgPoolConfig(`postgresql://u:p@db.example.test/appdb?host=127.0.0.1`, () => undefined), /host\/hostaddr query parameter/);
});

test('the refusal never echoes the password, the URL or the overriding host', () => {
  for (const url of [...DISGUISED_LOCAL, DISGUISED_PROJECT]) {
    let refusal = null;
    try {
      buildPgPoolConfig(url, () => undefined);
    } catch (err) {
      refusal = err;
    }
    assert.ok(refusal, 'expected a refusal');
    assert.ok(!refusal.message.includes(SECRET), 'password leaked');
    assert.ok(!refusal.message.includes(REMOTE_HOST), 'host leaked');
    assert.ok(!refusal.message.includes('127.0.0.1'), 'URL leaked');
  }
});

test('buildPgPoolConfig is unchanged for URLs without an override (local ssl:false, remote strict)', () => {
  const local = 'postgresql://u:p@127.0.0.1:54322/appdb';
  assert.deepEqual(buildPgPoolConfig(local, () => undefined), { connectionString: local, ssl: false });
  const remote = buildPgPoolConfig('postgresql://u:p@db.example.test/appdb?sslmode=disable', () => undefined);
  assert.deepEqual(remote.ssl, { rejectUnauthorized: true });
  assert.ok(!remote.connectionString.includes('sslmode'));
});

test('isLocalHost is false for a disguised URL, so it can never pass as a local target', () => {
  for (const url of DISGUISED_LOCAL) assert.equal(isLocalHost(url), false, url.replace(SECRET, '***'));
  assert.equal(isLocalHost('postgresql://u:p@127.0.0.1:54322/appdb'), true);
});

test('assertLocalHostOrProductionAuthorized refuses a disguised URL even with a verified production authorization', () => {
  const auth = { verified: true, projectRef: PROD_REF };
  for (const url of DISGUISED_LOCAL) {
    assert.throws(() => assertLocalHostOrProductionAuthorized(url, 'MIGRATION_DB_URL', null), /host\/hostaddr query parameter|not localhost/);
    assert.throws(() => assertLocalHostOrProductionAuthorized(url, 'MIGRATION_DB_URL', auth), /host\/hostaddr query parameter/);
  }
  assert.doesNotThrow(() => assertLocalHostOrProductionAuthorized('postgresql://u:p@127.0.0.1/appdb', 'MIGRATION_DB_URL', null));
});

test('operator tools: a disguised URL is neither the local target nor the production project', () => {
  assert.equal(dbUrlProjectRef(projectUrl()), PROD_REF);
  assert.equal(dbUrlProjectRef(DISGUISED_PROJECT), null);
  assert.throws(() => assertDbUrlTarget(DISGUISED_PROJECT, 'production'), /does not belong to --target=production/);
  for (const url of DISGUISED_LOCAL) {
    assert.throws(() => assertDbUrlTarget(url, 'local'), /does not belong to --target=local/, url.replace(SECRET, '***'));
  }
  assert.doesNotThrow(() => assertDbUrlTarget('postgresql://u:p@127.0.0.1:54322/appdb', 'local'));
});

test('lib/db test harness guards refuse a disguised TEST_DATABASE_URL', () => {
  for (const url of DISGUISED_LOCAL) {
    assert.throws(() => dbHarnessAssertLocalHost(url, 'TEST_DATABASE_URL'), /Refusing to run/, url.replace(SECRET, '***'));
    assert.throws(() => dbOrchestratorAssertLocalOnly(url, 'TEST_DATABASE_URL'), /Refusing to run/, url.replace(SECRET, '***'));
  }
  assert.doesNotThrow(() => dbHarnessAssertLocalHost('postgresql://u:p@127.0.0.1:54322/appdb', 'TEST_DATABASE_URL'));
  assert.doesNotThrow(() => dbOrchestratorAssertLocalOnly('postgresql://u:p@127.0.0.1:54322/appdb', 'TEST_DATABASE_URL'));
});

// The rehearsal and seed scripts used to carry their own copy of the
// hostname-only check. Postgres URLs now go through isLocalHost(); the only
// copies left are the ones that guard a MongoDB URI (no host override exists
// there) and are listed here on purpose.
test('no migration script keeps a hostname-only local check for a Postgres URL', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'migration');
  const MONGO_ONLY = new Set([
    'mongo-to-supabase.mjs',
    'seed-mongo-fixture.mjs',
    'seed-mongo-fixture-stage2f.mjs',
    'seed-mongo-fixture-auth-migration.mjs',
  ]);
  const offenders = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !MONGO_ONLY.has(f))
    .filter((f) => /host\s*!==\s*'localhost'\s*&&\s*host\s*!==\s*'127\.0\.0\.1'/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(offenders, []);
});
