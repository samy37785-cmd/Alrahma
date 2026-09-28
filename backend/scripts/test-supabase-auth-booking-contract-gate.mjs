// Supabase Authenticated + Enrollment Booking HTTP Contract Gate — Local Only.
//
// Extends scripts/test-supabase-auth-service-contract.mjs's proven pattern
// (disposable Docker Postgres, local auth.users/RLS stub, real Express app
// boot, guaranteed cleanup) to the enrollment/booking HTTP surface: auth guard
// on a real protected route, user isolation (app-layer + direct RLS) on
// quran_bookmarks, and a real guest booking submission + owner-only read via
// routes/data/supabase/enrollmentController.js. See
// tests/contract/supabase-auth-booking-contract-gate.contract.test.js for the
// actual HTTP assertions this script runs.
//
// This script NEVER touches the real Supabase project, never reads
// backend/.env, and never uses any real secret — every credential here is
// generated fresh for this run only, for a container destroyed at the end of
// it. See assertNoRealSupabaseEnv() and assertLocalOnly()/assertLocalHost()
// below for the explicit, fail-fast guards that make that true regardless of
// what's already set in the calling shell's environment.
//
// Usage (from backend/):  npm run test:supabase-auth-booking-contract
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
const gateTestPath = path.join('tests', 'contract', 'supabase-auth-booking-contract-gate.contract.test.js');

// Overridable ONLY so the mandatory verification step (a deliberate
// "Docker image does not exist" failure-path test) can inject a bad image
// without touching this file — never set in normal use.
const PG_IMAGE = process.env.AUTH_BOOKING_GATE_PG_IMAGE || 'postgres:16';
const DB_NAME = 'alrahma_auth_booking_contract_gate';
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;
const PORT_DISCOVERY_ATTEMPTS = 10;
const PORT_DISCOVERY_DELAY_MS = 500;

const log = (line) => console.log(`[test:supabase-auth-booking-contract] ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const genContainerName = () => `alrahma-auth-booking-gate-${Date.now().toString(36)}-${hex(4)}`;

// Fail fast, before touching Docker at all, if the CALLING shell already has
// SUPABASE_DB_URL pointed at something real — this script only ever uses the
// fresh, self-generated value it builds below, so a pre-existing real value
// is never read, but a non-local value in the environment is refused outright
// rather than silently ignored.
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
  // implementations (defense in depth), matching the same discipline every
  // other script in this family follows.
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
  const notesTag = `auth-booking-gate-runid:${runId}`;
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

    log('booting the real Express app (child process, DATA_BACKEND=supabase) and running the auth + booking contract gate matrix...');
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
      AUTH_BOOKING_GATE_RUN_ID: runId,
    };
    const testResult = await runCommand(process.execPath, ['--test', gateTestPath], { env: testEnv, cwd: backendRoot });
    process.stdout.write(testResult.stdout);
    if (testResult.stderr) process.stderr.write(testResult.stderr);

    // Every step below runs regardless of testResult.code — cleanup must
    // happen on failure too (a failed HTTP assertion must never leave
    // tagged rows behind), and the pool used for it MUST be closed with
    // .end() before the outer finally's `docker stop`, or the container
    // shutdown kills the still-open connection out from under it and
    // crashes the whole process with an unhandled 'error' event instead of
    // exiting cleanly with a readable message (found by actually hitting
    // this on the real bug below, not assumed).
    log('verifying directly against Postgres (Phase C direct DB proof)...');
    let dbProof;
    const verifyPool = new pg.Pool({ connectionString: dbUrl });
    try {
      const enrollmentsMatching = await verifyPool.query('select count(*)::int as n from enrollments where notes = $1', [notesTag]);
      const enrollmentsTotal = await verifyPool.query('select count(*)::int as n from enrollments');
      const bookmarksMatching = await verifyPool.query('select count(*)::int as n from quran_bookmarks where note = $1', [notesTag]);
      const usersMatching = await verifyPool.query(`select count(*)::int as n from auth.users where email like $1`, [`auth-booking-gate-%-${runId}@example.invalid`]);
      dbProof = {
        enrollmentsMatching: enrollmentsMatching.rows[0].n,
        enrollmentsTotal: enrollmentsTotal.rows[0].n,
        bookmarksMatching: bookmarksMatching.rows[0].n,
        usersMatching: usersMatching.rows[0].n,
      };
      log(
        `direct DB proof: enrollments_matching_runid=${dbProof.enrollmentsMatching}, enrollments_total=${dbProof.enrollmentsTotal}, ` +
        `bookmarks_matching_runid=${dbProof.bookmarksMatching}, seeded_users_matching_runid=${dbProof.usersMatching}, ` +
        `migrations_applied=${migrationCount} (this harness applies each migration file's raw SQL directly and does not create ` +
        `drizzle.__drizzle_migrations — same as scripts/test-supabase-contract.mjs)`
      );

      log('cleaning up test data (deleting only this run\'s tagged rows) before container teardown...');
      await verifyPool.query('delete from enrollments where notes = $1', [notesTag]);
      await verifyPool.query('delete from quran_bookmarks where note = $1', [notesTag]);
      // profiles deleted first (no FK from profiles back to enrollments/
      // bookmarks; auth.users.id is profiles' own FK target) so the
      // seeded auth.users rows below can be removed cleanly either way.
      await verifyPool.query(`delete from profiles where id in (select id from auth.users where email like $1)`, [`auth-booking-gate-%-${runId}@example.invalid`]);
      await verifyPool.query(`delete from auth.users where email like $1`, [`auth-booking-gate-%-${runId}@example.invalid`]);

      const enrollmentsAfterCleanup = await verifyPool.query('select count(*)::int as n from enrollments');
      const bookmarksAfterCleanup = await verifyPool.query('select count(*)::int as n from quran_bookmarks');
      const usersAfterCleanup = await verifyPool.query(`select count(*)::int as n from auth.users where email like $1`, [`auth-booking-gate-%-${runId}@example.invalid`]);
      dbProof.enrollmentsAfterCleanup = enrollmentsAfterCleanup.rows[0].n;
      dbProof.bookmarksAfterCleanup = bookmarksAfterCleanup.rows[0].n;
      dbProof.usersAfterCleanup = usersAfterCleanup.rows[0].n;
      log(`post-cleanup counts: enrollments=${dbProof.enrollmentsAfterCleanup}, quran_bookmarks=${dbProof.bookmarksAfterCleanup}, seeded_users_remaining=${dbProof.usersAfterCleanup} (expected 0 each)`);
    } finally {
      await verifyPool.end().catch(() => {});
    }

    if (dbProof.enrollmentsAfterCleanup !== 0) throw new Error(`cleanup did not remove all enrollment test rows — ${dbProof.enrollmentsAfterCleanup} remain`);
    if (dbProof.bookmarksAfterCleanup !== 0) throw new Error(`cleanup did not remove all quran_bookmarks test rows — ${dbProof.bookmarksAfterCleanup} remain`);
    if (dbProof.usersAfterCleanup !== 0) throw new Error(`cleanup did not remove all seeded test users — ${dbProof.usersAfterCleanup} remain`);

    if (testResult.code !== 0) {
      throw new Error(`auth + booking contract gate suite exited ${testResult.code} (expected 0)`);
    }
    // 2 valid POSTs in the "duplicate resubmission" test + 1 in the "owner
    // read" test + 1 direct SQL insert in the "no email claim fails closed"
    // test = 4 real enrollment rows tagged with this run's notes; the 2
    // negative-case (400) submissions must have created none.
    if (dbProof.enrollmentsMatching !== 4) throw new Error(`expected exactly 4 enrollment rows tagged with this run's notes, got ${dbProof.enrollmentsMatching}`);
    if (dbProof.enrollmentsTotal !== 4) throw new Error(`expected enrollments to contain ONLY this run's 4 rows, got ${dbProof.enrollmentsTotal} total rows`);
    // 1 bookmark from the app-layer isolation test + 1 from the direct-RLS
    // test = 2, both tagged with this run's notes.
    if (dbProof.bookmarksMatching !== 2) throw new Error(`expected exactly 2 quran_bookmarks rows tagged with this run's notes, got ${dbProof.bookmarksMatching}`);

    log('all checks passed: auth guard, user isolation (app-layer + direct RLS), and real guest booking submission + direct DB proof, all verified against a real Postgres, cleanup verified.');
    exitCode = 0;
  } catch (err) {
    console.error(`[test:supabase-auth-booking-contract] FAILED: ${err.message}`);
    exitCode = 1;
  } finally {
    log(`cleanup: stopping and verifying removal of "${containerName}"...`);
    const cleanupResult = await cleanupContainer(containerName);
    if (cleanupResult.verified) {
      log('cleanup verified: container absent.');
    } else {
      console.error(`[test:supabase-auth-booking-contract] cleanup NOT verified (presence=${cleanupResult.finalPresence}) — manual cleanup may be required: docker rm -f ${containerName}`);
      exitCode = 1;
    }
    process.exitCode = exitCode;
  }
}

main();
