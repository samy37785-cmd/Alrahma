// Supabase HTTP Contract Gate — Local Disposable Postgres Only.
//
// Extends scripts/test-supabase-contract.mjs's proven, reproducible pattern
// (same disposable-Docker-Postgres discipline, same cleanup guarantees) to a
// wider slice of the guest/public HTTP surface: courses/teachers/reviews
// public reads, a dual-locale blog fixture pair (proving ?locale=en and
// ?locale=ar genuinely return different rows for the same slug, not just
// that the 400-on-missing-locale contract holds), and one negative-
// authorization check (a protected route correctly rejecting a guest with
// 401). See backend/tests/contract/supabase-http-contract-gate.contract.test.js
// for the actual HTTP assertions this script runs.
//
// This script NEVER touches the real Supabase project difzynyphojgisrfvrkd,
// never reads backend/.env, and never uses any real secret of any kind —
// every credential here is generated fresh for this run only, for a
// container that is destroyed at the end of it. See assertNoRealSupabaseEnv()
// and assertLocalOnly() below for the explicit, fail-fast guards that make
// that true regardless of what's already set in the calling shell's
// environment.
//
// Usage (from backend/):  npm run test:supabase-http-contract
// Requires: a running local Docker daemon. Nothing else.
//
// Exit code: 0 only if every step succeeded AND the container's removal was
// independently verified. Anything else exits nonzero.

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
const gateTestPath = path.join('tests', 'contract', 'supabase-http-contract-gate.contract.test.js');

// Overridable ONLY so the mandatory verification step (a deliberate
// "Docker image does not exist" failure-path test) can inject a bad image
// without touching this file — never set in normal use.
const PG_IMAGE = process.env.HTTP_CONTRACT_GATE_PG_IMAGE || 'postgres:16';
const DB_NAME = 'alrahma_http_contract_gate';
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;
const PORT_DISCOVERY_ATTEMPTS = 10;
const PORT_DISCOVERY_DELAY_MS = 500;

const LOCALE_FIXTURE_SLUG = 'locale-matrix-post';
const LOCALE_FIXTURE_EN_TITLE = 'HTTP Contract Gate — EN fixture';
const LOCALE_FIXTURE_AR_TITLE = 'بوابة عقد HTTP — محتوى عربي';
const COURSE_FIXTURE_TITLE = 'HTTP Contract Gate — fixture course';

const log = (line) => console.log(`[test:supabase-http-contract] ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const genContainerName = () => `alrahma-http-contract-gate-${Date.now().toString(36)}-${hex(4)}`;

// Fail fast, before touching Docker at all, if the CALLING shell already has
// DATA_BACKEND/SUPABASE_* pointed at something real — this script only ever
// uses the fresh, self-generated values it builds below, so any pre-existing
// real value in the environment is never read, but this guard makes that
// impossible to get wrong by refusing to even start if one looks real.
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
      // Not a parseable URL at all — ignore, this script never reads it anyway.
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
  // Explicit, fail-fast, BEFORE any Express boot — two independent
  // implementations (defense in depth), matching the same discipline
  // scripts/test-supabase-contract.mjs already follows.
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

async function seedFixtures(pool) {
  const translationGroupId = crypto.randomUUID();
  await pool.query(
    `insert into blogs (title, slug, content, excerpt, published, published_at, locale, translation_group_id)
     values ($1, $2, $3, $4, true, now(), 'en', $5)`,
    [LOCALE_FIXTURE_EN_TITLE, LOCALE_FIXTURE_SLUG, 'EN body content for the locale matrix fixture.', 'EN excerpt.', translationGroupId],
  );
  await pool.query(
    `insert into blogs (title, slug, content, excerpt, published, published_at, locale, translation_group_id)
     values ($1, $2, $3, $4, true, now(), 'ar', $5)`,
    [LOCALE_FIXTURE_AR_TITLE, LOCALE_FIXTURE_SLUG, 'محتوى عربي لبوابة اختبار تعدد اللغات.', 'ملخص عربي.', translationGroupId],
  );
  await pool.query(
    `insert into courses (title, description) values ($1, $2)`,
    [COURSE_FIXTURE_TITLE, 'Fixture course for the HTTP contract gate.'],
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
  const runEmail = `supabase-http-contract-${runId}@example.invalid`;
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

    log('seeding fixtures (2 locale-matched blog posts, 1 published course)...');
    await seedFixtures(migratePool);
    await migratePool.end();

    log('booting the real Express app (child process, DATA_BACKEND=supabase) and running the HTTP contract gate matrix...');
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
      HTTP_CONTRACT_GATE_RUN_ID: runId,
    };
    const testResult = await runCommand(process.execPath, ['--test', gateTestPath], { env: testEnv, cwd: backendRoot });
    process.stdout.write(testResult.stdout);
    if (testResult.stderr) process.stderr.write(testResult.stderr);

    log('verifying directly against Postgres (Phase C direct DB proof)...');
    const verifyPool = new pg.Pool({ connectionString: dbUrl });
    const subsMatching = await verifyPool.query('select count(*)::int as n from subscribers where email = $1', [runEmail]);
    const trialsMatching = await verifyPool.query(
      "select count(*)::int as n from trial_requests where email = $1 and message = $2",
      [runEmail, `http-contract-gate-runid:${runId}`],
    );
    const subsTotal = await verifyPool.query('select count(*)::int as n from subscribers');
    const trialsTotal = await verifyPool.query('select count(*)::int as n from trial_requests');
    const coursesTotal = await verifyPool.query('select count(*)::int as n from courses');
    const blogsTotal = await verifyPool.query('select count(*)::int as n from blogs where slug = $1', [LOCALE_FIXTURE_SLUG]);
    log(
      `direct DB proof: subscribers_matching_runid=${subsMatching.rows[0].n}, trial_requests_matching_runid=${trialsMatching.rows[0].n}, ` +
      `subscribers_total=${subsTotal.rows[0].n}, trial_requests_total=${trialsTotal.rows[0].n}, courses_total=${coursesTotal.rows[0].n}, ` +
      `blogs_matching_slug=${blogsTotal.rows[0].n}, migrations_applied=${migrationCount} (this harness applies each migration file's raw SQL ` +
      `directly and does not create drizzle.__drizzle_migrations — same as scripts/test-supabase-contract.mjs)`
    );

    if (testResult.code !== 0) {
      throw new Error(`HTTP contract gate suite exited ${testResult.code} (expected 0)`);
    }
    if (subsMatching.rows[0].n !== 1) throw new Error(`expected exactly 1 subscribers row matching runId, got ${subsMatching.rows[0].n}`);
    if (trialsMatching.rows[0].n !== 1) throw new Error(`expected exactly 1 trial_requests row matching runId, got ${trialsMatching.rows[0].n}`);
    if (subsTotal.rows[0].n !== 1) throw new Error(`expected subscribers to contain ONLY the run's own row, got ${subsTotal.rows[0].n} total rows`);
    if (trialsTotal.rows[0].n !== 1) throw new Error(`expected trial_requests to contain ONLY the run's own row, got ${trialsTotal.rows[0].n} total rows`);
    if (coursesTotal.rows[0].n !== 1) throw new Error(`expected courses to still contain exactly the 1 seeded fixture row, got ${coursesTotal.rows[0].n}`);
    if (blogsTotal.rows[0].n !== 2) throw new Error(`expected exactly 2 blog rows (en+ar) for the locale fixture slug, got ${blogsTotal.rows[0].n} — read paths must never write`);

    log('cleaning up test data (deleting the run-id-tagged rows only) before container teardown...');
    await verifyPool.query('delete from subscribers where email = $1', [runEmail]);
    await verifyPool.query('delete from trial_requests where email = $1 and message = $2', [runEmail, `http-contract-gate-runid:${runId}`]);
    const subsAfterCleanup = await verifyPool.query('select count(*)::int as n from subscribers');
    const trialsAfterCleanup = await verifyPool.query('select count(*)::int as n from trial_requests');
    await verifyPool.end();
    log(`post-cleanup counts: subscribers=${subsAfterCleanup.rows[0].n}, trial_requests=${trialsAfterCleanup.rows[0].n} (expected 0 each)`);
    if (subsAfterCleanup.rows[0].n !== 0) throw new Error(`cleanup did not remove the subscribers test row — ${subsAfterCleanup.rows[0].n} remain`);
    if (trialsAfterCleanup.rows[0].n !== 0) throw new Error(`cleanup did not remove the trial_requests test row — ${trialsAfterCleanup.rows[0].n} remain`);

    log('all checks passed: full HTTP contract gate matrix, direct DB proof, and cleanup all verified.');
    exitCode = 0;
  } catch (err) {
    console.error(`[test:supabase-http-contract] FAILED: ${err.message}`);
    exitCode = 1;
  } finally {
    log(`cleanup: stopping and verifying removal of "${containerName}"...`);
    const cleanupResult = await cleanupContainer(containerName);
    if (cleanupResult.verified) {
      log('cleanup verified: container absent.');
    } else {
      console.error(`[test:supabase-http-contract] cleanup NOT verified (presence=${cleanupResult.finalPresence}) — manual cleanup may be required: docker rm -f ${containerName}`);
      exitCode = 1;
    }
    process.exitCode = exitCode;
  }
}

main();
