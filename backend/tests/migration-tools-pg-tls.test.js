import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET_SUPABASE_REF } from '../scripts/migration/lib/production-approval.mjs';
import { signedTestManifest } from '../scripts/migration/lib/manifest-test-fixture.mjs';

// Direct tests of the Postgres TLS policy inside the two migration tools that
// can be pointed at production: production-import-orchestrator.mjs and
// migrate-users-to-supabase-auth.mjs. Each test spawns the REAL tool in its
// default plan mode against a fake Postgres listener on loopback that only
// records the first bytes the client sends: an SSLRequest (TLS demanded) or
// a plain StartupMessage (no TLS). The listener answers "N" (no SSL), so no
// handshake, credential or query ever happens. 127.0.0.2 is loopback but is
// NOT one of the two names the tools treat as local, so it takes the same
// strict path a real remote host would. No real host, credential or CA is
// used, and nothing leaves this machine.
//
// The production authorization those remote runs need is a throwaway test
// fixture built in a temp dir (fake backup file, current HEAD) and deleted
// afterwards. It is not, and could not be used as, a real approval.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, '..');
const MIGRATION_DIR = path.join(BACKEND, 'scripts', 'migration');
const TOOLS = {
  orchestrator: path.join(MIGRATION_DIR, 'production-import-orchestrator.mjs'),
  'migrate-users': path.join(MIGRATION_DIR, 'migrate-users-to-supabase-auth.mjs'),
};

const PASSWORD = 'S3cretPw-do-not-leak';
const SSL_REQUEST_CODE = 80877103;

let tmp;
let authEnv;
let pgRemote;
let pgLocal;
let mongoTripwire;

function startListener(host, onConnection) {
  const events = [];
  const server = net.createServer((sock) => {
    sock.on('error', () => {});
    onConnection(sock, events);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve({ server, port: server.address().port, events }));
  });
}

// Records whether the client opened with an SSLRequest or a plaintext
// StartupMessage, then refuses SSL so the connection ends right there.
function fakePostgres(host) {
  return startListener(host, (sock, events) => {
    sock.once('data', (buf) => {
      if (buf.length >= 8 && buf.readInt32BE(4) === SSL_REQUEST_CODE) {
        events.push('ssl-request');
        sock.end('N');
      } else {
        events.push('plaintext-startup');
        sock.destroy();
      }
    });
  });
}

// Counts any connection at all; the Mongo URI points here so a test can prove
// the source was never contacted.
function tripwire(host) {
  return startListener(host, (sock, events) => {
    events.push('connected');
    sock.destroy();
  });
}

function baseEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(MIGRATION_|SUPABASE_|MONGO|PG)/i.test(k)) continue;
    env[k] = v;
  }
  return env;
}

function runTool(tool, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TOOLS[tool]], { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

function toolEnv({ pgHost, pgPort, query = '', ca, authorized }) {
  const env = {
    ...baseEnv(),
    MIGRATION_DB_URL: `postgresql://app_user:${PASSWORD}@${pgHost}:${pgPort}/appdb${query}`,
    MIGRATION_MONGO_URI: `mongodb://127.0.0.1:${mongoTripwire.port}/al-rahma`,
    SUPABASE_URL: `https://${TARGET_SUPABASE_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key-for-test',
    ...(authorized ? authEnv : {}),
  };
  if (ca !== undefined) env.SUPABASE_CA_CERT_PATH = ca;
  return env;
}

function assertNoLeak(out) {
  assert.ok(!out.includes(PASSWORD), 'the password must never appear in tool output');
  assert.ok(!out.includes(`app_user:${PASSWORD}`), 'the connection string must never appear in tool output');
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-tls-'));
  const backupFile = path.join(tmp, 'fake-backup.archive.gz');
  fs.writeFileSync(backupFile, crypto.randomBytes(64));
  const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
  const backupManifest = path.join(tmp, 'backup-manifest.json');
  fs.writeFileSync(backupManifest, JSON.stringify({ filePath: backupFile, sha256: backupHash, createdAt: new Date().toISOString() }));
  const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: BACKEND, encoding: 'utf8' }).trim();
  const approvalManifest = path.join(tmp, 'approval-manifest.json');
  // A manifest signed by the real signing code (scope execute also covers plan).
  fs.writeFileSync(approvalManifest, JSON.stringify(signedTestManifest({ gitSha, backupHash })));
  authEnv = {
    MIGRATION_PRODUCTION_MODE: '1',
    MIGRATION_APPROVAL_MANIFEST: approvalManifest,
    MIGRATION_BACKUP_MANIFEST: backupManifest,
  };
  fs.writeFileSync(path.join(tmp, 'empty-ca.pem'), '');

  pgRemote = await fakePostgres('127.0.0.2');
  pgLocal = await fakePostgres('127.0.0.1');
  mongoTripwire = await tripwire('127.0.0.1');
});

after(() => {
  for (const l of [pgRemote, pgLocal, mongoTripwire]) l?.server.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

function resetEvents() {
  for (const l of [pgRemote, pgLocal, mongoTripwire]) l.events.length = 0;
}

for (const tool of Object.keys(TOOLS)) {
  test(`${tool}: wired to the shared buildPgPoolConfig, no bare pg.Pool left`, () => {
    const src = fs.readFileSync(TOOLS[tool], 'utf8');
    assert.match(src, /import \{ buildPgPoolConfig \} from '\.\.\/\.\.\/data\/supabase\/client\.js';/);
    assert.doesNotMatch(src, /new pg\.Pool\(\{\s*connectionString/);
  });

  test(`${tool} --plan, non-local host: demands TLS (SSLRequest), never a plaintext startup`, async () => {
    resetEvents();
    const { code, out } = await runTool(tool, toolEnv({ pgHost: '127.0.0.2', pgPort: pgRemote.port, authorized: true }));
    assert.notEqual(code, 0);
    assert.deepEqual(pgRemote.events, ['ssl-request']);
    assert.match(out, /does not support SSL/);
    assert.deepEqual(mongoTripwire.events, [], 'Mongo must not be contacted when Postgres TLS fails');
    assertNoLeak(out);
  });

  for (const downgrade of ['sslmode=disable', 'ssl=false', 'ssl=0']) {
    test(`${tool} --plan, non-local host with "?${downgrade}": still demands TLS (param stripped)`, async () => {
      resetEvents();
      const { code, out } = await runTool(tool, toolEnv({ pgHost: '127.0.0.2', pgPort: pgRemote.port, query: `?${downgrade}`, authorized: true }));
      assert.notEqual(code, 0);
      assert.deepEqual(pgRemote.events, ['ssl-request'], 'a URL param must not turn TLS off');
      assertNoLeak(out);
    });
  }

  test(`${tool} --plan, non-local host, CA path set but missing: fails before any connection`, async () => {
    resetEvents();
    const { code, out } = await runTool(tool, toolEnv({ pgHost: '127.0.0.2', pgPort: pgRemote.port, ca: path.join(tmp, 'missing-ca.pem'), authorized: true }));
    assert.notEqual(code, 0);
    assert.match(out, /SUPABASE_CA_CERT_PATH .*could not be read/);
    assert.deepEqual(pgRemote.events, [], 'no Postgres connection may be attempted');
    assert.deepEqual(mongoTripwire.events, [], 'no Mongo connection may be attempted');
    assertNoLeak(out);
  });

  test(`${tool} --plan, non-local host, CA file empty: fails before any connection`, async () => {
    resetEvents();
    const { code, out } = await runTool(tool, toolEnv({ pgHost: '127.0.0.2', pgPort: pgRemote.port, ca: path.join(tmp, 'empty-ca.pem'), authorized: true }));
    assert.notEqual(code, 0);
    assert.match(out, /does not contain a valid PEM certificate/);
    assert.deepEqual(pgRemote.events, []);
    assert.deepEqual(mongoTripwire.events, []);
    assertNoLeak(out);
  });

  test(`${tool} --plan, non-local host without a production authorization: refused by the host guard before any connection`, async () => {
    resetEvents();
    const { code, out } = await runTool(tool, toolEnv({ pgHost: '127.0.0.2', pgPort: pgRemote.port, authorized: false }));
    assert.notEqual(code, 0);
    assert.match(out, /is not localhost\/127\.0\.0\.1, and no production authorization was provided/);
    assert.deepEqual(pgRemote.events, []);
    assert.deepEqual(mongoTripwire.events, []);
    assertNoLeak(out);
  });

  test(`${tool} --plan, local host 127.0.0.1: unchanged documented behavior (no TLS), CA never consulted`, async () => {
    resetEvents();
    const { code, out } = await runTool(tool, toolEnv({ pgHost: '127.0.0.1', pgPort: pgLocal.port, ca: path.join(tmp, 'missing-ca.pem'), authorized: false }));
    assert.notEqual(code, 0);
    assert.deepEqual(pgLocal.events, ['plaintext-startup']);
    assert.doesNotMatch(out, /SUPABASE_CA_CERT_PATH/);
    assertNoLeak(out);
  });
}
