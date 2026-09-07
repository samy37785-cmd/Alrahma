// Automated test for scripts/lib/cutover-core.mjs — the atomic Cutover
// critical section shared by production-cutover-orchestrator.mjs.
// Exercises the REAL shared core against a dedicated, disposable,
// localhost-only Postgres database — same discipline as
// surgical-reset.test.mjs, which this file's fixture setup mirrors
// (plain Docker Postgres + local-harness.mjs auth stubs, not the full
// Supabase CLI stack — this test only needs enough auth/role
// scaffolding for the real migrations to apply, not a live GoTrue).
//
// Proves two things the corrective review specifically asked for:
//   1. The happy path really is atomic: reset + all migrations + the
//      migration journal + full post-migration verification commit
//      together, in one transaction, on one connection.
//   2. Failure injection at three different points (right after
//      Surgical Reset, mid-migration, right after verification but
//      before COMMIT) each leave the database EXACTLY where it started
//      — the old 34-table fixture, untouched — never a half-reset or
//      half-migrated state. This is checked by literally counting
//      tables and re-diffing the fixture's own table set after each
//      injected failure, not just checking that the call rejected.
//
// Requires: TEST_DATABASE_URL pointing at a local Docker Postgres (NOT
// the full Supabase CLI stack).
//
// Usage: TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
//        node test/cutover-core.test.mjs
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions, assertLocalHost } from "../../../lib/db/test/local-harness.mjs";
import { runAtomicCutoverOnClient, InjectedFailure } from "../scripts/lib/cutover-core.mjs";
import { EXPECTED_NEW_TABLES } from "../scripts/lib/new-schema-fingerprint.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const repoRoot = path.join(opsDir, "..", "..");
const fixturePath = path.join(opsDir, "fixtures", "old_public_schema.sql");
const surgicalResetSqlFile = path.join(opsDir, "sql", "surgical-reset.sql");
const drizzleDir = path.join(repoRoot, "lib", "db", "drizzle");

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

const baseConnectionString = process.env.TEST_DATABASE_URL;
if (!baseConnectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
assertLocalHost(baseConnectionString, "TEST_DATABASE_URL");

const dbName = "alrahma_cutover_core_test";
const maintenanceUrl = new URL(baseConnectionString);
maintenanceUrl.pathname = "/postgres";
const testUrl = new URL(baseConnectionString);
testUrl.pathname = `/${dbName}`;

async function loadOldFixture(client) {
  await createLocalAuthUsersStub(client);
  await client.query(`alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;`);
  await client.query(`alter table auth.users add column if not exists aud text;`);
  await client.query(`alter table auth.users add column if not exists role text;`);
  await client.query(`alter table auth.users add column if not exists created_at timestamptz not null default now();`);
  await createLocalAuthRolesAndFunctions(client);
  await client.query(fs.readFileSync(fixturePath, "utf8").replace(/\r\n/g, "\n"));
  // cutover-core.mjs's final recheck deliberately requires every old
  // table to have ZERO rows (production's real precondition: app data
  // has already been migrated out before a schema cutover runs) — the
  // fixture's own seed row(s) (e.g. one row in blogs, used by
  // surgical-reset.test.mjs's less strict checks) would otherwise fail
  // that check immediately, before this test ever reaches the atomicity
  // behavior it's actually here to prove.
  const tableList = EXPECTED_OLD_TABLES.map((t) => `public."${t}"`).join(", ");
  await client.query(`truncate table ${tableList} cascade;`);
  await client.query(`delete from auth.users;`);
}

async function assertOldFixtureIntact(client, context) {
  const { rows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
  const actual = rows.map((r) => r.tablename).sort();
  const expected = [...EXPECTED_OLD_TABLES].sort();
  assert.deepEqual(actual, expected, `${context}: the old 34-table fixture must be completely intact after a rolled-back failure — got ${JSON.stringify(actual)}`);
  const { rows: drizzleSchemaRows } = await client.query(`select 1 from pg_namespace where nspname='drizzle';`);
  assert.equal(drizzleSchemaRows.length, 0, `${context}: no drizzle schema/migration journal should exist after a rolled-back failure`);
}

async function main() {
  console.log(`--- (re)creating dedicated test database ${dbName}`);
  const admin = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force);`);
  await admin.query(`create database ${dbName};`);
  await admin.end();

  const client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  const surgicalResetSql = fs.readFileSync(surgicalResetSqlFile, "utf8");
  const coreOpts = { expectedOldTables: EXPECTED_OLD_TABLES, expectedOldEnums: EXPECTED_OLD_ENUMS, surgicalResetSql, drizzleDir, log: () => {} };

  // -------------------------------------------------------------
  // Failure injection: after Surgical Reset, before any migration.
  // -------------------------------------------------------------
  console.log("--- loading old-schema fixture");
  await loadOldFixture(client);
  console.log("--- FAILURE INJECTION: after-reset");
  await assert.rejects(
    () => runAtomicCutoverOnClient(client, { ...coreOpts, injectFailureAt: "after-reset" }),
    InjectedFailure,
    "injected failure after Surgical Reset must propagate"
  );
  await assertOldFixtureIntact(client, "after 'after-reset' injection + rollback");
  console.log("OK    'after-reset' injection: fully rolled back, old fixture intact");

  // -------------------------------------------------------------
  // Failure injection: mid-migration (right after migration index 5,
  // i.e. 0005_provider_events_fencing.sql has been applied but the
  // transaction is not yet committed).
  // -------------------------------------------------------------
  console.log("--- FAILURE INJECTION: mid-migration (index 5)");
  await assert.rejects(
    () => runAtomicCutoverOnClient(client, { ...coreOpts, injectFailureAt: 5 }),
    InjectedFailure,
    "injected failure mid-migration must propagate"
  );
  await assertOldFixtureIntact(client, "after mid-migration injection + rollback");
  console.log("OK    mid-migration injection: fully rolled back, old fixture intact (no partial migration state leaked)");

  // -------------------------------------------------------------
  // Failure injection: pg_default_acl itself is mutated mid-transaction,
  // right after fingerprint verification passes — proves the dedicated
  // default-ACL guard (not some other check) is what catches this, and
  // that catching it rolls back the reset + all migrations too.
  // -------------------------------------------------------------
  console.log("--- FAILURE INJECTION: corrupt-default-acl (mutates pg_default_acl mid-transaction)");
  await assert.rejects(
    () => runAtomicCutoverOnClient(client, { ...coreOpts, injectFailureAt: "corrupt-default-acl" }),
    /pg_default_acl changed unexpectedly during cutover/,
    "a pg_default_acl mutation mid-transaction must be refused by name, not merely fail some other way"
  );
  await assertOldFixtureIntact(client, "after 'corrupt-default-acl' injection + rollback");
  {
    const { rows } = await client.query(`
      select defaclrole::regrole::text as role from pg_default_acl
      where defaclrole::regrole::text = 'postgres' and defaclnamespace::regnamespace::text = 'public'
        and defaclobjtype = 'r' and defaclacl::text like '%anon=r/%';
    `);
    assert.equal(rows.length, 0, "the injected ALTER DEFAULT PRIVILEGES must itself have been rolled back, not just detected");
  }
  console.log("OK    'corrupt-default-acl' injection: COMMIT refused, fully rolled back (old fixture intact, the injected privilege change itself undone)");

  // -------------------------------------------------------------
  // Failure injection: after verification passes, before COMMIT.
  // -------------------------------------------------------------
  console.log("--- FAILURE INJECTION: before-commit (after verification passes)");
  await assert.rejects(
    () => runAtomicCutoverOnClient(client, { ...coreOpts, injectFailureAt: "before-commit" }),
    InjectedFailure,
    "injected failure before commit must propagate"
  );
  await assertOldFixtureIntact(client, "after before-commit injection + rollback");
  console.log("OK    before-commit injection: fully rolled back, old fixture intact");

  // -------------------------------------------------------------
  // Positive case: no injection, must actually commit and land on the
  // real new schema with every canonical migration applied. Stage 2I-A
  // audit correction: this used to hardcode 12/20 (the original
  // 0000-0011 baseline) — updated to match the current canonical
  // migration count (lib/db/drizzle now has 22 files, 0000-0021) rather
  // than re-hardcoding a new magic number, so this doesn't silently
  // drift again the next time a migration is added.
  // -------------------------------------------------------------
  console.log("--- POSITIVE CASE: no injected failure, must commit atomically");
  const expectedMigrationCount = fs.readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).length;
  const { appliedCount } = await runAtomicCutoverOnClient(client, { ...coreOpts, log: (m) => console.log(m) });
  assert.equal(appliedCount, expectedMigrationCount, `expected all ${expectedMigrationCount} migration file(s) to be applied, got ${appliedCount}`);
  const { rows: newTableRows } = await client.query(`select count(*) as c from pg_tables where schemaname='public';`);
  assert.equal(Number(newTableRows[0].c), EXPECTED_NEW_TABLES.length, `positive case: expected exactly ${EXPECTED_NEW_TABLES.length} new tables after atomic cutover`);
  const { rows: migRows } = await client.query(`select count(*) as c from drizzle.__drizzle_migrations;`);
  assert.equal(Number(migRows[0].c), expectedMigrationCount, `positive case: expected exactly ${expectedMigrationCount} rows in the migration journal`);
  console.log(`OK    positive case: atomic cutover committed — ${EXPECTED_NEW_TABLES.length} new tables, ${expectedMigrationCount} migrations journaled`);

  // -------------------------------------------------------------
  // Positive case with --policy-fixture: proves the EXACT full policy
  // set match path (item 6) actually passes against the real captured
  // fixture, not just "count > 0" — reload the old fixture and cutover
  // again, this time supplying fixtures/new-schema-rls-policies.json.
  // -------------------------------------------------------------
  console.log("--- POSITIVE CASE: with --policy-fixture, exact policy set must match");
  await client.end(); // must close before DROP DATABASE ... WITH (force) below, which would otherwise forcibly kill this still-open connection
  const admin3 = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin3.connect();
  await admin3.query(`drop database if exists ${dbName} with (force);`);
  await admin3.query(`create database ${dbName};`);
  await admin3.end();
  const client2 = new pg.Client({ connectionString: testUrl.toString() });
  await client2.connect();
  await loadOldFixture(client2);
  const policyFixture = JSON.parse(fs.readFileSync(path.join(opsDir, "fixtures", "new-schema-rls-policies.json"), "utf8"));
  await runAtomicCutoverOnClient(client2, { ...coreOpts, policyFixture });
  console.log(`OK    exact policy fixture match: all ${policyFixture.length} captured policy definition(s) matched exactly against a fresh migration run`);
  await client2.end();

  console.log("--- cleaning up dedicated test database");
  const admin2 = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin2.connect();
  await admin2.query(`drop database if exists ${dbName} with (force);`);
  await admin2.end();

  console.log("\nALL cutover-core.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
