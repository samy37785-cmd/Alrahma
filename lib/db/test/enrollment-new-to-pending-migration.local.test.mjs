// Direct test for lib/db/drizzle/0031_enrollment_new_status_to_pending.sql
// — the follow-up to 0030_enrollment_status_reconciliation.sql. 0030 only
// widened the CHECK constraint to PERMIT 'pending'/'approved'; it never
// changed what a new Supabase booking actually gets written as, so every
// fresh booking still arrived as 'new' — a value AdminBookingsTab.jsx's
// "Approve & Activate" visibility gate (status === 'pending' || status ===
// 'approved') never matches, meaning the admin booking-to-activation flow
// was never actually reachable end-to-end under DATA_BACKEND=supabase.
// 0031 is the fix: submit_enrollment_booking() now writes 'pending', and
// every pre-existing 'new' row is reconciled to 'pending' too.
//
// This suite proves, against a real local Postgres (not re-derived from
// reading the SQL):
//   1. a public booking created THROUGH submit_enrollment_booking() (the
//      real guest-facing RPC, called as `anon`, not a raw superuser
//      INSERT) now lands as 'pending';
//   2. that row is readable back as 'pending' (what both admin
//      controllers' `toJson()`/list queries do is a plain passthrough of
//      the `status` column — see backend/data/supabase/admin/
//      enrollmentsAdminController.js — so this DB-level read is the real
//      contract the admin API surfaces);
//   3. Approve & Activate (admin_activate_subscription_from_enrollment(),
//      0028_admin_booking_activation.sql) is available and SUCCEEDS for a
//      'pending' booking — proving the frontend's visibility gate and the
//      RPC's own claim condition now actually agree on a real submission,
//      not just in isolation;
//   4. a row that was 'new' BEFORE this migration ran (simulating a real
//      pre-existing Supabase booking) becomes 'pending' after it runs —
//      this needs its own throwaway database migrated in two phases
//      (0000-0030, seed, then the full folder so only 0031 actually
//      executes), the same technique upgrade-scenario.local.test.mjs uses,
//      because a fresh full-migration run has no "old" rows to reconcile;
//   5. other historical legacy values ('contacted', 'scheduled',
//      'awaiting_payment', 'paid') are left untouched by 0031 — only
//      'new' rows are mapped, per that migration's own documented,
//      unambiguous mapping;
//   6. a genuinely invalid status is still rejected.
//
// Production-readiness audit follow-up (2026-09-17): wired into
// orchestrate-db-tests.mjs's pipeline / DB_ASSERTION_CONTRACT (see
// orchestrator-lib.mjs), same as rpc-admin-booking-activation.local.test.mjs
// and enrollment-status-reconciliation.local.test.mjs. Can still be run
// standalone:
//   TEST_DATABASE_URL=postgres://... node lib/db/test/enrollment-new-to-pending-migration.local.test.mjs
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions, assertLocalHost } from "./local-harness.mjs";
import { createRlsHarness, requireLocalTestDatabaseUrl } from "./rls-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const realMigrationsFolder = path.join(__dirname, "..", "drizzle");

const baseConnectionString = requireLocalTestDatabaseUrl();
assertLocalHost(baseConnectionString, "TEST_DATABASE_URL");

const baseUrl = new URL(baseConnectionString);
const dbName = "alrahma_enrollment_new_to_pending_migration";
const maintenanceUrl = new URL(baseConnectionString);
maintenanceUrl.pathname = "/postgres";
const scenarioUrl = new URL(baseConnectionString);
scenarioUrl.pathname = `/${dbName}`;
const scenarioConnectionString = scenarioUrl.toString();

/** Builds a temp migrations folder containing only the 0000-0030 files +
 * a journal trimmed to match (byte-identical file content AND identical
 * meta/_journal.json `when` timestamps for those 31 entries, so the later
 * full-folder migrate() run recognizes them as already applied and runs
 * ONLY 0031) — same technique as upgrade-scenario.local.test.mjs's
 * buildPreRound3MigrationsFolder(). */
function buildPre0031MigrationsFolder() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "alrahma-enrollment-pending-migration-"));
  fs.mkdirSync(path.join(tmpDir, "meta"));

  const realJournal = JSON.parse(fs.readFileSync(path.join(realMigrationsFolder, "meta", "_journal.json"), "utf8"));
  const trimmedEntries = realJournal.entries.filter((e) => e.idx <= 30);
  if (trimmedEntries.length !== 31) {
    throw new Error(`expected exactly 31 pre-0031 journal entries (idx 0-30), got ${trimmedEntries.length}`);
  }
  const trimmedJournal = { ...realJournal, entries: trimmedEntries };
  fs.writeFileSync(path.join(tmpDir, "meta", "_journal.json"), JSON.stringify(trimmedJournal, null, 2));

  for (const entry of trimmedEntries) {
    fs.copyFileSync(path.join(realMigrationsFolder, `${entry.tag}.sql`), path.join(tmpDir, `${entry.tag}.sql`));
  }
  return tmpDir;
}

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

async function main() {
  const tmpMigrationsFolder = buildPre0031MigrationsFolder();

  const maintPool = new pg.Pool({ connectionString: maintenanceUrl.toString() });
  await maintPool.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid();`, [dbName]).catch(() => {});
  await maintPool.query(`drop database if exists ${dbName};`);
  await maintPool.query(`create database ${dbName};`);
  await maintPool.end();

  const pool = new pg.Pool({ connectionString: scenarioConnectionString });
  const db = drizzle(pool);

  let legacyNewId, legacyContactedId, legacyAwaitingPaymentId;

  await test("phase 1: apply 0000-0030 only, then seed rows simulating pre-existing Supabase data (including a 'new' booking)", async () => {
    await createLocalAuthUsersStub(pool);
    await createLocalAuthRolesAndFunctions(pool);
    await migrate(db, { migrationsFolder: tmpMigrationsFolder });

    const mkEmail = () => `legacy-${crypto.randomUUID()}@example.test`;

    const rNew = await pool.query(
      `insert into public.enrollments (name, email, times, subjects, status, booking_ref) values ('Legacy New', $1, '[]'::jsonb, '[]'::jsonb, 'new', 'AR-LEGACY-0001') returning id, status;`,
      [mkEmail()],
    );
    legacyNewId = rNew.rows[0].id;
    assert(rNew.rows[0].status === "new", "sanity: pre-0031 schema must still accept 'new'");

    const rContacted = await pool.query(
      `insert into public.enrollments (name, email, times, subjects, status) values ('Legacy Contacted', $1, '[]'::jsonb, '[]'::jsonb, 'contacted') returning id, status;`,
      [mkEmail()],
    );
    legacyContactedId = rContacted.rows[0].id;

    const rAwaiting = await pool.query(
      `insert into public.enrollments (name, email, times, subjects, status) values ('Legacy Awaiting Payment', $1, '[]'::jsonb, '[]'::jsonb, 'awaiting_payment') returning id, status;`,
      [mkEmail()],
    );
    legacyAwaitingPaymentId = rAwaiting.rows[0].id;
  });

  await test("phase 2: apply the full migrations folder — only 0031 actually runs", async () => {
    await migrate(db, { migrationsFolder: realMigrationsFolder });
  });

  await test("old 'new' rows become 'pending' after 0031 runs", async () => {
    const { rows } = await pool.query(`select status from public.enrollments where id = $1;`, [legacyNewId]);
    assert(rows[0].status === "pending", `expected 'pending', got '${rows[0].status}'`);
  });

  await test("other historical legacy values are left untouched by 0031 (only 'new' rows are mapped)", async () => {
    const contacted = await pool.query(`select status from public.enrollments where id = $1;`, [legacyContactedId]);
    assert(contacted.rows[0].status === "contacted", `expected 'contacted' to survive unchanged, got '${contacted.rows[0].status}'`);

    const awaiting = await pool.query(`select status from public.enrollments where id = $1;`, [legacyAwaitingPaymentId]);
    assert(awaiting.rows[0].status === "awaiting_payment", `expected 'awaiting_payment' to survive unchanged, got '${awaiting.rows[0].status}'`);
  });

  await test("the column DEFAULT is now 'pending', not 'new'", async () => {
    const { rows } = await pool.query(
      `select column_default from information_schema.columns where table_schema = 'public' and table_name = 'enrollments' and column_name = 'status';`,
    );
    assert(rows[0].column_default?.includes("'pending'"), `expected column default to mention 'pending', got: ${rows[0].column_default}`);
  });

  await test("a genuinely invalid status value is still rejected", async () => {
    let rejected = false;
    try {
      await pool.query(
        `insert into public.enrollments (name, email, times, subjects, status) values ('Bogus', $1, '[]'::jsonb, '[]'::jsonb, 'bogus-status');`,
        [`bogus-${crypto.randomUUID()}@example.test`],
      );
    } catch (err) {
      rejected = true;
      assert(err.code === "23514", `expected a check_violation (23514), got ${err.code}: ${err.message}`);
    }
    assert(rejected, "'bogus-status' should still be rejected by the CHECK constraint");
  });

  // -------------------------------------------------------------------
  // Phase 3: against this now-fully-migrated database, prove the REAL
  // guest booking path (submit_enrollment_booking(), called as `anon`,
  // not a superuser insert) produces 'pending', and that Approve &
  // Activate actually succeeds against a booking created that way.
  // -------------------------------------------------------------------
  const client = new pg.Client({ connectionString: scenarioConnectionString });
  const harness = createRlsHarness(client);

  const adminId = crypto.randomUUID();
  const adminEmail = `${adminId}@example.test`;
  const studentId = crypto.randomUUID();
  const studentEmail = `pending-flow-${studentId}@example.test`;
  let planId;
  let submittedBookingRef;
  let submittedEnrollmentId;

  await harness.test("seed: an AAL2 admin with enrollments:write, a registered student, and a matching plan", async () => {
    await client.connect();
    await harness.asSuperuser();

    for (const [id, email] of [[adminId, adminEmail], [studentId, studentEmail]]) {
      await client.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb);`, [id, email]);
    }
    await client.query(`update public.profiles set role = 'admin' where id = $1;`, [adminId]);
    await client.query(`insert into public.admin_role_assignments (user_id, role) values ($1, 'admin');`, [adminId]);

    const plan = await client.query(
      `insert into public.plans (slug, name, amount_minor, currency, active) values ('huffaz-plan', 'Huffaz Program', 8400, 'EUR', true) returning id;`,
    );
    planId = plan.rows[0].id;
  });

  await harness.test("a public booking submitted through submit_enrollment_booking() (as anon) lands as 'pending', not 'new'", async () => {
    await harness.asAnon();
    const { rows } = await client.query(
      `select public.submit_enrollment_booking($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) as booking_ref;`,
      [
        "Pending Flow Student", studentEmail, "+15550001111", "US", "Austin", "America/Chicago",
        "[]", "[]", "en", "beginner", "adult", null, null, null, "huffaz-plan", "submitted via anon RPC",
      ],
    );
    submittedBookingRef = rows[0].booking_ref;
    harness.assert(typeof submittedBookingRef === "string" && submittedBookingRef.startsWith("AR-"), "should return a real booking_ref");

    await harness.asSuperuser();
    const enr = await client.query(`select id, status from public.enrollments where booking_ref = $1;`, [submittedBookingRef]);
    harness.assert(enr.rows.length === 1, "the submitted booking should exist");
    harness.assert(enr.rows[0].status === "pending", `expected 'pending', got '${enr.rows[0].status}'`);
    submittedEnrollmentId = enr.rows[0].id;
  });

  await harness.test("that same row is readable back as 'pending' (the exact column value both admin controllers pass through as-is)", async () => {
    const { rows } = await client.query(`select status from public.enrollments where id = $1;`, [submittedEnrollmentId]);
    harness.assert(rows[0].status === "pending");
  });

  await harness.test("Approve & Activate succeeds for a 'pending' booking created through the real RPC", async () => {
    await harness.asUser(adminId, "aal2");
    const { rows } = await client.query(
      `select * from public.admin_activate_subscription_from_enrollment($1);`,
      [submittedEnrollmentId],
    );
    harness.assert(rows.length === 1, "should return one subscriptions row");
    harness.assert(rows[0].status === "active", `expected subscription status 'active', got '${rows[0].status}'`);
    harness.assert(rows[0].plan_id === planId, "activated plan must be the one matching the booking's requested_plan_slug");

    await harness.asSuperuser();
    const enr = await client.query(`select status from public.enrollments where id = $1;`, [submittedEnrollmentId]);
    harness.assert(enr.rows[0].status === "enrolled", "enrollment should now be 'enrolled'");
  });

  // Two separate result arrays (the top-level `test`/`results` for phases
  // 1-2, `harness`'s own for phase 3) get combined into ONE final "N/M
  // passed." line, printed last, so orchestrate-db-tests.mjs's
  // parseSummaryLine() — which takes the LAST such line in the output —
  // reports the true combined total rather than only phase 3's count.
  const dbResults = results;
  const dbFailed = dbResults.filter((r) => !r.pass);
  console.log(`\n(migration-phase) ${dbResults.length - dbFailed.length}/${dbResults.length} passed.`);

  const harnessResults = harness.results;
  const harnessFailed = harnessResults.filter((r) => !r.pass);
  console.log(`(guest-booking-phase) ${harnessResults.length - harnessFailed.length}/${harnessResults.length} passed.`);

  await client.end();
  await pool.end();

  const totalCount = dbResults.length + harnessResults.length;
  const totalPassed = totalCount - dbFailed.length - harnessFailed.length;
  console.log(`\n${totalPassed}/${totalCount} passed.`);

  if (dbFailed.length > 0 || harnessFailed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[enrollment-new-to-pending-migration-test] harness crashed:", err);
  process.exitCode = 1;
});
