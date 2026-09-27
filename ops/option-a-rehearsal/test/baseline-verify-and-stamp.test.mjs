// Real, end-to-end test of scripts/baseline-verify-and-stamp.mjs against
// a disposable local Postgres — not a reimplementation of its logic, the
// actual script run as a child process, exactly as it would run against
// a real project (minus TLS, which is not required for localhost).
//
// Two scenarios, both against a FRESH, uniquely-named, auto-torn-down
// container (never reused across runs, matching lib/db/test/
// orchestrate-db-tests.mjs's own discipline):
//
//   A) POSITIVE — migrations 0000 through 0021 applied as raw SQL only
//      (no drizzle bookkeeping at all, exactly mimicking the real
//      project's actual state discovered this session: real tables,
//      zero migration history). Confirms the script: (1) reports every
//      one of 0000-0021 as CONFIRMED, (2) correctly stops at the first
//      migration whose objects are genuinely absent (0022), (3) in
//      --apply-baseline-stamp mode writes exactly one bookkeeping row,
//      and (4) — the real proof this design works, not just that the
//      script runs — a SUBSEQUENT REAL `lib/db/test/run-migrations.mjs`
//      run against that same database then succeeds with NO "already
//      exists" error and actually applies 0022 onward (verified by
//      querying for 0026's blogs.locale column and 0027's
//      security_invoker reloption directly afterward).
//
//   B) NEGATIVE — migrations 0000 through 0019 applied, 0020 (and
//      everything after) deliberately left out. Confirms the script
//      correctly reports 0020 NOT CONFIRMED (missing
//      subscriptions.renewal_reminder_sent_for), everything after it
//      NOT-CHECKED, and refuses to stamp anything beyond 0019 — proving
//      it fails closed on a real gap instead of over-claiming baseline
//      coverage.
//
// Requires only a running local Docker daemon.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions } from '../../../lib/db/test/local-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, '..');
const repoRoot = path.resolve(opsDir, '..', '..');
const drizzleDir = path.join(repoRoot, 'lib', 'db', 'drizzle');
const baselineScript = path.join(opsDir, 'scripts', 'baseline-verify-and-stamp.mjs');
const runMigrationsScript = path.join(repoRoot, 'lib', 'db', 'test', 'run-migrations.mjs');

const PG_IMAGE = 'postgres:16';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function startDisposablePostgres(dbName) {
  const crypto = await import('node:crypto');
  const containerName = `alrahma-baseline-test-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(24).toString('hex');
  const run = await runCommand('docker', [
    'run', '--rm', '-d', '--name', containerName,
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${dbName}`,
    '-p', '127.0.0.1::5432', PG_IMAGE,
  ]);
  if (run.code !== 0) throw new Error(`docker run failed: ${run.stderr}`);
  let hostPort = null;
  for (let i = 0; i < 10; i++) {
    const portResult = await runCommand('docker', ['port', containerName, '5432/tcp']);
    const match = portResult.stdout.trim().match(/:(\d+)\s*$/);
    if (portResult.code === 0 && match) { hostPort = match[1]; break; }
    await sleep(500);
  }
  if (!hostPort) throw new Error('could not discover host port');
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    const check = await runCommand('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', dbName]);
    if (check.code === 0) { ready = true; break; }
    await sleep(1000);
  }
  if (!ready) throw new Error('postgres did not become ready');
  return { containerName, url: `postgres://postgres:${password}@127.0.0.1:${hostPort}/${dbName}` };
}

async function stopDisposablePostgres(containerName) {
  await runCommand('docker', ['stop', containerName]).catch(() => {});
}

// Applies journal entries [0, uptoIdxInclusive] as raw SQL, splitting on
// the same statement-breakpoint marker drizzle's own migrator splits on
// — deliberately NOT using drizzle's migrate() here, since the whole
// point of this fixture is to simulate a database with real schema but
// ZERO drizzle bookkeeping, exactly like the real project.
async function applyRawMigrationsUpTo(pool, uptoIdxInclusive) {
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta', '_journal.json'), 'utf8'));
  for (const entry of journal.entries) {
    if (entry.idx > uptoIdxInclusive) break;
    const sql = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) await pool.query(stmt);
  }
}

test('A) positive: 0000-0021 applied, baseline script confirms exactly that range, stamps it, and a real run-migrations.mjs run then cleanly applies only 0022+', async (t) => {
  const { containerName, url } = await startDisposablePostgres('alrahma_baseline_pos');
  try {
    const pool = new pg.Pool({ connectionString: url });
    await createLocalAuthUsersStub(pool);
    await createLocalAuthRolesAndFunctions(pool);
    await applyRawMigrationsUpTo(pool, 21);
    await pool.end();

    const dryRun = await runCommand(process.execPath, [baselineScript, '--database-url', url, '--dry-run']);
    assert.equal(dryRun.code, 0, `dry run should exit 0:\n${dryRun.stdout}\n${dryRun.stderr}`);
    for (let i = 0; i <= 21; i++) {
      const tag = i.toString().padStart(4, '0');
      assert.match(dryRun.stdout, new RegExp(`CONFIRMED\\s+${tag}_`), `expected ${tag} to be reported CONFIRMED`);
    }
    assert.match(dryRun.stdout, /NOT-CONFIRMED\s+0022_.*migration_source_ledger/, 'expected 0022 (first genuinely-absent migration, since only 0000-0021 were applied) to be reported NOT CONFIRMED with its missing objects named');
    assert.match(dryRun.stdout, /NOT-CHECKED\s+0027_/, 'expected 0027 (well after the stop point) to be reported NOT-CHECKED');
    assert.match(dryRun.stdout, /DRY RUN — nothing written/, 'dry run must not claim anything was written');

    const apply = await runCommand(process.execPath, [baselineScript, '--database-url', url, '--apply-baseline-stamp']);
    assert.equal(apply.code, 0, `apply should exit 0:\n${apply.stdout}\n${apply.stderr}`);
    assert.match(apply.stdout, /now has exactly 1 row/);

    const verifyPool = new pg.Pool({ connectionString: url });
    const rows = await verifyPool.query('select hash, created_at from drizzle.__drizzle_migrations');
    assert.equal(rows.rows.length, 1, 'exactly one bookkeeping row');
    assert.equal(String(rows.rows[0].created_at), '1788800009000', 'created_at must be 0021\'s own journal "when" value');
    await verifyPool.end();

    const migrate = await runCommand(process.execPath, [runMigrationsScript], { env: { ...process.env, TEST_DATABASE_URL: url } });
    assert.equal(migrate.code, 0, `real run-migrations.mjs must succeed with no "already exists" error:\n${migrate.stdout}\n${migrate.stderr}`);
    assert.doesNotMatch(migrate.stdout + migrate.stderr, /already exists/i);

    const finalPool = new pg.Pool({ connectionString: url });
    const blogCols = await finalPool.query(`select column_name from information_schema.columns where table_name = 'blogs' and column_name in ('locale', 'translation_group_id')`);
    assert.equal(blogCols.rows.length, 2, '0026 (blog locale) must have actually applied after baselining');
    const viewOpts = await finalPool.query(`select reloptions from pg_class where relname = 'reviews_public'`);
    assert.ok(viewOpts.rows[0].reloptions?.includes('security_invoker=on'), '0027 (security definer view fix) must have actually applied after baselining');
    await finalPool.end();
  } finally {
    await stopDisposablePostgres(containerName);
  }
});

test('B) negative: 0000-0019 applied only, baseline script stops at 0020 (missing) and refuses to overclaim', async (t) => {
  const { containerName, url } = await startDisposablePostgres('alrahma_baseline_neg');
  try {
    const pool = new pg.Pool({ connectionString: url });
    await createLocalAuthUsersStub(pool);
    await createLocalAuthRolesAndFunctions(pool);
    await applyRawMigrationsUpTo(pool, 19);
    await pool.end();

    const dryRun = await runCommand(process.execPath, [baselineScript, '--database-url', url, '--dry-run']);
    assert.equal(dryRun.code, 0);
    for (let i = 0; i <= 19; i++) {
      const tag = i.toString().padStart(4, '0');
      assert.match(dryRun.stdout, new RegExp(`CONFIRMED\\s+${tag}_`), `expected ${tag} to be reported CONFIRMED`);
    }
    assert.match(dryRun.stdout, /NOT-CONFIRMED\s+0020_.*renewal_reminder_sent_for/, 'expected 0020 to be reported NOT CONFIRMED with the specific missing column named');
    assert.match(dryRun.stdout, /NOT-CHECKED\s+0021_/, 'expected everything after the gap to be NOT-CHECKED, never silently confirmed');
    assert.match(dryRun.stdout, /Last confirmed-contiguous migration: 0019_/, 'must not claim baseline coverage past the real gap');

    const apply = await runCommand(process.execPath, [baselineScript, '--database-url', url, '--apply-baseline-stamp']);
    assert.equal(apply.code, 0);
    const verifyPool = new pg.Pool({ connectionString: url });
    const rows = await verifyPool.query('select created_at from drizzle.__drizzle_migrations');
    assert.equal(String(rows.rows[0].created_at), '1788800007000', 'stamped created_at must be 0019\'s own journal "when" value, not 0020\'s or later');
    await verifyPool.end();
  } finally {
    await stopDisposablePostgres(containerName);
  }
});
