// RLS Remediation Round 3 (Section A.5 / Section I.2 — the mandatory
// upgrade/legacy-privilege-state scenario). Every other script in this
// directory proves this baseline is correct starting from an EMPTY
// database — that alone can never prove Section A's real fix, because a
// freshly-created local role has no grant history to clean up. This
// script is the one that actually can: it applies ONLY 0000-0003 first
// (the pre-Round-3 state), deliberately injects the exact kind of
// privilege drift + stuck legacy row a real long-lived Supabase project
// could plausibly carry, THEN applies the rest — and proves the drift
// is gone and the legacy row was healed via direct ACL/data checks, not
// inference. Same localhost-only guard as every other script here, and
// it owns its OWN throwaway database (never TEST_DATABASE_URL's own db)
// so it can never collide with a concurrently-running suite.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions, assertLocalHost } from "./local-harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const realMigrationsFolder = path.join(__dirname, "..", "drizzle");

const baseConnectionString = process.env.TEST_DATABASE_URL;
if (!baseConnectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
assertLocalHost(baseConnectionString, "TEST_DATABASE_URL");

// This scenario owns a dedicated database (never the same db the other
// suites use) so it can freely DROP/CREATE it without any risk of
// racing a concurrently-run suite — same discipline as every other
// script here, just scoped to its own db instead of assuming a shared
// one is safe to reset.
const baseUrl = new URL(baseConnectionString);
const upgradeDbName = "alrahma_upgrade_scenario";
const maintenanceUrl = new URL(baseConnectionString);
maintenanceUrl.pathname = "/postgres";
const upgradeUrl = new URL(baseConnectionString);
upgradeUrl.pathname = `/${upgradeDbName}`;
const upgradeConnectionString = upgradeUrl.toString();

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "assertion failed");
}

const PRE_ROUND_3_TAGS = [
  "0000_init_20_table_baseline",
  "0001_functions_triggers",
  "0002_rls",
  "0003_provider_events_lease",
];

/** Builds a temp migrations folder containing ONLY the 0000-0003 files
 * + a journal trimmed to match — a real subset of the actual, committed
 * migrations folder (byte-identical file content, so their hashes match
 * what the full-folder migrate() run will see later), not a rewritten
 * approximation. */
function buildPreRound3MigrationsFolder() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "alrahma-upgrade-scenario-"));
  fs.mkdirSync(path.join(tmpDir, "meta"));

  const realJournal = JSON.parse(fs.readFileSync(path.join(realMigrationsFolder, "meta", "_journal.json"), "utf8"));
  const trimmedJournal = {
    ...realJournal,
    entries: realJournal.entries.filter((e) => PRE_ROUND_3_TAGS.includes(e.tag)),
  };
  assert(trimmedJournal.entries.length === 4, `expected exactly 4 pre-Round-3 journal entries, got ${trimmedJournal.entries.length}`);
  fs.writeFileSync(path.join(tmpDir, "meta", "_journal.json"), JSON.stringify(trimmedJournal, null, 2));

  for (const tag of PRE_ROUND_3_TAGS) {
    fs.copyFileSync(path.join(realMigrationsFolder, `${tag}.sql`), path.join(tmpDir, `${tag}.sql`));
  }
  return tmpDir;
}

async function main() {
  const tmpMigrationsFolder = buildPreRound3MigrationsFolder();

  // Recreate the dedicated upgrade-scenario database fresh, via the
  // maintenance (postgres) database — same as every other suite's
  // "drop database / create database" reset, just scripted here instead
  // of done by hand between runs.
  const maintPool = new pg.Pool({ connectionString: maintenanceUrl.toString() });
  await maintPool.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid();`, [upgradeDbName]).catch(() => {});
  await maintPool.query(`drop database if exists ${upgradeDbName};`);
  await maintPool.query(`create database ${upgradeDbName};`);
  await maintPool.end();

  // -------------------------------------------------------------------
  // Phase 1: apply ONLY 0000-0003 — the exact pre-Round-3 state a real,
  // long-lived project could be sitting on right now.
  // -------------------------------------------------------------------
  let pool = new pg.Pool({ connectionString: upgradeConnectionString });
  let db = drizzle(pool);

  await test("phase 1: apply 0000-0003 only (the pre-Round-3 baseline)", async () => {
    await createLocalAuthUsersStub(pool);
    await createLocalAuthRolesAndFunctions(pool);
    await migrate(db, { migrationsFolder: tmpMigrationsFolder });

    const { rows } = await pool.query(`select count(*)::int as n from public.plans;`);
    assert(rows[0].n === 0, "sanity: the pre-Round-3 schema should exist and be empty");
  });

  // -------------------------------------------------------------------
  // Phase 2: inject real drift — the exact 2 things Section A/B exist to
  // fix, done via raw SQL as the superuser (simulating history this
  // engagement didn't create: some prior process, or an earlier ad hoc
  // GRANT, or a worker that crashed mid-processing before this round's
  // fencing existed).
  // -------------------------------------------------------------------
  await test("phase 2: inject legacy privilege drift + a stuck pre-fencing provider_events row", async () => {
    // Section A's exact bug: a direct grant to a NAMED role, which
    // 0002's old REVOKE-FROM-PUBLIC-only pattern could never have
    // touched. Deliberately broad — the kind of leftover a manual
    // `GRANT ALL` during initial setup, or a since-removed feature,
    // could plausibly leave behind.
    await pool.query(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
    await pool.query(`grant execute on all functions in schema public to anon, authenticated;`);

    const acl = await pool.query(`select has_table_privilege('anon', 'public.payments', 'DELETE') as v;`);
    assert(acl.rows[0].v === true, "sanity: the injected drift should actually be present before the fix runs");

    // Section B's exact bug: a provider_events row stuck in 'processing'
    // from BEFORE claim_token/lease_expires_at existed — claimed_at is
    // also left NULL here (a worker that crashed before even setting
    // it, or a hand-inserted row) to exercise reclaim_stale_provider_
    // events()'s NULL-lease safety branch, not just the self-heal path.
    await pool.query(`
      insert into public.provider_events (provider, provider_event_id, event_type, payload_hash, processing_status)
      values ('stripe', 'evt_legacy_stuck', 'payment_intent.succeeded', 'hashlegacy1', 'processing');
    `);
  });

  // -------------------------------------------------------------------
  // Phase 3: apply the REAL, FULL migrations folder. drizzle-orm's
  // migrate() hashes each migration's file content and compares against
  // __drizzle_migrations in THIS database — 0000-0003 here are
  // byte-identical to the real folder's copies (same source files), so
  // their hashes match and they're recognized as already applied; only
  // 0004-0009 actually run. This is the real upgrade path, not a
  // simulation of one.
  // -------------------------------------------------------------------
  await test("phase 3: apply the full migrations folder — only 0004-0009 actually run", async () => {
    await migrate(db, { migrationsFolder: realMigrationsFolder });

    const applied = await pool.query(`select count(*)::int as n from drizzle.__drizzle_migrations;`);
    assert(applied.rows[0].n === 10, `expected all 10 migrations tracked as applied (0000-0003 recognized by hash + 0004-0009 newly run), got ${applied.rows[0].n}`);
  });

  // -------------------------------------------------------------------
  // Phase 4: prove the drift is actually gone — direct ACL checks, not
  // an inference from "the migration ran without error."
  // -------------------------------------------------------------------
  await test("phase 4: the injected broad grants are gone — proven via has_table_privilege/has_function_privilege, not inferred", async () => {
    const checks = await pool.query(`
      select
        has_table_privilege('anon', 'public.payments', 'DELETE') as anon_payments_delete,
        has_table_privilege('anon', 'public.payments', 'SELECT') as anon_payments_select,
        has_table_privilege('authenticated', 'public.subscriptions', 'INSERT') as authenticated_subscriptions_insert,
        has_table_privilege('authenticated', 'public.invoices', 'INSERT') as authenticated_invoices_insert,
        has_table_privilege('authenticated', 'public.plans', 'UPDATE') as authenticated_plans_update,
        has_function_privilege('anon', 'public.claim_provider_event(uuid)', 'EXECUTE') as anon_claim_execute,
        has_function_privilege('authenticated', 'public.reclaim_stale_provider_events(interval)', 'EXECUTE') as authenticated_reclaim_execute;
    `);
    const r = checks.rows[0];
    assert(r.anon_payments_delete === false, "the injected anon DELETE-on-payments grant must be gone");
    assert(r.anon_payments_select === false, "anon must not have picked up a real SELECT-on-payments grant either — it was never in the intended matrix");
    assert(r.authenticated_subscriptions_insert === false, "the injected authenticated INSERT-on-subscriptions grant must be gone (Section C closed this specifically, on top of the general injected drift)");
    assert(r.authenticated_invoices_insert === false, "authenticated INSERT-on-invoices must be gone (Section D)");
    assert(r.authenticated_plans_update === false, "authenticated UPDATE-on-plans must be gone (Section E)");
    assert(r.anon_claim_execute === false, "the injected anon EXECUTE-on-claim_provider_event grant must be gone");
    assert(r.authenticated_reclaim_execute === false, "the injected authenticated EXECUTE-on-reclaim_stale_provider_events grant must be gone");
  });

  // -------------------------------------------------------------------
  // Phase 5: prove the legacy stuck provider_events row was safely
  // healed by 0005's migration-embedded self-heal UPDATE, and is
  // claimable again.
  // -------------------------------------------------------------------
  await test("phase 5: the legacy stuck provider_events row was reset to pending and is claimable again", async () => {
    const row = await pool.query(
      `select processing_status, claimed_at, claim_token, lease_expires_at from public.provider_events where provider_event_id = 'evt_legacy_stuck';`,
    );
    assert(row.rows.length === 1, "the legacy row should still exist (never deleted, only healed)");
    assert(
      row.rows[0].processing_status === "pending" && row.rows[0].claimed_at === null && row.rows[0].claim_token === null,
      `expected the legacy row healed to pending/null, got: ${JSON.stringify(row.rows[0])}`,
    );

    const claim = await pool.query(
      `select processing_status, claim_token from public.claim_provider_event((select id from public.provider_events where provider_event_id = 'evt_legacy_stuck'));`,
    );
    assert(claim.rows.length === 1 && claim.rows[0].claim_token !== null, "the healed legacy row should be claimable again, with a real fencing token");
  });

  // -------------------------------------------------------------------
  // Phase 6: a critical-path subset — not the full suite (that's what
  // the clean-database scenario is for), just confirmation the upgraded
  // database behaves correctly end to end: one schema fact, one RLS
  // boundary, one RPC validation, one real concurrency race.
  // -------------------------------------------------------------------
  await test("phase 6 (schema): exactly 20 tables in public", async () => {
    const { rows } = await pool.query(`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';`);
    assert(rows[0].n === 20, `expected 20 tables, got ${rows[0].n}`);
  });

  await test("phase 6 (RLS): anon is denied at the GRANT layer reading payments on the upgraded database", async () => {
    await pool.query(`set role anon;`);
    try {
      await pool.query(`select * from public.payments;`);
      assert(false, "anon should have been rejected reading payments");
    } catch (err) {
      assert(err.code === "42501", `expected SQLSTATE 42501, got ${err.code}: ${err.message}`);
    } finally {
      await pool.query(`reset role;`);
    }
  });

  await test("phase 6 (RPC): admin_record_refund() still rejects a zero amount on the upgraded database", async () => {
    const uid = crypto.randomUUID();
    await pool.query(`insert into auth.users (id, email) values ($1, $2);`, [uid, `${uid}@example.test`]);
    await pool.query(`update public.profiles set role = 'admin' where id = $1;`, [uid]);
    const charge = await pool.query(
      `insert into public.payments (user_id, amount_minor, gateway, status) values ($1, 1000, 'stripe', 'succeeded') returning id;`,
      [uid],
    );

    await pool.query(`set role authenticated;`);
    await pool.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: uid, aal: "aal2" })]);
    try {
      await pool.query(`select * from public.admin_record_refund($1, 0, null);`, [charge.rows[0].id]);
      assert(false, "a zero-amount refund should have been rejected");
    } catch (err) {
      assert(err.code === "P0001" && err.message.includes("must be greater than zero"), `expected the amount>0 rejection, got ${err.code}: ${err.message}`);
    } finally {
      await pool.query(`reset role;`);
      await pool.query(`select set_config('request.jwt.claims', '', false);`);
    }
  });

  await test("phase 6 (concurrency): two workers racing claim_provider_event() on the same event — only one wins, on the upgraded database", async () => {
    const seed = await pool.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_upgrade_race', 'payment_intent.succeeded', 'hashupgraderace') returning id;`,
    );
    const eventId = seed.rows[0].id;

    const c1 = new pg.Client({ connectionString: upgradeConnectionString });
    const c2 = new pg.Client({ connectionString: upgradeConnectionString });
    await c1.connect();
    await c2.connect();
    try {
      await Promise.all([c1.query(`set role service_role;`), c2.query(`set role service_role;`)]);
      const [r1, r2] = await Promise.all([
        c1.query(`select * from public.claim_provider_event($1);`, [eventId]),
        c2.query(`select * from public.claim_provider_event($1);`, [eventId]),
      ]);
      const totalClaims = r1.rows.length + r2.rows.length;
      assert(totalClaims === 1, `expected exactly 1 of 2 concurrent claims to win, got ${totalClaims}`);
    } finally {
      await c1.end();
      await c2.end();
    }
  });

  // -------------------------------------------------------------------
  // Cleanup: drop the upgrade-scenario database and remove the temp
  // pre-Round-3 migrations folder — nothing left behind.
  // -------------------------------------------------------------------
  await pool.end();
  const cleanupPool = new pg.Pool({ connectionString: maintenanceUrl.toString() });
  await cleanupPool.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid();`, [upgradeDbName]).catch(() => {});
  await cleanupPool.query(`drop database if exists ${upgradeDbName};`);
  await cleanupPool.end();
  fs.rmSync(tmpMigrationsFolder, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[upgrade-scenario-test] harness crashed:", err);
  process.exitCode = 1;
});
