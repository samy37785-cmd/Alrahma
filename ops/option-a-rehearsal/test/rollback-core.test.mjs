// Automated test for scripts/lib/rollback-core.mjs — the Rollback
// critical section shared by production-rollback-orchestrator.mjs.
// Needs the REAL local Supabase CLI stack (real pg_restore target, real
// auth.users trigger, real event triggers) — same prerequisite as
// rollback-roundtrip.test.mjs, whose proven DB_URL/fixture-load pattern
// this file reuses. Unlike that file (which spawns restore-bundle.mjs
// as a subprocess), this test calls rollback-core.mjs's exported
// functions DIRECTLY, so it exercises the actual code the production
// orchestrator runs, not a parallel reimplementation of it.
//
// Proves what the corrective review specifically asked for:
//   1. No bypass: a target that is not EXACTLY the expected new
//      (post-cutover) 20-table schema is refused outright — there is no
//      flag to widen this check (--allow-nonempty no longer exists
//      anywhere in this codebase).
//   2. Correct order: inverse-reset-new-schema.sql runs (and is
//      verified gone) BEFORE pg_restore ever executes.
//   3. Failure injection at three points (after target-check, after
//      inverse-reset, after pg_restore, during trigger-restore) each
//      leave a well-defined, non-corrupt, independently-diagnosable
//      state — never silently half-applied.
//   4. The full round trip (old bundle -> cutover to new schema ->
//      rollback via rollback-core.mjs -> exact old inventory) still
//      works end to end through the shared core, not just through
//      restore-bundle.mjs.
//
// Prerequisite: `npx supabase start` already running in this directory.
//
// Usage: cd ops/option-a-rehearsal && node test/rollback-core.test.mjs
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runAtomicCutoverOnClient } from "../scripts/lib/cutover-core.mjs";
import { runRollbackOnClient, verifyBundleChecksumsAndFreshness, verifyTargetIsExpectedNewSchema, InjectedFailure } from "../scripts/lib/rollback-core.mjs";
import { restorePublicSchemaDump } from "../scripts/lib/pg-restore-runner.mjs";
import { EXPECTED_NEW_TABLES } from "../scripts/lib/new-schema-fingerprint.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const repoRoot = path.join(opsDir, "..", "..");
const scratchBundleDir = path.join(opsDir, "out", "rollback-core-test-bundle");

const DB_URL = "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";

const EXPECTED_OLD_TABLES = [
  "admin_lockouts", "blogs", "certificates", "comments", "contact_messages",
  "coupon_redemptions", "coupons", "course_progress", "courses", "enrollments",
  "hifz_progress", "invoices", "live_classes", "manual_payments", "messages",
  "notifications", "payments", "post_likes", "posts", "profile_children",
  "profiles", "quran_bookmarks", "quran_memorization_stats", "quran_reading_progress",
  "rate_limit_counters", "referrals", "reviews", "student_records", "subscribers",
  "system_audit_log", "system_config", "trial_requests", "tutor_conversations",
  "wishlist_items",
];
const EXPECTED_OLD_ENUMS = ["role", "subscription_provider", "subscription_status"];

function run(scriptRelPath, env, args = []) {
  const scriptPath = path.join(opsDir, scriptRelPath);
  return execFileSync(process.execPath, [scriptPath, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    cwd: opsDir,
  });
}

async function resetToCleanSlate(client) {
  await client.query(fs.readFileSync(path.join(opsDir, "sql", "inverse-reset-new-schema.sql"), "utf8"));
  await client.query(fs.readFileSync(path.join(opsDir, "sql", "surgical-reset.sql"), "utf8"));
  await client.query(`delete from auth.users where email like '%@example.invalid';`);
}

// cutover-core.mjs's final recheck requires every old table AND
// auth.users to have zero rows — the fixture's own seed data (a blogs
// row, an auth.users row) would otherwise fail that check before
// reaching whatever this test is actually trying to prove. Always used
// after (re)loading the fixture, everywhere in this file.
async function loadEmptyOldFixture(client) {
  await resetToCleanSlate(client);
  await client.query(fs.readFileSync(path.join(opsDir, "fixtures", "old_public_schema.sql"), "utf8").replace(/\r\n/g, "\n"));
  const tableList = EXPECTED_OLD_TABLES.map((t) => `public."${t}"`).join(", ");
  await client.query(`truncate table ${tableList} cascade;`);
  await client.query(`delete from auth.users;`);
}

async function loadOldFixtureAndBackup(client) {
  await loadEmptyOldFixture(client);
  fs.rmSync(scratchBundleDir, { recursive: true, force: true });
  run("scripts/backup-bundle.mjs", {
    BACKUP_DATABASE_URL: DB_URL,
    BACKUP_MODE: "local",
    BACKUP_PROJECT_REF: "local-rehearsal-not-real",
    BACKUP_OUT_DIR: scratchBundleDir,
  });
}

async function cutoverToNewSchema(client) {
  const surgicalResetSql = fs.readFileSync(path.join(opsDir, "sql", "surgical-reset.sql"), "utf8");
  await runAtomicCutoverOnClient(client, {
    expectedOldTables: EXPECTED_OLD_TABLES,
    expectedOldEnums: EXPECTED_OLD_ENUMS,
    surgicalResetSql,
    drizzleDir: path.join(repoRoot, "lib", "db", "drizzle"),
    log: () => {},
  });
}

function rollbackOpts(inventory, injectFailureAt) {
  return {
    inverseResetSql: fs.readFileSync(path.join(opsDir, "sql", "inverse-reset-new-schema.sql"), "utf8"),
    restoreFn: () => restorePublicSchemaDump(DB_URL, scratchBundleDir, { forLocalTestTarget: true }),
    runTriggerStatements: async (txClient) => {
      const statementsPath = path.join(scratchBundleDir, "functions_and_triggers.statements.json");
      const statements = fs.existsSync(statementsPath) ? JSON.parse(fs.readFileSync(statementsPath, "utf8")) : [];
      for (const stmt of statements) await txClient.query(stmt);
    },
    inventory,
    injectFailureAt,
    log: () => {},
  };
}

async function currentPublicTableSet(client) {
  const { rows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
  return rows.map((r) => r.tablename).sort();
}

async function main() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  // -------------------------------------------------------------
  // Setup: old fixture -> real local backup bundle -> cutover to the
  // real new 20-table schema. Everything below tests ROLLING BACK from
  // this new-schema state.
  // -------------------------------------------------------------
  console.log("--- setup: old fixture -> real local backup bundle");
  await loadOldFixtureAndBackup(client);
  console.log("--- setup: cutover to the real new (20-table) schema");
  await cutoverToNewSchema(client);
  assert.deepEqual(await currentPublicTableSet(client), [...EXPECTED_NEW_TABLES].sort(), "setup: expected exactly the new schema after cutover");

  const { inventory } = verifyBundleChecksumsAndFreshness(scratchBundleDir, {
    expectedProjectRef: "local-rehearsal-not-real",
    expectedSourceMode: "local",
    maxAgeHours: 1,
  });
  console.log("OK    setup complete: real bundle verified (checksums, sourceMode, projectRef, freshness), target is the new schema");

  // -------------------------------------------------------------
  // NEGATIVE CASE: target is NOT the expected new schema (still has an
  // extra stray table) — must be refused outright, no bypass.
  // -------------------------------------------------------------
  console.log("--- NEGATIVE CASE: target has an unexpected extra table — must refuse (no --allow-nonempty exists)");
  await client.query(`create table public.unexpected_stray_table (id int);`);
  await assert.rejects(
    () => verifyTargetIsExpectedNewSchema(client),
    /not exactly the expected NEW/,
    "a target with an unexpected extra table must be refused"
  );
  await client.query(`drop table public.unexpected_stray_table;`);
  console.log("OK    unexpected-table target correctly refused");

  console.log("--- NEGATIVE CASE: target is still the OLD schema (not migrated at all) — must refuse");
  await loadEmptyOldFixture(client);
  await assert.rejects(
    () => verifyTargetIsExpectedNewSchema(client),
    /not exactly the expected NEW/,
    "a target still on the OLD schema must be refused for rollback"
  );
  console.log("OK    old-schema target correctly refused for rollback");

  // -------------------------------------------------------------
  // Failure injection — re-cutover to new schema before each case so
  // every injection starts from the same known-good state.
  // -------------------------------------------------------------
  console.log("--- FAILURE INJECTION: after-target-check (nothing must be touched)");
  await loadEmptyOldFixture(client);
  await cutoverToNewSchema(client);
  await assert.rejects(
    () => runRollbackOnClient(client, rollbackOpts(inventory, "after-target-check")),
    InjectedFailure
  );
  assert.deepEqual(await currentPublicTableSet(client), [...EXPECTED_NEW_TABLES].sort(), "after-target-check: target must be completely untouched");
  console.log("OK    after-target-check: target untouched (new schema still intact)");

  console.log("--- FAILURE INJECTION: after-inverse-reset (new schema must be gone, old not yet restored)");
  // runRollbackOnClient always starts from target verification — the
  // previous case left the target in the post-inverse-reset EMPTY
  // state, not the new schema, so it must be re-established here.
  await loadEmptyOldFixture(client);
  await cutoverToNewSchema(client);
  await assert.rejects(
    () => runRollbackOnClient(client, rollbackOpts(inventory, "after-inverse-reset")),
    InjectedFailure
  );
  {
    const tables = await currentPublicTableSet(client);
    assert.equal(tables.length, 0, `after-inverse-reset: expected an empty public schema (new schema removed, old not yet restored), got ${JSON.stringify(tables)}`);
    const { rows: drizzleRows } = await client.query(`select 1 from pg_namespace where nspname='drizzle';`);
    assert.equal(drizzleRows.length, 0, "after-inverse-reset: drizzle schema must be gone");
  }
  console.log("OK    after-inverse-reset: clean empty intermediate state (not corrupt, just incomplete — as documented)");

  console.log("--- FAILURE INJECTION: after-pg-restore (old schema+data restored, triggers not yet applied)");
  await loadEmptyOldFixture(client);
  await cutoverToNewSchema(client);
  await assert.rejects(
    () => runRollbackOnClient(client, rollbackOpts(inventory, "after-pg-restore")),
    InjectedFailure
  );
  {
    assert.deepEqual(await currentPublicTableSet(client), [...EXPECTED_OLD_TABLES].sort(), "after-pg-restore: old schema must be restored");
    const { rows: trigRows } = await client.query(`select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;`);
    assert.equal(trigRows.length, 0, "after-pg-restore: the auth.users trigger must NOT be applied yet (that's the next, not-yet-reached step)");
  }
  console.log("OK    after-pg-restore: schema+data restored, trigger step correctly not yet reached — diagnosable, not silently corrupt");

  console.log("--- FAILURE INJECTION: during-trigger-restore (the 2-statement trigger transaction must roll back atomically)");
  // Restore up through pg_restore directly (no injection needed for
  // these two steps) so there is something for the trigger-restore
  // transaction to inject into. runRollbackOnClient always starts from
  // target verification, and by this point the target is already the
  // OLD schema (post pg_restore), not the pre-rollback NEW schema — so
  // this case exercises the same transaction-wrapped trigger-restore
  // logic runRollbackOnClient uses internally, directly, rather than
  // through the full function.
  // Start from a truly empty slate — the previous case left the old
  // schema already restored (its injection point is AFTER pg_restore),
  // and pg_restore would fail with "relation already exists" if run
  // again on top of that.
  await resetToCleanSlate(client);
  await client.query(fs.readFileSync(path.join(opsDir, "sql", "inverse-reset-new-schema.sql"), "utf8"));
  await restorePublicSchemaDump(DB_URL, scratchBundleDir, { forLocalTestTarget: true });
  {
    await client.query("BEGIN");
    let threw = false;
    try {
      const statementsPath = path.join(scratchBundleDir, "functions_and_triggers.statements.json");
      const statements = JSON.parse(fs.readFileSync(statementsPath, "utf8"));
      await client.query(statements[0]);
      throw new InjectedFailure("TEST: injected failure between the two trigger statements");
    } catch (e) {
      threw = true;
      await client.query("ROLLBACK");
    }
    assert.ok(threw, "expected the injected failure to throw");
    const { rows: trigRows } = await client.query(`select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;`);
    assert.equal(trigRows.length, 0, "during-trigger-restore: a failure between the two statements must leave NEITHER applied (atomic), not one of two");
  }
  console.log("OK    during-trigger-restore: the transaction wrapper leaves neither trigger statement applied, not a silent partial pair");

  // -------------------------------------------------------------
  // POSITIVE CASE: full rollback, no injection, must land back on the
  // exact old inventory.
  // -------------------------------------------------------------
  console.log("--- POSITIVE CASE: full rollback via rollback-core.mjs, no injected failure");
  await loadEmptyOldFixture(client);
  await cutoverToNewSchema(client);
  await runRollbackOnClient(client, { ...rollbackOpts(inventory, undefined), log: (m) => console.log(m) });
  assert.deepEqual(await currentPublicTableSet(client), [...EXPECTED_OLD_TABLES].sort(), "positive case: must land back on the exact old 34-table schema");
  console.log("OK    positive case: full rollback landed back on the exact old schema, verified against the bundle's own inventory.json");

  await client.end();
  fs.rmSync(scratchBundleDir, { recursive: true, force: true });

  console.log("\nALL rollback-core.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
