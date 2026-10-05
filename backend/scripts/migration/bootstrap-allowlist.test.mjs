#!/usr/bin/env node
// SUPER_ADMIN_SAFETY_GATE, fail-closed tests on a disposable Postgres with
// the full repo schema. The fixture is a realistic owner bootstrap:
//   - the Super Admin exactly as supabase-first-super-admin-bootstrap
//     makes it (auth.users -> profile by trigger -> role admin ->
//     admin_role_assignments 'super-admin');
//   - its admin login audit row (auth.login_stage1, as auditAdminAuthEvent
//     writes it);
//   - the three canonical plans created through create_plan_version() as
//     an AAL2 admin session, which writes one audit row each.
// Then: the matching artifact is allowed; a different UUID, a different
// role, an extra audit row, an extra user, a different/extra plan, and a
// migrated admin promoted to super-admin are each refused; collection and
// verification write nothing; and the orchestrator refuses a missing,
// expired, plan-scope or edited manifest before opening any connection.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { verifyNoUnrecordedData } from './production-import-orchestrator.mjs';
import { collectBootstrapAllowlist, verifyBootstrapState } from './lib/bootstrap-allowlist.mjs';
import { CANONICAL_PLANS } from './lib/plan-catalog.mjs';
import { collectCandidate } from './bootstrap-manifest.mjs';
import { bootstrapAllowlistSha256 } from './lib/bootstrap-allowlist.mjs';
import { signedTestManifest } from './lib/manifest-test-fixture.mjs';
import { makePoolReadOnly } from './lib/read-only-session.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');
const ORCHESTRATOR = path.join(__dirname, 'production-import-orchestrator.mjs');
const SUFFIX = crypto.randomBytes(4).toString('hex');
const PG_NAME = `stage2jb-bootstrap-allowlist-pg-${SUFFIX}`;
const ADMIN = crypto.randomUUID();
const ADMIN_EMAIL = 'owner-bootstrap@example.invalid';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startDisposablePostgres() {
  const run = await runCommand('docker', ['run', '--rm', '-d', '--name', PG_NAME, '-e', 'POSTGRES_PASSWORD=postgres', '-p', '127.0.0.1::5432', 'postgres:17']);
  if (run.code !== 0) throw new Error(`docker run (postgres) failed: ${run.stderr}`);
  let port = null;
  for (let i = 0; i < 15 && !port; i++) {
    const m = (await runCommand('docker', ['port', PG_NAME, '5432/tcp'])).stdout.trim().match(/:(\d+)\s*$/);
    if (m) port = m[1];
    else await sleep(500);
  }
  if (!port) throw new Error('could not discover Postgres host port');
  for (let i = 0; i < 60; i++) {
    if ((await runCommand('docker', ['exec', PG_NAME, 'pg_isready', '-U', 'postgres'])).code === 0) return port;
    await sleep(500);
  }
  throw new Error('Postgres did not become ready in time');
}

async function main() {
  console.log('=== SETUP: disposable Postgres, schema applied, realistic Super Admin bootstrap ===');
  const pgPort = await startDisposablePostgres();
  const pgUri = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-allowlist-'));
  try {
    const migrate = await runCommand(process.execPath, [RUN_MIGRATIONS], { env: { ...process.env, TEST_DATABASE_URL: pgUri } });
    if (migrate.code !== 0) throw new Error(`schema application failed: ${migrate.stderr}`);
    const pool = new pg.Pool({ connectionString: pgUri });

    // The bootstrap, as the real tools do it.
    await pool.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [ADMIN, ADMIN_EMAIL]);
    await pool.query(`UPDATE profiles SET role = 'admin' WHERE id = $1`, [ADMIN]);
    await pool.query(`INSERT INTO admin_role_assignments (user_id, role, assigned_by) VALUES ($1, 'super-admin', NULL)`, [ADMIN]);
    await pool.query(
      `INSERT INTO admin_audit_log (actor_admin_id, action, resource_type, resource_id, after, severity) VALUES ($1, 'auth.login_stage1', 'AdminAuth', $2, NULL, 'info')`,
      [ADMIN, ADMIN]
    );
    const asAal2Admin = async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, aal: 'aal2', role: 'authenticated' })]);
        await c.query('SET LOCAL ROLE authenticated');
        const out = await fn(c);
        await c.query('COMMIT');
        return out;
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        c.release();
      }
    };
    const createPlan = (p, displayOrder) => asAal2Admin((c) => c.query(
      `select (public.create_plan_version(NULL, $1, $2, $3, 'EUR', 'month', NULL, NULL, NULL, NULL, NULL, $4)).id as id`,
      [p.slug, p.name, p.amountMinor, displayOrder]
    ));
    for (const [i, p] of CANONICAL_PLANS.entries()) await createPlan(p, i);

    // Mutations run inside a transaction that is rolled back, so every test
    // starts from the same bootstrapped target (admin_audit_log itself is
    // append-only; a rollback is not a DELETE).
    const withMutation = async (mutate, check) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await mutate(c);
        return await check(c);
      } finally {
        await c.query('ROLLBACK').catch(() => {});
        c.release();
      }
    };
    const collectNow = async () => {
      const c = await pool.connect();
      try { return await collectBootstrapAllowlist(c); } finally { c.release(); }
    };
    const { allowlist, summary } = await collectNow();
    const rejects = (c, list, pattern) => assert.rejects(verifyBootstrapState(c, list), (err) => {
      assert.equal(err.code, 'BOOTSTRAP_STATE_REJECTED');
      assert.match(err.message, pattern);
      return true;
    });

    await test('collect: the realistic bootstrap yields 1 Super Admin, 3 plans, 4 audit rows -- UUIDs and fingerprints only', async () => {
      assert.equal(allowlist.superAdmin.userId, ADMIN);
      assert.deepEqual(allowlist.plans.map((p) => p.slug), CANONICAL_PLANS.map((p) => p.slug));
      assert.deepEqual(allowlist.auditRows.map((a) => a.action).sort(), ['auth.login_stage1', 'create_plan_version', 'create_plan_version', 'create_plan_version']);
      assert.equal(summary.superAdmin.preExisting, 1);
      assert.equal(summary.plans.matchCatalog, true);
      assert.doesNotMatch(JSON.stringify(allowlist), /@/, 'no email in the allowlist');
    });

    await test('matching artifact -> allowed; the unrecorded-data preflight then admits exactly those rows (and refuses them without the allowlist)', async () => {
      const c = await pool.connect();
      try {
        const state = await verifyBootstrapState(c, allowlist);
        assert.equal(state.superAdmin.approved, true);
        assert.equal(await verifyNoUnrecordedData(c, { bootstrapAllowlist: allowlist }), true);
        await assert.rejects(verifyNoUnrecordedData(c), (err) => {
          assert.match(err.message, /profiles: 1 row\(s\) not attributable/);
          assert.match(err.message, /admin_audit_log: 4 row\(s\) with no matching migration_source_ledger entry/);
          return true;
        });
        await assert.rejects(verifyBootstrapState(c, null), /BOOTSTRAP_STATE_REJECTED/);
      } finally {
        c.release();
      }
    });

    await test('different UUID in the allowlist -> refused', async () => {
      const other = structuredClone(allowlist);
      other.superAdmin.userId = crypto.randomUUID();
      const c = await pool.connect();
      try {
        await rejects(c, other, new RegExp(`auth\\.users: 1 row\\(s\\) not created by this migration and not the approved Super Admin \\(${ADMIN}\\)`));
      } finally {
        c.release();
      }
    });

    await test('different role for the approved account -> refused', async () => {
      await withMutation(
        (c) => c.query(`UPDATE admin_role_assignments SET role = 'admin' WHERE user_id = $1`, [ADMIN]),
        (c) => rejects(c, allowlist, /has role "admin", expected "super-admin"/),
      );
    });

    await test('an extra audit row (even a bootstrap action by the Super Admin) -> refused', async () => {
      await withMutation(
        (c) => c.query(`INSERT INTO admin_audit_log (actor_admin_id, action, resource_type, resource_id, severity) VALUES ($1, 'auth.login_success', 'AdminAuth', $2, 'info')`, [ADMIN, ADMIN]),
        (c) => rejects(c, allowlist, /admin_audit_log: row [0-9a-f-]+ \("auth\.login_success"\) is not in the approved allowlist/),
      );
    });

    await test('an extra user -> refused (and a super-admin role for it too)', async () => {
      const intruder = crypto.randomUUID();
      await withMutation(
        async (c) => {
          await c.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [intruder, 'intruder@example.invalid']);
          await c.query(`INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'super-admin')`, [intruder]);
        },
        (c) => rejects(c, allowlist, new RegExp(`auth\\.users: 1 row\\(s\\)[^\\n]*${intruder}[\\s\\S]*"super-admin" role for ${intruder}[\\s\\S]*2 "super-admin" row\\(s\\)`)),
      );
    });

    await test('a different plan -> refused: an extra plan, a new version, or an approved plan edited in place', async () => {
      await withMutation(
        (c) => c.query(`INSERT INTO plans (slug, name, amount_minor, currency, billing_interval) VALUES ('Gold', 'Gold', 99900, 'EUR', 'month')`),
        (c) => rejects(c, allowlist, /plans: 4 row\(s\)[\s\S]*is not a canonical plan slug[\s\S]*is not an approved plan/),
      );
      await withMutation(
        (c) => c.query(`UPDATE plans SET display_order = display_order + 10 WHERE slug = 'Standard'`),
        (c) => rejects(c, allowlist, /plans: [0-9a-f-]+ \(Standard\) no longer matches its approved fingerprint/),
      );
      const starterId = allowlist.plans.find((p) => p.slug === 'Starter').id;
      await withMutation(
        async (c) => {
          await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, aal: 'aal2', role: 'authenticated' })]);
          await c.query('SET LOCAL ROLE authenticated');
          await c.query(`select public.create_plan_version($1, 'Starter', 'Starter', 6000, 'EUR', 'month', NULL, NULL, NULL, NULL, NULL, 0)`, [starterId]);
          await c.query('RESET ROLE');
        },
        (c) => rejects(c, allowlist, /plans: 4 row\(s\)[\s\S]*Starter\) differs from the catalog in amount_minor/),
      );
    });

    await test('the migrated source admins stay "admin": allowed as admin, refused as super-admin', async () => {
      const migrated = crypto.randomUUID();
      const seedMigratedAdmin = async (c, role) => {
        await c.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [migrated, 'migrated-admin@example.invalid']);
        await c.query(`UPDATE profiles SET role = 'admin' WHERE id = $1`, [migrated]);
        await c.query(`INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, $2)`, [migrated, role]);
        await c.query(
          `INSERT INTO migration_source_ledger (source_system, source_database, source_collection, source_document_id, source_content_hash, target_table, status, target_id, migrated_at)
           VALUES ('mongodb', 'al-rahma', 'users', $1, $2, 'profiles', 'reconciled', $3, now())`,
          [crypto.randomBytes(12).toString('hex'), 'a'.repeat(64), migrated]
        );
      };
      await withMutation((c) => seedMigratedAdmin(c, 'admin'), async (c) => {
        const state = await verifyBootstrapState(c, allowlist);
        assert.equal(state.roleAssignments.migrated, 1);
      });
      await withMutation((c) => seedMigratedAdmin(c, 'super-admin'), (c) => rejects(c, allowlist, /migrated account [0-9a-f-]+ holds "super-admin"; migrated admins stay "admin"/));
    });

    await test('the collector refuses a non-local database that is not the target project', async () => {
      await assert.rejects(collectCandidate({ dbUrl: 'postgresql://u:p@db.someotherproject.supabase.co:5432/postgres', gitSha: 'a'.repeat(40) }), /neither local nor the target Supabase project/);
    });

    // --- the orchestrator refuses a bad manifest before any connection ---
    const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const backupFile = path.join(tmpDir, 'backup.archive');
    fs.writeFileSync(backupFile, 'synthetic');
    const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');
    const backupManifest = path.join(tmpDir, 'backup-manifest.json');
    fs.writeFileSync(backupManifest, JSON.stringify({ filePath: backupFile, sha256: backupHash, createdAt: new Date().toISOString() }));
    const writeManifest = (m) => {
      const p = path.join(tmpDir, `approval-${crypto.randomUUID()}.json`);
      fs.writeFileSync(p, JSON.stringify(m));
      return p;
    };
    // Port 9 on 127.0.0.1: nothing listens -- any attempt to connect fails
    // with ECONNREFUSED, so seeing the manifest error proves the check ran first.
    const runExecute = (manifestPath) => spawnSync(process.execPath, [ORCHESTRATOR, '--execute', ...(manifestPath ? [`--approval-manifest=${manifestPath}`] : []), `--backup-manifest=${backupManifest}`], {
      cwd: __dirname, encoding: 'utf8',
      env: { ...process.env, MIGRATION_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:9/postgres', SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'test-only-fake-key', MIGRATION_PRODUCTION_MODE: '' },
    });
    const expectRefusedBeforeConnecting = (run, pattern) => {
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, pattern);
      assert.doesNotMatch(run.stderr, /ECONNREFUSED/, 'it tried to connect before refusing the manifest');
    };

    await test('execute: a missing manifest is refused before any connection', () => {
      expectRefusedBeforeConnecting(runExecute(null), /--execute requires --approval-manifest/);
    });

    await test('execute: an expired manifest is refused before any connection', () => {
      const expired = signedTestManifest({ gitSha, backupHash, bootstrapAllowlist: allowlist, validHours: 1, now: new Date(Date.now() - 3 * 3_600_000) });
      expectRefusedBeforeConnecting(runExecute(writeManifest(expired)), /expired at/);
    });

    await test('execute: a plan-scope manifest is refused before any connection', () => {
      const planOnly = signedTestManifest({ gitSha, backupHash, bootstrapAllowlist: allowlist, scope: 'plan' });
      expectRefusedBeforeConnecting(runExecute(writeManifest(planOnly)), /only authorizes read-only plan runs/);
    });

    await test('execute: a manifest whose allowlist or SHA no longer matches is refused before any connection', () => {
      const m = signedTestManifest({ gitSha, backupHash, bootstrapAllowlist: allowlist });
      const edited = structuredClone(m);
      edited.bootstrapAllowlist.auditRows.pop();
      expectRefusedBeforeConnecting(runExecute(writeManifest(edited)), /bootstrapAllowlistSha256 does not match/);
      expectRefusedBeforeConnecting(runExecute(writeManifest({ ...m, gitSha: '0'.repeat(40) })), /was approved for git SHA/);
    });

    await pool.end();

    await test('collection and verification are read-only: 0 tuple writes, and they work on a read-only session', async () => {
      // Every other connection is closed (a closing backend flushes its
      // statistics); each measurement uses its own short-lived connection.
      const writes = async () => {
        const c = new pg.Client({ connectionString: pgUri });
        await c.connect();
        try {
          const r = await c.query(`select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0)::bigint as n from pg_stat_all_tables where schemaname in ('public', 'auth')`);
          return Number(r.rows[0].n);
        } finally {
          await c.end();
        }
      };
      await sleep(1500);
      const before = await writes();
      const roPool = makePoolReadOnly(new pg.Pool({ connectionString: pgUri }));
      const c = await roPool.connect();
      try {
        await collectBootstrapAllowlist(c);
        await verifyBootstrapState(c, allowlist);
        await assert.rejects(c.query('INSERT INTO plans (slug, name, amount_minor) VALUES ($1, $1, 1)', ['ro-probe']), /read-only transaction/);
      } finally {
        c.release();
        await roPool.end();
      }
      const { candidate } = await collectCandidate({ dbUrl: pgUri, gitSha: 'a'.repeat(40) });
      assert.equal(candidate.confirmToken, null, 'the candidate is unsigned');
      assert.equal(candidate.bootstrapAllowlistSha256, bootstrapAllowlistSha256(allowlist));
      await sleep(1500);
      assert.equal(await writes(), before, 'a tuple was written');
    });
  } finally {
    console.log('\n=== CLEANUP ===');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await runCommand('docker', ['rm', '-f', '-v', PG_NAME]);
    const left = await runCommand('docker', ['ps', '-a', '--filter', `name=${PG_NAME}`, '--format', '{{.Names}}']);
    console.log(left.stdout.trim() ? `cleanup FAILED: ${left.stdout.trim()} still present` : 'cleanup verified: all test containers absent.');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[test] harness crashed:', err);
  process.exitCode = 1;
});
