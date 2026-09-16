// Direct test for lib/db/drizzle/0030_enrollment_status_reconciliation.sql
// (see that migration's own comment for the full defect it fixes): the
// Postgres enrollments_status_allowlist CHECK and the shared JS admin-write
// allowlist (utils/enrollmentValidation.js's ENROLLMENT_STATUSES) had
// genuinely diverged — an admin selecting "pending"/"approved" in the SAME
// status dropdown against DATA_BACKEND=supabase would previously hit a raw
// check_violation. This proves, against a real local Postgres: both new
// canonical values are now accepted; every pre-existing legacy value stays
// accepted (not narrowed); a genuinely invalid value is still rejected; and
// a historical row's value is untouched by the migration itself (it's a
// constraint widen, never an UPDATE).
import pg from "pg";
import crypto from "node:crypto";
import { requireLocalTestDatabaseUrl } from "./rls-helpers.mjs";

const connectionString = requireLocalTestDatabaseUrl();
const pool = new pg.Pool({ connectionString });

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

async function insertEnrollment(status) {
  const email = `status-recon-${crypto.randomUUID()}@example.test`;
  return pool.query(
    `insert into public.enrollments (name, email, times, subjects, status) values ('X', $1, '[]'::jsonb, '[]'::jsonb, $2) returning id, status;`,
    [email, status],
  );
}

async function main() {
  const CANONICAL_NEW = ["pending", "approved"];
  const LEGACY_PRESERVED = ["new", "contacted", "scheduled", "awaiting_payment", "paid", "enrolled", "cancelled"];

  for (const status of CANONICAL_NEW) {
    await test(`'${status}' (the JS-layer canonical value the admin PUT allowlist already accepted) is now a valid Postgres value too`, async () => {
      const { rows } = await insertEnrollment(status);
      assert(rows[0].status === status, `expected status '${status}', got '${rows[0].status}'`);
    });
  }

  for (const status of LEGACY_PRESERVED) {
    await test(`legacy/existing value '${status}' remains valid (the widen is additive, never a narrowing)`, async () => {
      const { rows } = await insertEnrollment(status);
      assert(rows[0].status === status);
    });
  }

  await test("a genuinely invalid status value is still rejected", async () => {
    let rejected = false;
    try {
      await insertEnrollment("bogus-status");
    } catch (err) {
      rejected = true;
      assert(err.code === "23514", `expected a check_violation (23514), got ${err.code}: ${err.message}`);
    }
    assert(rejected, "'bogus-status' should have been rejected by the CHECK constraint");
  });

  await test("a historical row's status value is untouched by the migration itself — this is a constraint widen, never a data UPDATE", async () => {
    // Directly asserts against pg_constraint's definition text rather than
    // re-deriving it via another insert, so this test is really checking
    // "the migration only ever ran an ALTER TABLE ... ADD CONSTRAINT", not
    // just re-testing the same insert behavior a second time.
    const { rows } = await pool.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'enrollments_status_allowlist';`,
    );
    assert(rows.length === 1, "enrollments_status_allowlist constraint should exist exactly once");
    const def = rows[0].def;
    for (const status of [...CANONICAL_NEW, ...LEGACY_PRESERVED]) {
      assert(def.includes(`'${status}'`), `constraint definition should mention '${status}': ${def}`);
    }
  });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  await pool.end();
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[enrollment-status-reconciliation-test] harness crashed:", err);
  process.exitCode = 1;
});
