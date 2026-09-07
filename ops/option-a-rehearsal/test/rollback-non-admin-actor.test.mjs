// Proves the Stage 2D "Rollback Privilege + Strict TLS Final
// Corrective" fix against a REAL actor that mirrors real production's
// exact privilege boundary — not supabase_admin (a local superuser),
// which is what rollback-core.test.mjs and rollback-roundtrip.test.mjs
// use for setup convenience and which would have masked this entire bug
// class, since a superuser can always ALTER DEFAULT PRIVILEGES FOR ANY
// ROLE.
//
// The local Supabase CLI stack's own "postgres" role was confirmed
// (during this task, by direct query) to have IDENTICAL attributes to
// real production's "postgres" role — rolsuper=false, and NOT a member
// of / cannot SET ROLE into supabase_admin either:
//   pg_has_role('postgres','supabase_admin','MEMBER') = false (both)
//   pg_has_role('postgres','supabase_admin','USAGE')  = false (both)
// So running the rollback critical section as this exact local role is
// not a simulation of production's privilege boundary — it IS that
// boundary, reproduced faithfully.
//
// Prerequisite: `npx supabase start` already running in this directory
// (same as rollback-core.test.mjs / rollback-roundtrip.test.mjs).
//
// Usage: cd ops/option-a-rehearsal && node test/rollback-non-admin-actor.test.mjs
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runAtomicCutoverOnClient } from "../scripts/lib/cutover-core.mjs";
import { runRollbackOnClient, verifyBundleChecksumsAndFreshness, snapshotDefaultAcl } from "../scripts/lib/rollback-core.mjs";
import { restorePublicSchemaDump } from "../scripts/lib/pg-restore-runner.mjs";
import { EXPECTED_NEW_TABLES } from "../scripts/lib/new-schema-fingerprint.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const repoRoot = path.join(opsDir, "..", "..");
const scratchBundleDir = path.join(opsDir, "out", "rollback-non-admin-actor-test-bundle");

// Setup (fixture load, backup, cutover) uses supabase_admin — matches
// the existing rollback-core.test.mjs convention and isn't what's under
// test here. Only the ROLLBACK itself runs as the restricted actor.
const SETUP_DB_URL = "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";
const NON_ADMIN_ACTOR_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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

async function loadEmptyOldFixture(client) {
  await resetToCleanSlate(client);
  await client.query(fs.readFileSync(path.join(opsDir, "fixtures", "old_public_schema.sql"), "utf8").replace(/\r\n/g, "\n"));
  const tableList = EXPECTED_OLD_TABLES.map((t) => `public."${t}"`).join(", ");
  await client.query(`truncate table ${tableList} cascade;`);
  await client.query(`delete from auth.users;`);
}

// fixtures/old_public_schema.sql does `create or replace function
// public.rls_auto_enable()` against a function that may already exist
// (owned by supabase_admin, left over from the local Supabase
// platform's own bootstrap or from other test files sharing this same
// local stack) — CREATE OR REPLACE requires owning the existing
// function, so loading this fixture as the non-admin actor directly
// fails with "must be owner of function rls_auto_enable". Loading it as
// supabase_admin (as every other test file in this suite already does)
// avoids that, then this reassigns every resulting public-schema object
// to "postgres" — matching the REAL production bundle's confirmed live
// ownership shape exactly (34 tables + 3 enums + 2 functions, ALL owned
// by "postgres", per this task's live TOC inspection) — before
// backup-bundle.mjs dumps it. Without this, the bundle would contain
// `ALTER ... OWNER TO supabase_admin` statements a non-admin actor could
// trivially replay (self-ownership), masking the exact `ALTER ... OWNER
// TO postgres` privilege boundary a real restore actually depends on.
async function reassignPublicSchemaToPostgres(client) {
  await client.query(`
    do $$
    declare r record;
    begin
      for r in select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','S','v') loop
        execute format('alter table public.%I owner to postgres', r.relname);
      end loop;
      for r in select p.proname as name, pg_get_function_identity_arguments(p.oid) as args
               from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop
        execute format('alter function public.%I(%s) owner to postgres', r.name, r.args);
      end loop;
      for r in select typname from pg_type where typnamespace='public'::regnamespace and typtype='e' loop
        execute format('alter type public.%I owner to postgres', r.typname);
      end loop;
    end $$;
  `);
}

async function loadOldFixtureAndBackup(client) {
  await loadEmptyOldFixture(client);
  await reassignPublicSchemaToPostgres(client);
  fs.rmSync(scratchBundleDir, { recursive: true, force: true });
  run("scripts/backup-bundle.mjs", {
    BACKUP_DATABASE_URL: NON_ADMIN_ACTOR_URL,
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

async function currentPublicTableSet(client) {
  const { rows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
  return rows.map((r) => r.tablename).sort();
}

async function main() {
  const setupClient = new pg.Client({ connectionString: SETUP_DB_URL });
  await setupClient.connect();
  const actorClient = new pg.Client({ connectionString: NON_ADMIN_ACTOR_URL });
  await actorClient.connect();

  try {
    await runTest(setupClient, actorClient);
  } finally {
    // reassignPublicSchemaToPostgres reassigns public.rls_auto_enable()
    // (a function this local Postgres instance treats as a persistent,
    // shared platform object, unlike the old-schema tables every other
    // test file drops/recreates fresh) to "postgres", matching real
    // production. Left that way, a LATER test file that runs its own
    // fixture load as supabase_admin hits a real Supabase local-stack
    // guard ("supautils_hook": a superuser must not own/reference a
    // function owned by a non-superuser) when it re-creates the event
    // trigger that calls it — confirmed by direct reproduction: skipping
    // this reset broke rollback-core.test.mjs the first time this test
    // was added. Restoring supabase_admin ownership here, always (even
    // on failure), keeps this test's real-production-accurate ownership
    // proof from leaking into the shared local stack the other test
    // files depend on.
    try {
      await setupClient.query(`
        alter function public.rls_auto_enable() owner to supabase_admin;
        alter function public.handle_new_user() owner to supabase_admin;
      `);
    } catch {
      // best-effort: if the function doesn't exist at this point (e.g.
      // an earlier failure left the schema mid-reset), there is nothing
      // to restore ownership on.
    }
    await actorClient.end();
    await setupClient.end();
  }
}

async function runTest(setupClient, actorClient) {
  console.log("--- confirming the local 'postgres' role really does mirror production's privilege boundary before relying on it");
  const { rows: idRows } = await actorClient.query(`select current_user, session_user;`);
  assert.equal(idRows[0].current_user, "postgres");
  const { rows: memberRows } = await actorClient.query(`
    select pg_has_role(current_user, 'supabase_admin', 'MEMBER') as is_member, pg_has_role(current_user, 'supabase_admin', 'USAGE') as usage;
  `);
  assert.equal(memberRows[0].is_member, false, "this actor must NOT be a member of supabase_admin — that's the whole point of this test");
  assert.equal(memberRows[0].usage, false);
  await assert.rejects(
    () => actorClient.query("SET ROLE supabase_admin;"),
    /permission denied to set role/i,
    "this actor must not be able to SET ROLE into supabase_admin either"
  );
  console.log("OK    local 'postgres' actor confirmed non-member of supabase_admin, cannot SET ROLE into it — matches the live production audit exactly");

  console.log("--- proving the OLD failure mode directly: this exact statement class used to be replayed by pg_restore and WOULD fail under this actor");
  await assert.rejects(
    () => actorClient.query(`alter default privileges for role supabase_admin in schema public grant select on tables to anon;`),
    /permission denied to change default privileges/i,
    "a non-member actor issuing this statement (what the unfiltered TOC used to contain) must be refused"
  );
  console.log('OK    confirmed: "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin" fails under this actor with "permission denied to change default privileges" — exactly the failure the TOC filter now prevents pg_restore from ever hitting');

  console.log("--- setup: old fixture (as supabase_admin) -> reassign everything to postgres -> real local backup bundle (dumped as postgres, matching real production's ownership shape exactly)");
  await loadOldFixtureAndBackup(setupClient);
  // Stage 2I-A audit finding: loadOldFixtureAndBackup's reassignment
  // above leaves rls_auto_enable() owned by "postgres" (for the backup
  // bundle's realism, per its own comment) — but that ownership change
  // persists into the cutover below too, since Surgical Reset never
  // touches this function. Under that specific ownership, this local
  // stack's rls_auto_enable_trigger silently fails to enable RLS on
  // document_counters specifically (its EXCEPTION handler logs and
  // swallows the error rather than raising — confirmed by direct
  // reproduction, not by inspection: cutoverToNewSchema's own strict
  // fingerprint check below caught it). rollback-core.test.mjs's cutover
  // never hits this because it never reassigns ownership away from
  // supabase_admin first. Restoring supabase_admin ownership here — the
  // exact same statement the `finally` block below already runs — before
  // cutover keeps this test's later rollback-under-restricted-actor
  // proof (which only depends on the OLD-schema backup bundle's already-
  // captured postgres ownership, not on anything about the NEW schema)
  // while letting the migrate() step run under the same ownership
  // rollback-core.test.mjs already proves works correctly.
  await setupClient.query(`
    alter function public.rls_auto_enable() owner to supabase_admin;
    alter function public.handle_new_user() owner to supabase_admin;
  `);
  console.log("--- setup: cutover to the real new schema (as supabase_admin, matching rollback-core.test.mjs's existing convention — not what's under test here)");
  await cutoverToNewSchema(setupClient);
  assert.deepEqual(await currentPublicTableSet(setupClient), [...EXPECTED_NEW_TABLES].sort(), "setup: expected exactly the new schema after cutover");
  // Borrow-and-return: cutover needed supabase_admin ownership (above) for
  // rls_auto_enable_trigger to fire correctly; the ROLLBACK below needs the
  // OPPOSITE — the live function back under "postgres" ownership, matching
  // what the backup bundle actually recorded (loadOldFixtureAndBackup,
  // earlier), because pg_restore's `GRANT ... ON FUNCTION rls_auto_enable`
  // statements only succeed for the function's actual owner (or a
  // superuser) — the non-admin actor under test is neither. Confirmed by
  // direct reproduction: skipping this re-reassignment fails rollback with
  // "permission denied for function rls_auto_enable" on the exact GRANT
  // statements the bundle's TOC replays.
  await setupClient.query(`alter function public.rls_auto_enable() owner to postgres;`);

  // Pure test-fixture correction, not a code change and not a production
  // finding: cutover-core.mjs's migration step does a plain
  // `create schema if not exists drizzle` on whatever client runs
  // cutover, so running setup as supabase_admin (above) leaves the local
  // drizzle schema owned by supabase_admin. In real production the
  // cutover orchestrator and the rollback orchestrator connect as the
  // SAME role (postgres/postgres.<ref>), so drizzle is already
  // postgres-owned there — this ALTER just corrects the local rig back
  // to that same reality before the non-admin actor's rollback (which
  // must `drop schema drizzle`) runs.
  await setupClient.query(`alter schema drizzle owner to postgres;`);

  const { inventory } = verifyBundleChecksumsAndFreshness(scratchBundleDir, {
    expectedProjectRef: "local-rehearsal-not-real",
    expectedSourceMode: "local",
    maxAgeHours: 1,
  });
  const defaultAclBeforeSetup = await snapshotDefaultAcl(setupClient);
  console.log(`OK    setup complete: real bundle verified, target is the new schema, ${defaultAclBeforeSetup.length} pg_default_acl row(s) recorded as the pre-rollback baseline`);

  // -------------------------------------------------------------
  // THE ACTUAL TEST: run the full rollback critical section AS THE
  // NON-ADMIN ACTOR. Before the TOC fix this would have aborted the
  // whole --single-transaction pg_restore on the first supabase_admin
  // DEFAULT ACL entry with "permission denied to change default privileges".
  // -------------------------------------------------------------
  console.log("--- ROLLBACK as the non-admin actor (postgres, not a member of supabase_admin) — this is the actual proof");
  await runRollbackOnClient(actorClient, {
    inverseResetSql: fs.readFileSync(path.join(opsDir, "sql", "inverse-reset-new-schema.sql"), "utf8"),
    restoreFn: () => restorePublicSchemaDump(NON_ADMIN_ACTOR_URL, scratchBundleDir, { forLocalTestTarget: true }),
    runTriggerStatements: async (txClient) => {
      const statementsPath = path.join(scratchBundleDir, "functions_and_triggers.statements.json");
      const statements = fs.existsSync(statementsPath) ? JSON.parse(fs.readFileSync(statementsPath, "utf8")) : [];
      for (const stmt of statements) await txClient.query(stmt);
    },
    inventory,
    log: (m) => console.log(m),
  });
  assert.deepEqual(await currentPublicTableSet(actorClient), [...EXPECTED_OLD_TABLES].sort(), "the non-admin actor's rollback must land back on the exact old 34-table schema");
  console.log("OK    rollback succeeded end to end as the non-admin actor — the TOC filter fix closes the real production failure mode");

  console.log("--- independent re-check: pg_default_acl is byte-for-byte identical to the pre-rollback baseline, from a separate connection");
  const defaultAclAfter = await snapshotDefaultAcl(setupClient);
  assert.deepEqual(defaultAclAfter, defaultAclBeforeSetup, "pg_default_acl must be completely unchanged by a rollback run as a non-admin actor");
  console.log("OK    pg_default_acl confirmed unchanged, independently of runRollbackOnClient's own internal check");

  fs.rmSync(scratchBundleDir, { recursive: true, force: true });

  console.log("\nALL rollback-non-admin-actor.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
