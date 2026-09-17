// Direct RPC tests for public.admin_activate_subscription_from_enrollment()
// (lib/db/drizzle/0028_admin_booking_activation.sql) — the "admin approves
// a booking -> activates the student's subscription" action under
// DATA_BACKEND=supabase (scope correction, see docs/current-project-status.md).
//
// Written after an independent review found the first version of this
// migration genuinely broken/incomplete in three ways, all fixed in the
// current migration and asserted here directly against a real Postgres,
// not re-derived from reading the SQL:
//   1. The RPC used to require a caller-supplied p_plan_id with no link
//      back to what the student actually booked — the frontend's Approve
//      button never had a plan picker and never sent one, so every
//      Supabase-mode approval 400'd. Fixed: the plan is now resolved
//      INSIDE the function from enrollments.requested_plan_slug, matched
//      against plans.slug/name. Tests below prove that resolution actually
//      happens and actually ties the activated plan to the booking (not
//      an arbitrary admin-chosen one) — and that the old 3-argument
//      signature (which would have let a caller pick any plan) no longer
//      exists at all.
//   2. The RPC checked only is_admin_aal2(), not the finer-grained
//      enrollments:write permission that Express's own route already
//      requires — a real gap versus this table's own more recent
//      precedent (0018_admin_users_system_and_enrollment_gaps.sql's
//      enrollments_insert_admin_aal2 policy uses is_admin_aal2() AND
//      authorize('enrollments:write')). Fixed: same combined check now
//      lives inside the RPC itself, so it holds even for a caller that
//      reaches the RPC directly, not just through Express.
//   3. No direct-RPC test existed at all — the only prior verification was
//      a throwaway, unsaved script run once by hand. This file replaces
//      that with a permanent, always-runnable suite using the same
//      local-harness/role-switching pattern as rls.local.test.mjs.
//
// Production-readiness audit follow-up (2026-09-17): wired into
// orchestrate-db-tests.mjs's pipeline / DB_ASSERTION_CONTRACT (see
// orchestrator-lib.mjs) so `npm run test:db` and CI actually run this suite
// instead of it only existing as a file someone has to remember to run by
// hand. Can still be run standalone:
//   TEST_DATABASE_URL=postgres://... node lib/db/test/rpc-admin-booking-activation.local.test.mjs
// against a Postgres already migrated through 0028 (e.g. via
// `node lib/db/test/run-migrations.mjs` against the same TEST_DATABASE_URL).
import pg from "pg";
import crypto from "node:crypto";
import { createRlsHarness, requireLocalTestDatabaseUrl } from "./rls-helpers.mjs";

const connectionString = requireLocalTestDatabaseUrl();
const client = new pg.Client({ connectionString });
const { test, assert, expectReject, asSuperuser, asUser, results, report } = createRlsHarness(client);

async function main() {
  await client.connect();

  const studentId = crypto.randomUUID();
  const studentEmail = `booking-activation-${studentId}@example.test`;
  // A second student, used only by the "name match" happy-path test below —
  // subscriptions_one_active_per_user is a real constraint (a genuine
  // business rule, not something to route around), so the two happy-path
  // activations must land on different accounts rather than reusing
  // studentId's now-already-active subscription from the first one.
  const student2Id = crypto.randomUUID();
  const student2Email = `booking-activation-2-${student2Id}@example.test`;
  const noAccountEmail = `no-account-${crypto.randomUUID()}@example.test`;

  const adminId = crypto.randomUUID();        // admin_role_assignments.role = 'admin' -> has enrollments:write by seed
  // NOTE: 'editor' was deliberately widened to also hold enrollments:write
  // by 0025_booking_first_enrollment.sql ("so it can run the day-to-day
  // booking-status pipeline" — see docs/current-project-status.md §5a), so
  // it is NOT a valid negative fixture for this check any more. 'viewer'
  // (0013_admin_rbac.sql's seed) has only enrollments:read and was never
  // widened — the correct role to prove the new authorize() check actually
  // rejects someone.
  const viewerAdminId = crypto.randomUUID();  // admin_role_assignments.role = 'viewer' -> enrollments:read only, NOT write

  let planBySlugId, planByNameId;
  let enrollmentSlugMatchId, enrollmentNameMatchId, enrollmentNoAccountId, enrollmentNoPlanId, enrollmentCancelledId;

  await test("seed: two admins (one with enrollments:write, one without), a student profile, two plans, and several bookings", async () => {
    await asSuperuser();

    for (const [id, email] of [[studentId, studentEmail], [student2Id, student2Email], [adminId, `${adminId}@example.test`], [viewerAdminId, `${viewerAdminId}@example.test`]]) {
      await client.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb);`, [id, email]);
    }
    await client.query(`update public.profiles set role = 'admin' where id in ($1, $2);`, [adminId, viewerAdminId]);
    await client.query(`insert into public.admin_role_assignments (user_id, role) values ($1, 'admin');`, [adminId]);
    await client.query(`insert into public.admin_role_assignments (user_id, role) values ($1, 'viewer');`, [viewerAdminId]);

    const slugPlan = await client.query(
      `insert into public.plans (slug, name, amount_minor, currency, active) values ('huffaz-plan', 'Huffaz Program', 8400, 'EUR', true) returning id;`,
    );
    planBySlugId = slugPlan.rows[0].id;

    const namePlan = await client.query(
      `insert into public.plans (slug, name, amount_minor, currency, active) values ('ijazah-plan', 'Ijazah', 11200, 'EUR', true) returning id;`,
    );
    planByNameId = namePlan.rows[0].id;

    // Booking whose requested_plan_slug matches a real plans.slug exactly.
    const e1 = await client.query(
      `insert into public.enrollments (name, email, times, subjects, requested_plan_slug, status, booking_ref)
       values ('Slug Match', $1, '[]'::jsonb, '[]'::jsonb, 'huffaz-plan', 'new', 'AR-TEST-0001') returning id;`,
      [studentEmail],
    );
    enrollmentSlugMatchId = e1.rows[0].id;

    // Booking whose requested_plan_slug matches a plans.name, not any slug
    // (exactly what the real frontend actually sends today — Enroll.jsx
    // submits the plan's display name, e.g. "Ijazah", not a slug — see
    // artifacts/al-rahma-academy/src/pages/Enroll.jsx and src/data/home.js).
    const e2 = await client.query(
      `insert into public.enrollments (name, email, times, subjects, requested_plan_slug, status, booking_ref)
       values ('Name Match', $1, '[]'::jsonb, '[]'::jsonb, 'Ijazah', 'new', 'AR-TEST-0002') returning id;`,
      [student2Email],
    );
    enrollmentNameMatchId = e2.rows[0].id;

    const e3 = await client.query(
      `insert into public.enrollments (name, email, times, subjects, requested_plan_slug, status, booking_ref)
       values ('No Account', $1, '[]'::jsonb, '[]'::jsonb, 'huffaz-plan', 'new', 'AR-TEST-0003') returning id;`,
      [noAccountEmail],
    );
    enrollmentNoAccountId = e3.rows[0].id;

    const e4 = await client.query(
      `insert into public.enrollments (name, email, times, subjects, requested_plan_slug, status, booking_ref)
       values ('No Plan Match', $1, '[]'::jsonb, '[]'::jsonb, 'totally-unknown-plan', 'new', 'AR-TEST-0004') returning id;`,
      [studentEmail],
    );
    enrollmentNoPlanId = e4.rows[0].id;

    const e5 = await client.query(
      `insert into public.enrollments (name, email, times, subjects, requested_plan_slug, status, booking_ref)
       values ('Cancelled', $1, '[]'::jsonb, '[]'::jsonb, 'huffaz-plan', 'cancelled', 'AR-TEST-0005') returning id;`,
      [studentEmail],
    );
    enrollmentCancelledId = e5.rows[0].id;
  });

  await test("AAL1 admin (no MFA step-up) is rejected", async () => {
    await asUser(adminId, "aal1");
    await expectReject(
      () => client.query(`select * from public.admin_activate_subscription_from_enrollment($1);`, [enrollmentSlugMatchId]),
      { messageIncludes: "not an AAL2-verified admin" },
    );
  });

  await test("AAL2 admin WITHOUT the enrollments:write permission (role='viewer') is rejected — the new authorize() check", async () => {
    await asUser(viewerAdminId, "aal2");
    await expectReject(
      () => client.query(`select * from public.admin_activate_subscription_from_enrollment($1);`, [enrollmentSlugMatchId]),
      { messageIncludes: "lacks the enrollments:write permission" },
    );

    await asSuperuser();
    const stillNew = await client.query(`select status from public.enrollments where id = $1;`, [enrollmentSlugMatchId]);
    assert(stillNew.rows[0].status === "new", "the booking must be untouched by a rejected caller");
  });

  await test("the old 3-argument signature (p_enrollment_id, p_plan_id, p_period_end) no longer exists — a caller cannot pass an arbitrary plan", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(
        `select * from public.admin_activate_subscription_from_enrollment($1, $2, now() + interval '30 days');`,
        [enrollmentSlugMatchId, planByNameId],
      ),
      { sqlState: "42883" }, // undefined_function
      "the 3-arg overload should not exist any more",
    );
  });

  await test("happy path (slug match): AAL2 admin with enrollments:write activates the plan the booking actually requested", async () => {
    await asUser(adminId, "aal2");
    const { rows } = await client.query(
      `select * from public.admin_activate_subscription_from_enrollment($1);`,
      [enrollmentSlugMatchId],
    );
    assert(rows.length === 1, "should return one subscriptions row");
    const sub = rows[0];
    assert(sub.status === "active", `expected status 'active', got '${sub.status}'`);
    assert(sub.plan_id === planBySlugId, "activated plan_id must be the plan whose SLUG matched the booking's requested_plan_slug, not any other plan");
    assert(sub.user_id === studentId, "subscription must belong to the account matched by email");

    await asSuperuser();
    const enr = await client.query(`select status from public.enrollments where id = $1;`, [enrollmentSlugMatchId]);
    assert(enr.rows[0].status === "enrolled", "enrollment status should be 'enrolled' after approval");

    const mp = await client.query(
      `select * from public.manual_payments where user_id = $1 and plan_id = $2 order by created_at desc limit 1;`,
      [studentId, planBySlugId],
    );
    assert(mp.rows.length === 1, "an admin-attested manual_payments row should have been created");
    assert(mp.rows[0].status === "approved", "the manual_payments row should already be approved");
    assert(mp.rows[0].method === "admin_attested_booking", "method should record this was an admin attestation, not a self-submission");
    assert(mp.rows[0].reviewer_admin_id === adminId, "reviewer_admin_id should be the approving admin");

    const audit = await client.query(
      `select * from public.admin_audit_log where action = 'admin_activate_subscription_from_enrollment' and resource_id = $1;`,
      [enrollmentSlugMatchId],
    );
    assert(audit.rows.length === 1, "exactly one audit-log row should exist for this approval");
    assert(audit.rows[0].actor_admin_id === adminId, "audit row should record the real acting admin");
  });

  await test("happy path (name match): a booking whose requested_plan_slug matches plans.name (not any slug) still resolves correctly — matches what the real frontend sends today", async () => {
    await asUser(adminId, "aal2");
    const { rows } = await client.query(
      `select * from public.admin_activate_subscription_from_enrollment($1);`,
      [enrollmentNameMatchId],
    );
    assert(rows.length === 1);
    assert(rows[0].plan_id === planByNameId, "activated plan_id must be the plan whose NAME matched the booking's requested_plan_slug ('Ijazah')");
  });

  await test("double-approve (already enrolled) is rejected — the row claim excludes 'enrolled'/'cancelled'", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`select * from public.admin_activate_subscription_from_enrollment($1);`, [enrollmentSlugMatchId]),
      { messageIncludes: "not a booking awaiting approval" },
    );
  });

  await test("a cancelled booking is rejected the same way", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`select * from public.admin_activate_subscription_from_enrollment($1);`, [enrollmentCancelledId]),
      { messageIncludes: "not a booking awaiting approval" },
    );
  });

  await test("no matching registered account (email never signed up) is rejected, nothing created", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`select * from public.admin_activate_subscription_from_enrollment($1);`, [enrollmentNoAccountId]),
      { messageIncludes: "no registered account found" },
    );

    await asSuperuser();
    const enr = await client.query(`select status from public.enrollments where id = $1;`, [enrollmentNoAccountId]);
    assert(enr.rows[0].status === "new", "the booking must stay untouched when no account matches");
  });

  await test("no active plan matches the booking's requested_plan_slug — clear, actionable rejection, nothing created", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`select * from public.admin_activate_subscription_from_enrollment($1);`, [enrollmentNoPlanId]),
      { messageIncludes: "no active plan matches the booking" },
    );

    await asSuperuser();
    const enr = await client.query(`select status from public.enrollments where id = $1;`, [enrollmentNoPlanId]);
    assert(enr.rows[0].status === "new", "the booking must stay untouched when no plan matches");
    const mp = await client.query(`select 1 from public.manual_payments where reference = 'AR-TEST-0004';`);
    assert(mp.rows.length === 0, "no manual_payments row should have been created for a rejected approval");
  });

  const ok = report();
  await client.end();
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[rpc-admin-booking-activation-test] harness crashed:", err);
  process.exitCode = 1;
});
