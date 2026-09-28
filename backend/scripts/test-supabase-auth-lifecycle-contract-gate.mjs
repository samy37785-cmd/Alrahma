// Supabase Auth Lifecycle HTTP Contract Gate — Local Disposable Postgres Only.
//
// See tests/contract/auth-lifecycle-gate-architecture-audit.md for the full
// Phase A audit. This script never touches the real Supabase project, never
// reads backend/.env, and never uses any real secret — every credential here
// is generated fresh for this run only, for a container destroyed at the end
// of it. See assertNoRealSupabaseEnv()/assertLocalOnly()/assertLocalHost()
// below for the explicit, fail-fast guards.
//
// Usage (from backend/):  npm run test:supabase-auth-lifecycle-contract
// Requires: a running local Docker daemon. Nothing else.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runCommand, redact, interpretDockerPsResult, assertLocalOnly } from '../../lib/db/test/orchestrator-lib.mjs';
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions, assertLocalHost } from '../../lib/db/test/local-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const repoRoot = path.join(backendRoot, '..');
const drizzleDir = path.join(repoRoot, 'lib', 'db', 'drizzle');
const gateTestPath = path.join('tests', 'contract', 'supabase-auth-lifecycle-contract-gate.contract.test.js');

const PG_IMAGE = process.env.AUTH_LIFECYCLE_GATE_PG_IMAGE || 'postgres:16';
const DB_NAME = 'alrahma_auth_lifecycle_contract_gate';
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;
const PORT_DISCOVERY_ATTEMPTS = 10;
const PORT_DISCOVERY_DELAY_MS = 500;

const log = (line) => console.log(`[test:supabase-auth-lifecycle-contract] ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const genContainerName = () => `alrahma-auth-lifecycle-gate-${Date.now().toString(36)}-${hex(4)}`;

function assertNoRealSupabaseEnv() {
  const url = process.env.SUPABASE_DB_URL;
  if (url) {
    try {
      const host = new URL(url).hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        throw new Error(
          `Refusing to start: the calling shell's SUPABASE_DB_URL points at host "${host}", not localhost/127.0.0.1. ` +
          `This gate only ever uses its own freshly-generated local container URL and ignores this variable, but a ` +
          `non-local value in the environment is refused outright rather than silently ignored.`
        );
      }
    } catch (err) {
      if (err.message.startsWith('Refusing to start')) throw err;
    }
  }
}

async function assertDockerAvailable() {
  const result = await runCommand('docker', ['version', '--format', '{{.Server.Version}}']).catch((err) => {
    throw new Error(`Docker is not available on PATH (${err.message}). This command requires a running local Docker daemon.`);
  });
  if (result.code !== 0) {
    throw new Error(`\`docker version\` exited ${result.code}: ${result.stderr.trim()}`);
  }
}

async function startDisposablePostgres(containerName) {
  const password = hex(24);
  const run = await runCommand('docker', [
    'run', '--rm', '-d', '--name', containerName,
    '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', '127.0.0.1::5432',
    PG_IMAGE,
  ]);
  if (run.code !== 0) throw new Error(`docker run failed (exit ${run.code}): ${run.stderr.trim()}`);

  let hostPort = null;
  for (let attempt = 1; attempt <= PORT_DISCOVERY_ATTEMPTS; attempt++) {
    const portResult = await runCommand('docker', ['port', containerName, '5432/tcp']);
    const match = portResult.stdout.trim().match(/:(\d+)\s*$/);
    if (portResult.code === 0 && match) { hostPort = match[1]; break; }
    await sleep(PORT_DISCOVERY_DELAY_MS);
  }
  if (!hostPort) throw new Error(`Could not discover the host port Docker assigned to "${containerName}" (5432/tcp).`);

  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    const check = await runCommand('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', DB_NAME]);
    if (check.code === 0) { ready = true; break; }
    await sleep(READY_POLL_MS);
  }
  if (!ready) throw new Error(`Postgres in container "${containerName}" did not become ready within ${READY_TIMEOUT_MS}ms.`);

  const url = `postgres://postgres:${password}@127.0.0.1:${hostPort}/${DB_NAME}`;
  assertLocalOnly(url, 'self-generated container URL');
  assertLocalHost(url, 'self-generated container URL');
  return url;
}

async function applyMigrations(pool) {
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta', '_journal.json'), 'utf8'));
  for (const entry of journal.entries) {
    const filePath = path.join(drizzleDir, `${entry.tag}.sql`);
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) {
      await pool.query(statement);
    }
  }
  return journal.entries.length;
}

async function checkContainerPresence(containerName) {
  try {
    const check = await runCommand('docker', ['ps', '-a', '--filter', `name=^${containerName}$`, '--format', '{{.Names}}']);
    return interpretDockerPsResult(check, containerName);
  } catch {
    return interpretDockerPsResult(null, containerName);
  }
}

async function cleanupContainer(containerName) {
  if (!containerName) return { verified: true, finalPresence: false };
  await runCommand('docker', ['stop', containerName]).catch(() => {});
  const initial = await checkContainerPresence(containerName);
  if (initial.presence === true || initial.presence === null) {
    await runCommand('docker', ['rm', '-f', containerName]).catch(() => {});
  }
  const final = await checkContainerPresence(containerName);
  return { verified: final.exitCode === 0 && final.presence === false, finalPresence: final.presence };
}

async function main() {
  assertNoRealSupabaseEnv();

  log('checking Docker availability...');
  await assertDockerAvailable();

  const containerName = genContainerName();
  const runId = hex(8);
  let exitCode = 1;
  let dbUrl = null;

  try {
    log(`starting disposable Postgres "${containerName}" (${PG_IMAGE}, 127.0.0.1 only, random port + password)...`);
    dbUrl = await startDisposablePostgres(containerName);
    log(`ready: ${redact(dbUrl)}`);

    const migratePool = new pg.Pool({ connectionString: dbUrl });
    log('applying local auth stub (auth.users / anon,authenticated,service_role / auth.uid(),auth.jwt())...');
    await createLocalAuthUsersStub(migratePool);
    await createLocalAuthRolesAndFunctions(migratePool);

    log('applying lib/db/drizzle migrations (0000 through latest)...');
    const migrationCount = await applyMigrations(migratePool);
    log(`applied ${migrationCount} migrations.`);
    await migratePool.end();

    log('booting the real Express app (child process, DATA_BACKEND=supabase) and running the auth lifecycle contract gate matrix...');
    const testEnv = {
      ...process.env,
      DATA_BACKEND: 'supabase',
      SUPABASE_DB_URL: dbUrl,
      // Dummy, non-resolving Supabase Auth endpoint/keys — safe because the
      // ONLY tests this gate runs never reach authClients.js's
      // getAdminClient()/getAnonClient() at all (register/login validation
      // failures short-circuit before any Supabase Auth call; /me and
      // /logout never call it either). See the architecture audit doc.
      SUPABASE_URL: 'http://127.0.0.1:0',
      SUPABASE_ANON_KEY: 'dummy',
      SUPABASE_SERVICE_ROLE_KEY: 'dummy',
      SUPABASE_JWT_SECRET: `local-only-${hex(16)}`,
      MONGO_URI: 'mongodb://127.0.0.1:1/unused',
      JWT_SECRET: `local-only-${hex(16)}`,
      ADMIN_ENCRYPTION_KEY: hex(32),
      ADMIN_JWT_ACCESS_SECRET: hex(64),
      NODE_ENV: 'test',
      AUTH_LIFECYCLE_GATE_RUN_ID: runId,
    };
    const testResult = await runCommand(process.execPath, ['--test', gateTestPath], { env: testEnv, cwd: backendRoot });
    process.stdout.write(testResult.stdout);
    if (testResult.stderr) process.stderr.write(testResult.stderr);

    log('verifying directly against Postgres (Phase C.4 direct DB proof + cleanup)...');
    let dbProof;
    const verifyPool = new pg.Pool({ connectionString: dbUrl });
    try {
      const usersMatching = await verifyPool.query(`select count(*)::int as n from auth.users where email like $1`, [`auth-lifecycle-%-${runId}@example.invalid`]);
      const profilesMatching = await verifyPool.query(`select count(*)::int as n from profiles where email like $1`, [`auth-lifecycle-%-${runId}@example.invalid`]);
      dbProof = { usersMatching: usersMatching.rows[0].n, profilesMatching: profilesMatching.rows[0].n };
      log(`direct DB proof: seeded_users_matching_runid=${dbProof.usersMatching}, profiles_matching_runid=${dbProof.profilesMatching}, migrations_applied=${migrationCount} (raw-SQL harness, no drizzle.__drizzle_migrations ledger — same as the other local gates)`);

      log('cleaning up test data (deleting only this run\'s tagged rows) before container teardown...');
      await verifyPool.query(`delete from profiles where email like $1`, [`auth-lifecycle-%-${runId}@example.invalid`]);
      await verifyPool.query(`delete from auth.users where email like $1`, [`auth-lifecycle-%-${runId}@example.invalid`]);

      const usersAfter = await verifyPool.query(`select count(*)::int as n from auth.users where email like $1`, [`auth-lifecycle-%-${runId}@example.invalid`]);
      const profilesAfter = await verifyPool.query(`select count(*)::int as n from profiles where email like $1`, [`auth-lifecycle-%-${runId}@example.invalid`]);
      dbProof.usersAfter = usersAfter.rows[0].n;
      dbProof.profilesAfter = profilesAfter.rows[0].n;
      log(`post-cleanup counts: seeded_users_remaining=${dbProof.usersAfter}, profiles_remaining=${dbProof.profilesAfter} (expected 0 each)`);
    } finally {
      await verifyPool.end().catch(() => {});
    }

    if (dbProof.usersAfter !== 0) throw new Error(`cleanup did not remove all seeded test users — ${dbProof.usersAfter} remain`);
    if (dbProof.profilesAfter !== 0) throw new Error(`cleanup did not remove all seeded test profiles — ${dbProof.profilesAfter} remain`);

    if (testResult.code !== 0) {
      throw new Error(`auth lifecycle contract gate suite exited ${testResult.code} (expected 0)`);
    }

    log('all checks passed: register/login validation boundary, GET /me auth guard + isolation, POST /logout, and the profiles-has-no-password direct DB proof, all verified against a real Postgres, cleanup verified.');
    exitCode = 0;
  } catch (err) {
    console.error(`[test:supabase-auth-lifecycle-contract] FAILED: ${err.message}`);
    exitCode = 1;
  } finally {
    log(`cleanup: stopping and verifying removal of "${containerName}"...`);
    const cleanupResult = await cleanupContainer(containerName);
    if (cleanupResult.verified) {
      log('cleanup verified: container absent.');
    } else {
      console.error(`[test:supabase-auth-lifecycle-contract] cleanup NOT verified (presence=${cleanupResult.finalPresence}) — manual cleanup may be required: docker rm -f ${containerName}`);
      exitCode = 1;
    }
    process.exitCode = exitCode;
  }
}

main();
