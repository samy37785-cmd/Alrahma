// Reproducible, single-command runtime proof for the `authenticated` and
// `service_role` Supabase roles — the two roles npm run test:supabase-
// contract's anon/guest-only proof explicitly did not cover (see its
// scripts/test-supabase-contract.mjs and tests/contract/last-verified-
// run.md, both left unmodified by this addition).
//
// Same shape as test-supabase-contract.mjs (disposable local Postgres,
// migrations applied, real Express app booted with DATA_BACKEND=supabase,
// guaranteed cleanup) — see that file's own header for the full mechanics,
// not repeated here. The one addition: two throwaway, local-only Stripe
// keys (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) so the real webhook
// signature-verification code path can be exercised for real (Stripe's
// webhook signing is pure local HMAC — `stripe.webhooks.
// generateTestHeaderString()` needs no network call and no real Stripe
// account).
//
// Usage (from backend/):  npm run test:supabase-auth-service-contract
// Requires: a running local Docker daemon. No real Supabase project, no
// Render, no Mongo, no real Stripe account, no real secret of any kind.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runCommand, redact, interpretDockerPsResult } from '../../lib/db/test/orchestrator-lib.mjs';
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions } from '../../lib/db/test/local-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const repoRoot = path.join(backendRoot, '..');
const drizzleDir = path.join(repoRoot, 'lib', 'db', 'drizzle');
const contractTestPath = path.join('tests', 'contract', 'supabase-adapter-auth-service.contract.test.js');

const PG_IMAGE = 'postgres:16';
const DB_NAME = 'alrahma_supabase_auth_service_contract';
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;
const PORT_DISCOVERY_ATTEMPTS = 10;
const PORT_DISCOVERY_DELAY_MS = 500;

const log = (line) => console.log(`[test:supabase-auth-service-contract] ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const genContainerName = () => `alrahma-supabase-auth-svc-${Date.now().toString(36)}-${hex(4)}`;

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
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`refusing to proceed: self-generated URL host "${host}" is not localhost/127.0.0.1`);
  }
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
}

async function checkContainerPresence(containerName) {
  try {
    const check = await runCommand('docker', ['ps', '-a', '--filter', `name=^${containerName}$`, '--format', '{{.Names}}']);
    return interpretDockerPsResult(check, containerName);
  } catch {
    return interpretDockerPsResult(null, containerName);
  }
}

async function cleanup(containerName) {
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
  log('checking Docker availability...');
  await assertDockerAvailable();

  const containerName = genContainerName();
  let exitCode = 1;

  try {
    log(`starting disposable Postgres "${containerName}" (${PG_IMAGE}, 127.0.0.1 only, random port + password)...`);
    const dbUrl = await startDisposablePostgres(containerName);
    log(`ready: ${redact(dbUrl)}`);

    const migratePool = new pg.Pool({ connectionString: dbUrl });
    log('applying local auth stub (auth.users / anon,authenticated,service_role / auth.uid(),auth.jwt())...');
    await createLocalAuthUsersStub(migratePool);
    await createLocalAuthRolesAndFunctions(migratePool);

    log('applying lib/db/drizzle migrations (0000 through latest)...');
    await applyMigrations(migratePool);
    await migratePool.end();

    log('booting the real Express app (child process, DATA_BACKEND=supabase) and running the auth/service_role contract suite...');
    const testEnv = {
      ...process.env,
      DATA_BACKEND: 'supabase',
      SUPABASE_DB_URL: dbUrl,
      SUPABASE_URL: 'http://127.0.0.1:0',
      SUPABASE_ANON_KEY: 'dummy',
      SUPABASE_SERVICE_ROLE_KEY: 'dummy',
      SUPABASE_JWT_SECRET: `local-only-${hex(16)}`,
      MONGO_URI: 'mongodb://127.0.0.1:1/unused',
      JWT_SECRET: `local-only-${hex(16)}`,
      ADMIN_ENCRYPTION_KEY: hex(32),
      ADMIN_JWT_ACCESS_SECRET: hex(64),
      // Local-only, throwaway Stripe test keys — never a real account.
      // STRIPE_SECRET_KEY only needs to look like a key (the `stripe`
      // package only rejects an empty string, not an invalid one — no
      // Stripe API call is made by the test's chosen event type).
      // STRIPE_WEBHOOK_SECRET is the shared HMAC secret this run both
      // signs with and verifies against — pure local cryptography.
      STRIPE_SECRET_KEY: `sk_test_local_only_${hex(16)}`,
      STRIPE_WEBHOOK_SECRET: `whsec_local_only_${hex(16)}`,
      NODE_ENV: 'test',
    };
    const testResult = await runCommand(process.execPath, ['--test', contractTestPath], { env: testEnv, cwd: backendRoot });
    process.stdout.write(testResult.stdout);
    if (testResult.stderr) process.stderr.write(testResult.stderr);

    if (testResult.code !== 0) {
      throw new Error(`auth/service_role contract suite exited ${testResult.code} (expected 0)`);
    }

    log('all checks passed: authenticated user isolation (app-layer + direct RLS) and a real service_role webhook path, both proven against a real Postgres.');
    exitCode = 0;
  } catch (err) {
    console.error(`[test:supabase-auth-service-contract] FAILED: ${err.message}`);
    exitCode = 1;
  } finally {
    log(`cleanup: stopping and verifying removal of "${containerName}"...`);
    const cleanupResult = await cleanup(containerName);
    if (cleanupResult.verified) {
      log('cleanup verified: container absent.');
    } else {
      console.error(`[test:supabase-auth-service-contract] cleanup NOT verified (presence=${cleanupResult.finalPresence}) — manual cleanup may be required: docker rm -f ${containerName}`);
      exitCode = 1;
    }
    process.exitCode = exitCode;
  }
}

main();
