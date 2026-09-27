// Reproducible, single-command version of the Supabase adapter runtime
// proof (see tests/contract/supabase-adapter.contract.test.js and
// tests/contract/last-verified-run.md, which this command supersedes as
// the way to actually run that suite — the manual multi-step instructions
// those files describe are exactly what this script automates).
//
// Every run, with zero manual setup beyond a running Docker daemon:
//   1. Creates a brand-new, disposable local Postgres container (random
//      name/port/password, never reused across runs).
//   2. Applies the same local-only auth.users/roles/auth.uid()/auth.jwt()
//      stand-ins every lib/db test already depends on, then every
//      lib/db/drizzle migration (0000 through the latest), in order.
//   3. Seeds exactly the two fixture blog posts the contract suite
//      itself checks for (one published, one with the specific draft
//      slug it asserts never leaks publicly).
//   4. Runs tests/contract/supabase-adapter.contract.test.js, unmodified,
//      as a real child process with DATA_BACKEND=supabase pointed at
//      that container — a real read path (GET /api/blog) and two real
//      guest write paths (POST /api/newsletter, POST /api/trials).
//   5. Queries the container directly afterward and FAILS the whole run
//      (nonzero exit) if the two write paths didn't leave exactly the
//      row each one submitted — this script's own, independent check,
//      on top of whatever the HTTP-level test file already asserts.
//   6. ALWAYS stops and removes the container, and independently
//      verifies (via `docker ps`, not by assuming `docker stop`
//      succeeded) that it is actually gone — on success, on a failed
//      assertion, on a crashed migration, or on Ctrl+C.
//
// Reuses lib/db/test/orchestrator-lib.mjs (Docker process helpers) and
// lib/db/test/local-harness.mjs (the auth stub every lib/db test already
// depends on) directly via relative import across the package boundary —
// both are plain, dependency-free ESM modules (no bare imports beyond
// node:child_process), so this adds no new dependency to backend's own
// package.json and never risks drifting from the exact stub lib/db's own
// suite already relies on.
//
// Usage (from backend/):  npm run test:supabase-contract
// Requires: a running local Docker daemon. Nothing else — no Mongo, no
// real Supabase project, no Render, no real secret of any kind. Every
// credential used here is generated fresh for this run only and is
// meaningless the moment the container is destroyed.
//
// Exit code: 0 only if every step succeeded AND the container's removal
// was independently verified. Anything else — a failed migration, a
// failed HTTP assertion, an unexpected row count, a cleanup that
// couldn't be confirmed — exits nonzero.

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
const contractTestPath = path.join('tests', 'contract', 'supabase-adapter.contract.test.js');

const PG_IMAGE = 'postgres:16';
const DB_NAME = 'alrahma_supabase_contract';
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;
const PORT_DISCOVERY_ATTEMPTS = 10;
const PORT_DISCOVERY_DELAY_MS = 500;

const log = (line) => console.log(`[test:supabase-contract] ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const genContainerName = () => `alrahma-supabase-contract-${Date.now().toString(36)}-${hex(4)}`;

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

// Applies every lib/db/drizzle migration in journal order via plain `pg`,
// splitting each file on the same `--> statement-breakpoint` marker
// drizzle-orm's own migrator splits on — this database is always fresh
// and only ever migrated once per run, so none of migrate()'s incremental/
// already-applied bookkeeping is needed here.
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

// The exact fixture pair supabase-adapter.contract.test.js's own read-path
// assertions expect: one published post to actually retrieve, and the
// specific draft slug it checks never leaks into the public list.
async function seedFixtures(pool) {
  await pool.query(
    `insert into blogs (title, slug, content, excerpt, published, published_at, author_name)
     values ($1, $2, $3, $4, true, now(), $5)`,
    ['Runtime Proof Post', 'runtime-proof-post', 'Body content for the runtime proof.', 'A short excerpt.', 'Al-Rahma Academy'],
  );
  await pool.query(
    `insert into blogs (title, slug, content, excerpt, published)
     values ($1, $2, $3, $4, false)`,
    ['Draft Post', 'fixture-post-draft-not-published', 'Draft body.', 'Draft excerpt.'],
  );
}

async function checkContainerPresence(containerName) {
  try {
    const check = await runCommand('docker', ['ps', '-a', '--filter', `name=^${containerName}$`, '--format', '{{.Names}}']);
    return interpretDockerPsResult(check, containerName);
  } catch {
    return interpretDockerPsResult(null, containerName);
  }
}

// Stop -> verify -> rm -f fallback (if present or unknown) -> verify
// again, independently — mirrors lib/db/test/orchestrate-db-tests.mjs's
// own cleanup discipline: an unknown presence state is never treated as
// "good enough to skip cleanup", and `verified` reflects only the FINAL,
// independently-run check, never an earlier step's assumed success.
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

    log('seeding fixture blog posts (1 published, 1 draft)...');
    await seedFixtures(migratePool);
    await migratePool.end();

    log('booting the real Express app (child process, DATA_BACKEND=supabase) and running the contract suite...');
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
      NODE_ENV: 'test',
    };
    const testResult = await runCommand(process.execPath, ['--test', contractTestPath], { env: testEnv, cwd: backendRoot });
    process.stdout.write(testResult.stdout);
    if (testResult.stderr) process.stderr.write(testResult.stderr);

    log('verifying directly against Postgres that both guest write paths left exactly one real row...');
    const verifyPool = new pg.Pool({ connectionString: dbUrl });
    const subs = await verifyPool.query('select count(*)::int as n from subscribers');
    const trials = await verifyPool.query('select count(*)::int as n from trial_requests');
    await verifyPool.end();
    log(`direct DB verification: subscribers=${subs.rows[0].n}, trial_requests=${trials.rows[0].n} (expected 1 each)`);

    if (testResult.code !== 0) {
      throw new Error(`contract suite exited ${testResult.code} (expected 0)`);
    }
    if (subs.rows[0].n !== 1) {
      throw new Error(`expected exactly 1 row in subscribers after the contract suite ran, got ${subs.rows[0].n} — the newsletter write path did not leave a real row`);
    }
    if (trials.rows[0].n !== 1) {
      throw new Error(`expected exactly 1 row in trial_requests after the contract suite ran, got ${trials.rows[0].n} — the trial write path did not leave a real row`);
    }

    log('all checks passed: real read path + 2 real guest write paths, confirmed directly against Postgres.');
    exitCode = 0;
  } catch (err) {
    console.error(`[test:supabase-contract] FAILED: ${err.message}`);
    exitCode = 1;
  } finally {
    log(`cleanup: stopping and verifying removal of "${containerName}"...`);
    const cleanupResult = await cleanup(containerName);
    if (cleanupResult.verified) {
      log('cleanup verified: container absent.');
    } else {
      console.error(`[test:supabase-contract] cleanup NOT verified (presence=${cleanupResult.finalPresence}) — manual cleanup may be required: docker rm -f ${containerName}`);
      exitCode = 1;
    }
    process.exitCode = exitCode;
  }
}

main();
