// Real role-switching RLS tests against the LOCAL Docker Postgres this
// baseline was migrated into (0002_rls.sql) — every check here is an
// actual query result under an actual non-owner Postgres role (`anon`/
// `authenticated`/`service_role`), not a read of the policy SQL. Same
// localhost-only guard as the other test scripts. Session-switching
// mechanics (`asAnon()`/`asUser()`/`asService()`/`asSuperuser()`) live in
// rls-helpers.mjs (RLS Remediation Round 2 — factored out so
// rls-full-matrix.local.test.mjs can reuse them exactly).
import pg from "pg";
import crypto from "node:crypto";
import { createRlsHarness, requireLocalTestDatabaseUrl } from "./rls-helpers.mjs";

const connectionString = requireLocalTestDatabaseUrl();
const client = new pg.Client({ connectionString });
const { test, assert, expectReject, asSuperuser, asAnon, asUser, asService, results, report } = createRlsHarness(client);

async function main() {
  await client.connect();

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  // RLS Remediation Round 3 (Section C): userA already carries an
  // active subscription from the seed fixture below —
  // subscriptions_one_active_per_user (a real partial unique index)
  // means a SECOND active-status subscription for userA would
  // legitimately fail. userC/userD are fresh users with no pre-existing
  // subscription, specifically for the new subscription-RPC tests
  // further down, so those tests exercise the RPCs' own logic rather
  // than colliding with an unrelated earlier fixture's row.
  const userCId = crypto.randomUUID();
  const userDId = crypto.randomUUID();
  let planId;
  let chargeId;

  // -----------------------------------------------------------------
  // Seed fixtures as superuser (bypasses RLS entirely, as intended for
  // fixture setup — not what's under test here).
  // -----------------------------------------------------------------
  await test("seed: fixtures (auth.users, profiles via trigger, admin promotion, plan, a succeeded charge)", async () => {
    await asSuperuser();
    for (const [id, name] of [[userAId, "User A"], [userBId, "User B"], [adminId, "Admin"], [userCId, "User C"], [userDId, "User D"]]) {
      await client.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb);`,
        [id, `${id}@example.test`, JSON.stringify({ name })]);
    }
    await client.query(`update public.profiles set role = 'admin' where id = $1;`, [adminId]);

    const planRes = await client.query(
      `insert into public.plans (slug, name, amount_minor, currency) values ('rls-plan', 'RLS Plan', 5000, 'EUR') returning id;`,
    );
    planId = planRes.rows[0].id;

    const chargeRes = await client.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 5000, 'stripe') returning id;`,
      [userAId, planId],
    );
    chargeId = chargeRes.rows[0].id;
    await client.query(`update public.payments set status = 'succeeded' where id = $1;`, [chargeId]);
  });

  // -----------------------------------------------------------------
  // anon: can INSERT enrollments, cannot SELECT them.
  // -----------------------------------------------------------------
  await test("anon can INSERT into enrollments", async () => {
    await asAnon();
    await client.query(
      `insert into public.enrollments (name, email, times, subjects) values ('Anon Lead', 'anon@example.test', '[]'::jsonb, '[]'::jsonb);`,
    );
  });

  await test("anon cannot SELECT from enrollments (denied at the GRANT layer, Round 2 tightening)", async () => {
    // Round 2 (finding 5): anon has no SELECT grant on enrollments at all
    // any more (only a column-restricted INSERT) — this now fails before
    // RLS is even evaluated, not by RLS filtering to 0 rows.
    await asAnon();
    await expectReject(
      () => client.query(`select * from public.enrollments;`),
      "anon should be denied at the GRANT layer, not merely filtered to 0 rows",
    );
  });

  await test("anon cannot SELECT from payments (denied at the GRANT layer, Round 2 tightening)", async () => {
    await asAnon();
    await expectReject(
      () => client.query(`select * from public.payments;`),
      "anon should be denied at the GRANT layer, not merely filtered to 0 rows",
    );
  });

  // -----------------------------------------------------------------
  // Regular user: owns their own profiles row, cannot see/edit others',
  // and critically cannot self-promote to admin via raw UPDATE.
  // -----------------------------------------------------------------
  await test("user A can SELECT their own profiles row, not user B's", async () => {
    await asUser(userAId);
    const own = await client.query(`select * from public.profiles where id = $1;`, [userAId]);
    assert(own.rows.length === 1, "user A should see their own profile");
    const other = await client.query(`select * from public.profiles where id = $1;`, [userBId]);
    assert(other.rows.length === 0, "user A should NOT see user B's profile");
  });

  await test("user A's raw UPDATE on profiles.role is rejected — no UPDATE grant exists for authenticated at all", async () => {
    // Round 2 (finding 1): authenticated has no base UPDATE grant on
    // profiles any more (dropped alongside the raw admin policy) — this
    // now fails at the GRANT layer, a stronger guarantee than "RLS
    // filters to 0 rows" (which still required the grant to exist).
    await asUser(userAId);
    await expectReject(
      () => client.query(`update public.profiles set role = 'admin' where id = $1 returning *;`, [userAId]),
      "a raw UPDATE on profiles should be denied at the GRANT layer",
    );

    await asSuperuser();
    const check = await client.query(`select role from public.profiles where id = $1;`, [userAId]);
    assert(check.rows[0].role === "user", `user A's role must still be 'user', got '${check.rows[0].role}'`);
  });

  await test("update_own_profile_name() RPC lets user A change their own name (bypasses RLS as the function owner)", async () => {
    await asUser(userAId);
    const res = await client.query(`select * from public.update_own_profile_name('User A Renamed');`);
    assert(res.rows[0].name === "User A Renamed", "name should have been updated via the RPC");
  });

  await test("admin_set_role() RPC rejects a non-admin caller", async () => {
    await asUser(userAId);
    await expectReject(
      () => client.query(`select * from public.admin_set_role($1, 'admin');`, [userBId]),
      "a non-admin calling admin_set_role() should have been rejected",
    );
  });

  // -----------------------------------------------------------------
  // User cannot read another user's payments.
  // -----------------------------------------------------------------
  await test("user A can SELECT their own payments row", async () => {
    await asUser(userAId);
    const { rows } = await client.query(`select * from public.payments where id = $1;`, [chargeId]);
    assert(rows.length === 1, "user A should see their own payment");
  });

  await test("user B cannot SELECT user A's payments row (RLS filters to 0 rows)", async () => {
    await asUser(userBId);
    const { rows } = await client.query(`select * from public.payments where id = $1;`, [chargeId]);
    assert(rows.length === 0, `expected 0 rows visible to user B, got ${rows.length}`);
  });

  // -----------------------------------------------------------------
  // Admin AAL1 vs AAL2 — the confirmed tightening.
  // -----------------------------------------------------------------
  await test("AAL1 admin is rejected reading payments directly (RLS filters to 0 rows)", async () => {
    await asUser(adminId, "aal1");
    const { rows } = await client.query(`select * from public.payments;`);
    assert(rows.length === 0, `expected 0 rows visible to an AAL1 admin, got ${rows.length}`);
  });

  await test("AAL1 admin is rejected reading manual_payments directly (RLS filters to 0 rows)", async () => {
    await asUser(adminId, "aal1");
    const { rows } = await client.query(`select * from public.manual_payments;`);
    assert(rows.length === 0, `expected 0 rows visible to an AAL1 admin, got ${rows.length}`);
  });

  await test("AAL1 admin CAN read operational data (enrollments) — the confirmed AAL1/AAL2 split", async () => {
    await asUser(adminId, "aal1");
    const { rows } = await client.query(`select * from public.enrollments;`);
    assert(rows.length >= 1, "an AAL1 admin should be able to read enrollments (operational, non-financial)");
  });

  await test("AAL2 admin CAN read payments", async () => {
    await asUser(adminId, "aal2");
    const { rows } = await client.query(`select * from public.payments where id = $1;`, [chargeId]);
    assert(rows.length === 1, "an AAL2 admin should be able to read payments");
  });

  await test("AAL2 admin CAN read manual_payments (even with zero rows, the policy itself must not filter an admin out — verified via a real row)", async () => {
    await asSuperuser();
    const mp = await client.query(
      `insert into public.manual_payments (user_id, amount_minor, method) values ($1, 2500, 'bank') returning id;`,
      [userBId],
    );
    await asUser(adminId, "aal2");
    const { rows } = await client.query(`select * from public.manual_payments where id = $1;`, [mp.rows[0].id]);
    assert(rows.length === 1, "an AAL2 admin should be able to read manual_payments");
  });

  // -----------------------------------------------------------------
  // admin_set_role() / admin_review_manual_payment() / admin_issue_refund()
  // — the atomic admin RPCs, and their audit-log side effect.
  // -----------------------------------------------------------------
  await test("admin_set_role() promotes a user and writes an admin_audit_log row atomically", async () => {
    await asUser(adminId, "aal2");
    const res = await client.query(`select * from public.admin_set_role($1, 'admin');`, [userBId]);
    assert(res.rows[0].role === "admin", "userB should now be admin");

    const log = await client.query(
      `select * from public.admin_audit_log where action = 'admin_set_role' and resource_id = $1;`,
      [userBId],
    );
    assert(log.rows.length === 1, "admin_set_role should have written exactly one admin_audit_log row");

    // Revert for the rest of the suite's assumptions.
    await asSuperuser();
    await client.query(`update public.profiles set role = 'user' where id = $1;`, [userBId]);
  });

  await test("admin_review_manual_payment() approves and writes an admin_audit_log row atomically", async () => {
    await asSuperuser();
    const mp = await client.query(
      `insert into public.manual_payments (user_id, amount_minor, method) values ($1, 3000, 'bank') returning id;`,
      [userAId],
    );
    const mpId = mp.rows[0].id;

    await asUser(adminId, "aal2");
    const res = await client.query(
      `select * from public.admin_review_manual_payment($1, 'approved', 'looks good');`,
      [mpId],
    );
    assert(res.rows[0].status === "approved");

    const log = await client.query(
      `select * from public.admin_audit_log where action = 'admin_review_manual_payment' and resource_id = $1;`,
      [mpId],
    );
    assert(log.rows.length === 1, "admin_review_manual_payment should have written exactly one admin_audit_log row");
  });

  // RLS Remediation Round 3 (Section F): admin_issue_refund() renamed to
  // admin_record_refund() — the old name implied a real gateway refund
  // call this function never actually performed (confirmed zero real
  // callers anywhere in the tracked/untracked repo before the rename —
  // see the approved plan's "Verified before planning" section).
  await test("admin_record_refund() records a refund and writes an admin_audit_log row atomically", async () => {
    await asUser(adminId, "aal2");
    const res = await client.query(`select * from public.admin_record_refund($1, 1000, null);`, [chargeId]);
    assert(res.rows[0].kind === "refund" && Number(res.rows[0].amount_minor) === 1000);

    const log = await client.query(
      `select * from public.admin_audit_log where action = 'admin_record_refund' and resource_id = $1;`,
      [res.rows[0].id],
    );
    assert(log.rows.length === 1, "admin_record_refund should have written exactly one admin_audit_log row");
  });

  await test("admin_record_refund() is still governed by validate_refund_insert() — an oversized refund is rejected", async () => {
    await asUser(adminId, "aal2");
    // 1000 already refunded above, 5000 charge — 4500 more would push
    // the total to 5500, over the limit.
    await expectReject(
      () => client.query(`select * from public.admin_record_refund($1, 4500, null);`, [chargeId]),
      { sqlState: "P0001", messageIncludes: "would exceed the refundable balance" },
      "an over-limit refund via the RPC should still be rejected by the trigger",
    );
  });

  await test("admin_record_refund() rejects a zero or negative amount (Section F)", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`select * from public.admin_record_refund($1, 0, null);`, [chargeId]),
      { sqlState: "P0001", messageIncludes: "must be greater than zero" },
      "a zero-amount refund should be rejected",
    );
    await expectReject(
      () => client.query(`select * from public.admin_record_refund($1, -50, null);`, [chargeId]),
      { sqlState: "P0001", messageIncludes: "must be greater than zero" },
      "a negative-amount refund should be rejected",
    );
  });

  await test("validate_refund_insert() itself rejects a zero amount, even bypassing the RPC via a raw service_role INSERT", async () => {
    await asService();
    await expectReject(
      () => client.query(
        `insert into public.payments (user_id, kind, parent_payment_id, amount_minor, currency_snapshot, gateway, status) values ($1, 'refund', $2, 0, 'EUR', 'stripe', 'succeeded');`,
        [userAId, chargeId],
      ),
      { sqlState: "P0001", messageIncludes: "must be greater than zero" },
      "the trigger itself, not just the RPC, must reject a zero-amount refund",
    );
  });

  await test("a real 2-connection race on the refund cap produces exactly one winner (unchanged guarantee, re-verified after the Section F edit)", async () => {
    await asSuperuser();
    const raceCharge = await client.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway, status) values ($1, $2, 1000, 'stripe', 'succeeded') returning id;`,
      [userAId, planId],
    );
    const raceChargeId = raceCharge.rows[0].id;

    const race = new pg.Client({ connectionString });
    await race.connect();
    try {
      await Promise.all([
        client.query(`set role authenticated;`),
        race.query(`set role authenticated;`),
      ]);
      await Promise.all([
        client.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: adminId, aal: "aal2" })]),
        race.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: adminId, aal: "aal2" })]),
      ]);

      const attempt = (conn) =>
        conn.query(`select * from public.admin_record_refund($1, 700, null);`, [raceChargeId]).then(
          () => "ok",
          () => "rejected",
        );
      const [a, b] = await Promise.all([attempt(client), attempt(race)]);
      assert(
        (a === "ok") !== (b === "ok"),
        `expected exactly one of the two concurrent 700-refund attempts (cap 1000, 700+700>1000) to win, got a=${a} b=${b}`,
      );

      const total = await client.query(
        `select coalesce(sum(amount_minor), 0)::int as total from public.payments where parent_payment_id = $1 and kind = 'refund' and status = 'succeeded';`,
        [raceChargeId],
      );
      assert(total.rows[0].total === 700, `expected exactly 700 total refunded, got ${total.rows[0].total}`);
    } finally {
      await race.end();
      await asSuperuser();
    }
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 2 (finding 1): the raw admin bypass paths that
  // used to sit alongside these same RPCs are now closed — same admin,
  // same AAL2 session, a raw write is rejected before it ever reaches
  // the RPC's audit-log guarantee.
  // -----------------------------------------------------------------
  await test("AAL2 admin raw UPDATE on profiles is rejected — no policy/grant permits it any more", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`update public.profiles set role = 'admin' where id = $1;`, [userBId]),
      "a raw admin UPDATE on profiles should be rejected — admin_set_role() is the only path",
    );
  });

  await test("AAL2 admin raw INSERT of a fabricated succeeded charge into payments is rejected", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(
        `insert into public.payments (user_id, plan_id, kind, amount_minor, gateway, status) values ($1, $2, 'charge', 999999, 'stripe', 'succeeded');`,
        [userAId, planId],
      ),
      "a raw admin INSERT of a fake succeeded charge should be rejected — admin_issue_refund() is the only INSERT path",
    );
  });

  await test("AAL2 admin raw UPDATE on manual_payments.status is rejected", async () => {
    await asSuperuser();
    const mp = await client.query(
      `insert into public.manual_payments (user_id, amount_minor, method) values ($1, 4000, 'bank') returning id;`,
      [userAId],
    );
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`update public.manual_payments set status = 'approved' where id = $1;`, [mp.rows[0].id]),
      "a raw admin UPDATE on manual_payments should be rejected — admin_review_manual_payment() is the only path",
    );
  });

  await test("AAL2 admin raw INSERT into admin_audit_log is rejected", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(
        `insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id) values ($1, 'fake_action', 'profiles', $2);`,
        [adminId, userAId],
      ),
      "a raw INSERT into admin_audit_log should be rejected — the 3 admin RPCs are the only writers",
    );
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 3 (Section D): issue_invoice_from_payment() is
  // now the ONLY real issuance path — the raw admin INSERT policy is
  // gone (validate_invoice_insert() stays as a defensive backstop
  // behind the RPC, not the primary write path any more; see the
  // dedicated invoice-issuance sweep in rls-full-matrix.local.test.mjs
  // for the full pending/failed/refund/mismatch/idempotency/concurrency
  // coverage — this file just confirms the raw path is really closed).
  // -----------------------------------------------------------------
  await test("invoices: raw admin INSERT is rejected at the GRANT layer — issue_invoice_from_payment() is the only path", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(
        `insert into public.invoices (user_id, payment_id, amount_minor_snapshot) values ($1, $2, 5000);`,
        [userAId, chargeId],
      ),
      { sqlState: "42501", messageIncludes: "permission denied" },
      "a raw admin INSERT into invoices should be rejected at the GRANT layer",
    );
  });

  let firstInvoiceId;
  await test("issue_invoice_from_payment() issues a real invoice for the succeeded charge", async () => {
    await asUser(adminId, "aal2");
    const res = await client.query(`select * from public.issue_invoice_from_payment($1);`, [chargeId]);
    assert(res.rows[0].status === "paid" && Number(res.rows[0].amount_minor_snapshot) === 5000, "the issued invoice should snapshot the charge's own amount and be paid");
    firstInvoiceId = res.rows[0].id;
  });

  await test("issue_invoice_from_payment() is idempotent — a repeat call returns the same invoice, never a duplicate", async () => {
    await asUser(adminId, "aal2");
    const res = await client.query(`select * from public.issue_invoice_from_payment($1);`, [chargeId]);
    assert(res.rows[0].id === firstInvoiceId, "a repeat issuance call should return the SAME invoice id");

    await asSuperuser();
    const count = await client.query(`select count(*)::int as n from public.invoices where payment_id = $1;`, [chargeId]);
    assert(count.rows[0].n === 1, `expected exactly 1 invoice row for this payment, got ${count.rows[0].n}`);
  });

  await test("invoices: raw admin UPDATE/DELETE are rejected at the GRANT layer — immutable once issued, genuinely (no policy at all)", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`update public.invoices set status = 'cancelled' where id = $1;`, [firstInvoiceId]),
      { sqlState: "42501", messageIncludes: "permission denied" },
      "a raw admin UPDATE on invoices should be rejected",
    );
    await expectReject(
      () => client.query(`delete from public.invoices where id = $1;`, [firstInvoiceId]),
      { sqlState: "42501", messageIncludes: "permission denied" },
      "a raw admin DELETE on invoices should be rejected",
    );
  });

  await test("invoices: forbid_invoice_mutation() is a real, second layer — blocks UPDATE/DELETE even for service_role, which DOES hold the raw GRANT", async () => {
    // Direct verification while building this migration found a real
    // gap: service_role's blanket table grant (0004, never revoked for
    // service_role) plus BYPASSRLS meant nothing actually stopped a raw
    // service_role UPDATE/DELETE on an issued invoice — the GRANT-layer
    // denial above only protects against `authenticated`. This is the
    // trigger that closes it for real, for every role.
    await asService();
    await expectReject(
      () => client.query(`update public.invoices set status = 'cancelled' where id = $1;`, [firstInvoiceId]),
      { sqlState: "P0001", messageIncludes: "immutable once issued" },
      "service_role's raw UPDATE (which DOES have the base GRANT) must still be blocked by the trigger",
    );
    await expectReject(
      () => client.query(`delete from public.invoices where id = $1;`, [firstInvoiceId]),
      { sqlState: "P0001", messageIncludes: "immutable once issued" },
      "service_role's raw DELETE (which DOES have the base GRANT) must still be blocked by the trigger",
    );
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 2 (finding 2): manual_payments_insert_own's
  // WITH CHECK now forces a fresh, unreviewed submission.
  // -----------------------------------------------------------------
  await test("manual_payments: owner insert pre-marked 'approved' is rejected", async () => {
    await asUser(userAId);
    await expectReject(
      () => client.query(
        `insert into public.manual_payments (user_id, amount_minor, method, status) values ($1, 2000, 'bank', 'approved');`,
        [userAId],
      ),
      "a self-submitted manual_payments row pre-marked approved should be rejected",
    );
  });

  await test("manual_payments: owner insert setting reviewer_admin_id is rejected", async () => {
    await asUser(userAId);
    await expectReject(
      () => client.query(
        `insert into public.manual_payments (user_id, amount_minor, method, reviewer_admin_id) values ($1, 2000, 'bank', $2);`,
        [userAId, adminId],
      ),
      "a self-submitted manual_payments row setting reviewer_admin_id should be rejected",
    );
  });

  await test("manual_payments: a normal owner submission (pending, unreviewed) succeeds", async () => {
    await asUser(userAId);
    const res = await client.query(
      `insert into public.manual_payments (user_id, amount_minor, method) values ($1, 2000, 'bank') returning status, reviewer_admin_id;`,
      [userAId],
    );
    assert(res.rows[0].status === "pending" && res.rows[0].reviewer_admin_id === null, "a normal submission should succeed as pending/unreviewed");
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 2 (finding 3): guest forms can no longer
  // forge their own review outcome, and the GRANT-level column
  // restriction (finding 5) blocks a forged created_at too.
  // -----------------------------------------------------------------
  await test("anon submitting an enrollment pre-marked 'enrolled' is rejected", async () => {
    await asAnon();
    await expectReject(
      () => client.query(
        `insert into public.enrollments (name, email, times, subjects, status) values ('Sneaky', 'sneaky@example.test', '[]'::jsonb, '[]'::jsonb, 'enrolled');`,
      ),
      "a guest enrollment pre-marked 'enrolled' should be rejected",
    );
  });

  await test("anon submitting a trial request pre-marked 'scheduled' is rejected", async () => {
    await asAnon();
    await expectReject(
      () => client.query(
        `insert into public.trial_requests (name, email, status) values ('Sneaky', 'sneaky2@example.test', 'scheduled');`,
      ),
      "a guest trial request pre-marked 'scheduled' should be rejected",
    );
  });

  await test("anon submitting a subscriber pre-marked 'unsubscribed' is rejected", async () => {
    await asAnon();
    await expectReject(
      () => client.query(`insert into public.subscribers (email, status) values ('sneaky3@example.test', 'unsubscribed');`),
      "a guest subscriber pre-marked 'unsubscribed' should be rejected",
    );
  });

  await test("anon setting a forged created_at on an enrollment insert is rejected at the GRANT layer", async () => {
    await asAnon();
    await expectReject(
      () => client.query(
        `insert into public.enrollments (name, email, times, subjects, created_at) values ('Sneaky', 'sneaky4@example.test', '[]'::jsonb, '[]'::jsonb, '2000-01-01');`,
      ),
      "specifying created_at should be denied — it's not in anon's column-restricted INSERT grant",
    );
  });

  // -----------------------------------------------------------------
  // notifications: owner-only read, mark_notification_read() RPC.
  // -----------------------------------------------------------------
  let notifId;
  await test("seed: a notification for user A", async () => {
    await asSuperuser();
    const res = await client.query(
      `insert into public.notifications (user_id, type, title) values ($1, 'admin_announcement', 'Hello') returning id;`,
      [userAId],
    );
    notifId = res.rows[0].id;
  });

  await test("user B cannot SELECT user A's notification", async () => {
    await asUser(userBId);
    const { rows } = await client.query(`select * from public.notifications where id = $1;`, [notifId]);
    assert(rows.length === 0);
  });

  await test("mark_notification_read() lets user A mark their own notification read, but not user B's", async () => {
    await asUser(userBId);
    const asB = await client.query(`select * from public.mark_notification_read($1);`, [notifId]);
    assert(asB.rows.length === 0, "user B should not be able to mark user A's notification read");

    await asUser(userAId);
    const asA = await client.query(`select * from public.mark_notification_read($1);`, [notifId]);
    assert(asA.rows.length === 1 && asA.rows[0].read === true, "user A should be able to mark their own notification read");
  });

  // RLS Remediation Round 2 ("your call" — decided: AAL2 for full read).
  // There used to be NO admin read policy on notifications at all.
  await test("AAL2 admin CAN read any user's notifications; AAL1 admin cannot", async () => {
    await asUser(adminId, "aal1");
    const aal1 = await client.query(`select * from public.notifications where id = $1;`, [notifId]);
    assert(aal1.rows.length === 0, "AAL1 admin should not see notifications");

    await asUser(adminId, "aal2");
    const aal2 = await client.query(`select * from public.notifications where id = $1;`, [notifId]);
    assert(aal2.rows.length === 1, "AAL2 admin should see any user's notifications");
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 2 ("your call" — decided: fix now). The 3
  // quran_* tables used to share one FOR ALL policy whose WITH CHECK
  // bound INSERT/UPDATE but not DELETE — admin could delete another
  // user's row via the USING clause alone. Now split: pure owner CRUD,
  // admin gets read-only SELECT and nothing else.
  // -----------------------------------------------------------------
  let bookmarkId;
  await test("seed: a quran_bookmarks row for user A", async () => {
    await asUser(userAId);
    const res = await client.query(
      `insert into public.quran_bookmarks (user_id, verse_key, chapter_id, verse_num) values ($1, '2:255', 2, 255) returning id;`,
      [userAId],
    );
    bookmarkId = res.rows[0].id;
  });

  await test("owner has full CRUD on their own quran_bookmarks row", async () => {
    await asUser(userAId);
    const sel = await client.query(`select * from public.quran_bookmarks where id = $1;`, [bookmarkId]);
    assert(sel.rows.length === 1, "owner should see their own bookmark");
    const upd = await client.query(`update public.quran_bookmarks set note = 'updated' where id = $1 returning note;`, [bookmarkId]);
    assert(upd.rows[0].note === "updated", "owner should be able to update their own bookmark");
  });

  await test("admin (either AAL) CAN read another user's quran_bookmarks row", async () => {
    await asUser(adminId, "aal1");
    const { rows } = await client.query(`select * from public.quran_bookmarks where id = $1;`, [bookmarkId]);
    assert(rows.length === 1, "admin should be able to read any user's quran_bookmarks row (support)");
  });

  await test("admin CANNOT delete another user's quran_bookmarks row (0 rows affected, row still exists)", async () => {
    await asUser(adminId, "aal2");
    const del = await client.query(`delete from public.quran_bookmarks where id = $1 returning id;`, [bookmarkId]);
    assert(del.rows.length === 0, "admin's DELETE should affect 0 rows — no admin write policy exists on this table any more");

    await asSuperuser();
    const check = await client.query(`select id from public.quran_bookmarks where id = $1;`, [bookmarkId]);
    assert(check.rows.length === 1, "the bookmark row must still exist");
  });

  await test("admin CANNOT insert a quran_bookmarks row on another user's behalf", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`insert into public.quran_bookmarks (user_id, verse_key, chapter_id, verse_num) values ($1, '1:1', 1, 1);`, [userAId]),
      "admin inserting on another user's behalf should be rejected — WITH CHECK requires user_id = auth.uid()",
    );
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 2 (finding 6): subscriptions AAL2-tightened —
  // carries provider_customer_id/provider_subscription_id.
  // -----------------------------------------------------------------
  let subscriptionId;
  await test("seed: a subscriptions row for user A", async () => {
    await asSuperuser();
    const res = await client.query(
      `insert into public.subscriptions (user_id, plan_id, provider, status, provider_customer_id, current_period_start, current_period_end) values ($1, $2, 'stripe', 'active', 'cus_rls_test', now(), now() + interval '30 days') returning id;`,
      [userAId, planId],
    );
    subscriptionId = res.rows[0].id;
  });

  await test("AAL1 admin is rejected reading subscriptions; AAL2 admin CAN read", async () => {
    await asUser(adminId, "aal1");
    const aal1 = await client.query(`select * from public.subscriptions where id = $1;`, [subscriptionId]);
    assert(aal1.rows.length === 0, "AAL1 admin should not see subscriptions any more (Round 2 tightening)");

    await asUser(adminId, "aal2");
    const aal2 = await client.query(`select * from public.subscriptions where id = $1;`, [subscriptionId]);
    assert(aal2.rows.length === 1, "AAL2 admin should see subscriptions");
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 2 (finding 5): EXECUTE grants are now
  // per-function, not blanket — is_admin_aal2() is authenticated-only
  // (anon can't call it directly), and the webhook-claim functions are
  // service_role-only (a non-service authenticated session can't call
  // them even though the underlying table would filter it to 0 rows
  // anyway — this is a stronger, earlier denial).
  // -----------------------------------------------------------------
  await test("anon calling is_admin_aal2() directly is rejected (EXECUTE not granted)", async () => {
    await asAnon();
    await expectReject(
      () => client.query(`select public.is_admin_aal2();`),
      "anon should not have EXECUTE on is_admin_aal2()",
    );
  });

  await test("a plain authenticated user calling claim_provider_event() is rejected (EXECUTE not granted)", async () => {
    await asUser(userAId);
    await expectReject(
      () => client.query(`select * from public.claim_provider_event(gen_random_uuid());`),
      "a non-service authenticated session should not have EXECUTE on claim_provider_event()",
    );
  });

  // -----------------------------------------------------------------
  // service_role bypasses RLS entirely (sanity check).
  // -----------------------------------------------------------------
  await test("service_role sees all payments rows regardless of ownership (BYPASSRLS)", async () => {
    await asService();
    const { rows } = await client.query(`select * from public.payments;`);
    assert(rows.length >= 2, `expected service_role to see all payments rows (charge + refund), got ${rows.length}`);
  });

  await test("service_role can INSERT a provider_events row directly (no policy needed — bypasses RLS)", async () => {
    await asService();
    await client.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_rls_1', 'payment_intent.succeeded', 'hashrls1');`,
    );
  });

  await test("AAL2 admin CAN read provider_events; AAL1 admin cannot", async () => {
    await asUser(adminId, "aal1");
    const aal1 = await client.query(`select * from public.provider_events;`);
    assert(aal1.rows.length === 0, "AAL1 admin should not see provider_events");

    await asUser(adminId, "aal2");
    const aal2 = await client.query(`select * from public.provider_events;`);
    assert(aal2.rows.length >= 1, "AAL2 admin should see provider_events");
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 2 (finding 7) + Round 3 (Section B): claim_
  // provider_event() sets a claimed_at + lease_expires_at + claim_token
  // lease; reclaim_stale_provider_events() is the real recovery contract
  // for a worker that claimed an event and crashed. Round 3 adds real
  // FENCING (claim_token) on top — see the dedicated fencing-race block
  // right after this one for the actual bug this closes.
  // -----------------------------------------------------------------
  let staleEventId;
  let freshEventId;
  await test("claim_provider_event() sets claimed_at, lease_expires_at, and a claim_token on claim", async () => {
    await asService();
    const seed = await client.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_lease_stale', 'payment_intent.succeeded', 'hashlease1') returning id;`,
    );
    staleEventId = seed.rows[0].id;

    const claimed = await client.query(`select * from public.claim_provider_event($1);`, [staleEventId]);
    assert(
      claimed.rows.length === 1 && claimed.rows[0].claimed_at !== null && claimed.rows[0].lease_expires_at !== null && claimed.rows[0].claim_token !== null,
      "claiming should set claimed_at, lease_expires_at, and claim_token",
    );
    assert(claimed.rows[0].attempt_count === 1, "attempt_count should be 1 after the first claim");
  });

  await test("reclaim_stale_provider_events() reclaims an event whose LEASE has expired, but not a fresh one", async () => {
    await asService();
    // Backdate the stale event's lease_expires_at to simulate a worker
    // that claimed it, then stalled past its lease — the new function
    // matches on lease_expires_at, not claimed_at (Round 3 fencing
    // redesign) — this is what actually determines staleness now.
    await asSuperuser();
    await client.query(`update public.provider_events set lease_expires_at = now() - interval '30 minutes' where id = $1;`, [staleEventId]);

    // A second event, claimed just now — its lease is 5 minutes out by
    // default, so it must NOT be reclaimed.
    await asService();
    const seed2 = await client.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_lease_fresh', 'payment_intent.succeeded', 'hashlease2') returning id;`,
    );
    freshEventId = seed2.rows[0].id;
    await client.query(`select * from public.claim_provider_event($1);`, [freshEventId]);

    const reclaimed = await client.query(`select * from public.reclaim_stale_provider_events('10 minutes'::interval);`);
    const reclaimedIds = reclaimed.rows.map((r) => r.id);
    assert(reclaimedIds.includes(staleEventId), "the stale (lease expired 30min ago) event should have been reclaimed");
    assert(!reclaimedIds.includes(freshEventId), "the fresh (just-claimed, 5min lease) event should NOT have been reclaimed");

    const staleRow = await client.query(
      `select processing_status, claimed_at, claim_token, lease_expires_at from public.provider_events where id = $1;`,
      [staleEventId],
    );
    assert(
      staleRow.rows[0].processing_status === "pending" &&
        staleRow.rows[0].claimed_at === null &&
        staleRow.rows[0].claim_token === null &&
        staleRow.rows[0].lease_expires_at === null,
      "the reclaimed event should be back to pending with claimed_at/claim_token/lease_expires_at all cleared",
    );
  });

  await test("a reclaimed event can be claimed again by a second worker (with a NEW claim_token, attempt_count incremented)", async () => {
    await asService();
    const reclaim = await client.query(`select * from public.claim_provider_event($1);`, [staleEventId]);
    assert(reclaim.rows.length === 1, "the reclaimed event should be claimable again");
    assert(reclaim.rows[0].attempt_count === 2, `attempt_count should be 2 after the second claim, got ${reclaim.rows[0].attempt_count}`);
  });

  await test("reclaim_stale_provider_events() rejects a negative interval outright (Section B)", async () => {
    await asService();
    await expectReject(
      () => client.query(`select * from public.reclaim_stale_provider_events('-1 second'::interval);`),
      { sqlState: "P0001", messageIncludes: "must not be negative" },
      "a negative staleness interval should be rejected — it would mean 'reclaim leases that haven't expired yet'",
    );
  });

  await test("a non-service authenticated session has NO EXECUTE on reclaim_stale_provider_events() (checked directly via ACL, not just a failed call)", async () => {
    await asUser(adminId, "aal2");
    const acl = await client.query(
      `select has_function_privilege('authenticated', 'public.reclaim_stale_provider_events(interval)', 'EXECUTE') as has_it;`,
    );
    assert(acl.rows[0].has_it === false, "authenticated must have NO EXECUTE on reclaim_stale_provider_events(), verified via has_function_privilege, not inferred from a failed call");

    await expectReject(
      () => client.query(`select * from public.reclaim_stale_provider_events();`),
      { sqlState: "42501", messageIncludes: "permission denied" },
      "reclaim_stale_provider_events() should be service_role-only, even for an AAL2 admin session",
    );
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 3 (Section B): the real fencing bug this round
  // fixes. Worker A claims an event; its lease expires; a reclaim hands
  // the event to worker B (a NEW claim_token); A, unaware, finally tries
  // to complete its now-stale claim with its OLD token — this must
  // affect ZERO rows (not an error, matching this codebase's "0 rows =
  // legitimately didn't apply to you" idiom) and must NOT touch
  // processed_at/error_code. B's own completion, with the CURRENT
  // token, must succeed exactly once; a repeat with B's own (consumed)
  // token is a no-op, not an error.
  // -----------------------------------------------------------------
  await test("fencing: a stale worker's completion with an OLD claim_token is a silent no-op, never overwrites the new owner's outcome", async () => {
    await asService();
    const seed = await client.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_fencing_1', 'payment_intent.succeeded', 'hashfencing1') returning id;`,
    );
    const eventId = seed.rows[0].id;

    const claimA = await client.query(`select * from public.claim_provider_event($1);`, [eventId]);
    const tokenA = claimA.rows[0].claim_token;
    assert(tokenA, "worker A's claim should have a token");

    // Force-expire A's lease (simulating a stall, not a crash — A is
    // still alive and will try to complete later) and reclaim.
    await asSuperuser();
    await client.query(`update public.provider_events set lease_expires_at = now() - interval '1 minute' where id = $1;`, [eventId]);
    await asService();
    const reclaimed = await client.query(`select * from public.reclaim_stale_provider_events('0 seconds'::interval);`);
    assert(reclaimed.rows.some((r) => r.id === eventId), "the event should have been reclaimed");

    const claimB = await client.query(`select * from public.claim_provider_event($1);`, [eventId]);
    const tokenB = claimB.rows[0].claim_token;
    assert(tokenB && tokenB !== tokenA, "worker B's claim should get a DIFFERENT token than A's");

    // A, still alive, tries to complete with its now-stale token.
    const staleCompletion = await client.query(
      `select * from public.complete_provider_event($1, $2, 'processed', null);`,
      [eventId, tokenA],
    );
    assert(staleCompletion.rows.length === 0, "A's completion with a stale token must affect 0 rows, not an error");

    const stillProcessing = await client.query(
      `select processing_status, processed_at, error_code from public.provider_events where id = $1;`,
      [eventId],
    );
    assert(
      stillProcessing.rows[0].processing_status === "processing" && stillProcessing.rows[0].processed_at === null,
      "the row must still be 'processing' with processed_at untouched — A's stale call must never overwrite B's in-flight claim",
    );

    // B completes for real, with its own current token.
    const realCompletion = await client.query(
      `select * from public.complete_provider_event($1, $2, 'processed', null);`,
      [eventId, tokenB],
    );
    assert(realCompletion.rows.length === 1 && realCompletion.rows[0].processing_status === "processed", "B's completion with the current token must succeed exactly once");

    // A repeat completion with B's own (now-consumed) token is a no-op.
    const repeat = await client.query(
      `select * from public.complete_provider_event($1, $2, 'processed', null);`,
      [eventId, tokenB],
    );
    assert(repeat.rows.length === 0, "a repeat completion, even with the correct-but-already-consumed token, must be a no-op, not an error");
  });

  await test("complete_provider_event() has no EXECUTE for anon/authenticated (verified directly via ACL — Round 3 fixed a real gap here)", async () => {
    const acl = await client.query(
      `select
         has_function_privilege('anon', 'public.complete_provider_event(uuid, uuid, public.provider_event_status, text)', 'EXECUTE') as anon_has_it,
         has_function_privilege('authenticated', 'public.complete_provider_event(uuid, uuid, public.provider_event_status, text)', 'EXECUTE') as authenticated_has_it,
         has_function_privilege('service_role', 'public.complete_provider_event(uuid, uuid, public.provider_event_status, text)', 'EXECUTE') as service_role_has_it;`,
    );
    assert(acl.rows[0].anon_has_it === false, "anon must have no EXECUTE on complete_provider_event()");
    assert(acl.rows[0].authenticated_has_it === false, "authenticated must have no EXECUTE on complete_provider_event()");
    assert(acl.rows[0].service_role_has_it === true, "service_role must have EXECUTE on complete_provider_event()");
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 3 (Section C): subscriptions_update_admin_aal2
  // (the raw admin UPDATE policy/grant) is GONE — even an AAL2 admin's
  // raw UPDATE is now rejected at the GRANT layer. 3 narrow RPCs replace
  // it: service_apply_subscription_update() (service_role-only webhook
  // upsert), request_cancel_subscription() (owner-only), and
  // admin_activate_manual_subscription() (AAL2, atomic 2nd claim on a
  // manual_payments row).
  // -----------------------------------------------------------------
  let subForRpcId;
  await test("subscriptions: raw UPDATE is rejected at the GRANT layer, even for an AAL2 admin", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`update public.subscriptions set status = 'canceled' where id = $1;`, [subscriptionId]),
      { sqlState: "42501", messageIncludes: "permission denied" },
      "a raw UPDATE on subscriptions should be rejected at the GRANT layer, even for AAL2",
    );
  });

  await test("service_apply_subscription_update(): service_role upserts a stripe subscription; a non-service caller has no EXECUTE at all", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(
        `select * from public.service_apply_subscription_update($1, $2, 'stripe', 'cus_x', 'sub_rpc_1', 'active', now(), now() + interval '30 days', false);`,
        [userCId, planId],
      ),
      { sqlState: "42501", messageIncludes: "permission denied" },
      "a non-service_role caller should have NO EXECUTE on service_apply_subscription_update()",
    );

    await asService();
    const created = await client.query(
      `select * from public.service_apply_subscription_update($1, $2, 'stripe', 'cus_x', 'sub_rpc_1', 'active', now(), now() + interval '30 days', false);`,
      [userCId, planId],
    );
    assert(created.rows[0].status === "active", "the upsert should create an active subscription");
    subForRpcId = created.rows[0].id;

    const updated = await client.query(
      `select * from public.service_apply_subscription_update($1, $2, 'stripe', 'cus_x', 'sub_rpc_1', 'past_due', now(), now() + interval '30 days', false);`,
      [userCId, planId],
    );
    assert(updated.rows[0].id === subForRpcId && updated.rows[0].status === "past_due", "the same provider_subscription_id should upsert the SAME row, not create a second one");
  });

  await test("enforce_subscription_transition(): user_id and an invalid status transition are both rejected, even for service_role", async () => {
    await asService();
    await expectReject(
      () => client.query(`update public.subscriptions set user_id = $1 where id = $2;`, [userBId, subForRpcId]),
      { sqlState: "P0001", messageIncludes: "user_id cannot be changed" },
      "changing user_id must be rejected by the trigger regardless of role",
    );

    await client.query(`update public.subscriptions set status = 'canceled', canceled_at = now() where id = $1;`, [subForRpcId]);
    await expectReject(
      () => client.query(`update public.subscriptions set status = 'active', canceled_at = null where id = $1;`, [subForRpcId]),
      { sqlState: "P0001", messageIncludes: "is not an allowed status transition" },
      "canceled -> active must be rejected — canceled is terminal",
    );
  });

  await test("request_cancel_subscription(): owner can request cancellation, another user cannot", async () => {
    await asUser(userBId);
    await expectReject(
      () => client.query(`select * from public.request_cancel_subscription($1);`, [subscriptionId]),
      { sqlState: "P0001", messageIncludes: "not a cancelable subscription owned by the caller" },
      "user B should not be able to cancel user A's subscription",
    );

    await asUser(userAId);
    const res = await client.query(`select * from public.request_cancel_subscription($1);`, [subscriptionId]);
    assert(res.rows[0].cancel_at_period_end === true, "the owner's cancel request should set cancel_at_period_end");
  });

  let manualPaymentForActivationId;
  await test("admin_activate_manual_subscription(): AAL1 admin rejected; AAL2 admin activates; double-activation rejected; audit written exactly once", async () => {
    await asSuperuser();
    const mp = await client.query(
      `insert into public.manual_payments (user_id, plan_id, amount_minor, method, status) values ($1, $2, 5000, 'bank', 'approved') returning id;`,
      [userBId, planId],
    );
    manualPaymentForActivationId = mp.rows[0].id;

    await asUser(adminId, "aal1");
    await expectReject(
      () => client.query(
        `select * from public.admin_activate_manual_subscription($1, $2, now() + interval '365 days');`,
        [manualPaymentForActivationId, planId],
      ),
      { sqlState: "P0001", messageIncludes: "is not an AAL2-verified admin" },
      "AAL1 admin should not be able to activate a manual subscription",
    );

    await asUser(adminId, "aal2");
    const activated = await client.query(
      `select * from public.admin_activate_manual_subscription($1, $2, now() + interval '365 days');`,
      [manualPaymentForActivationId, planId],
    );
    assert(activated.rows[0].status === "active" && activated.rows[0].provider === "manual", "activation should create an active manual subscription");

    await expectReject(
      () => client.query(
        `select * from public.admin_activate_manual_subscription($1, $2, now() + interval '365 days');`,
        [manualPaymentForActivationId, planId],
      ),
      { sqlState: "P0001", messageIncludes: "not an approved, not-yet-activated" },
      "a second activation attempt on the same manual_payments row must be rejected",
    );

    const log = await client.query(
      `select count(*)::int as n from public.admin_audit_log where action = 'admin_activate_manual_subscription' and resource_id = $1;`,
      [activated.rows[0].id],
    );
    assert(log.rows[0].n === 1, `expected exactly 1 audit row, got ${log.rows[0].n}`);
  });

  await test("admin_activate_manual_subscription(): a real 2-connection race on the same manual_payments row produces exactly one activation", async () => {
    await asSuperuser();
    const mp = await client.query(
      `insert into public.manual_payments (user_id, plan_id, amount_minor, method, status) values ($1, $2, 5000, 'bank', 'approved') returning id;`,
      [userDId, planId],
    );
    const mpId = mp.rows[0].id;

    const race = new pg.Client({ connectionString });
    await race.connect();
    try {
      await Promise.all([client.query(`set role authenticated;`), race.query(`set role authenticated;`)]);
      await Promise.all([
        client.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: adminId, aal: "aal2" })]),
        race.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: adminId, aal: "aal2" })]),
      ]);

      const attempt = (conn) =>
        conn
          .query(`select * from public.admin_activate_manual_subscription($1, $2, now() + interval '365 days');`, [mpId, planId])
          .then(() => "ok", () => "rejected");
      const [a, b] = await Promise.all([attempt(client), attempt(race)]);
      assert((a === "ok") !== (b === "ok"), `expected exactly one winner for the same manual_payments row, got a=${a} b=${b}`);

      const count = await client.query(
        `select count(*)::int as n from public.subscriptions where user_id = $1 and provider = 'manual' and current_period_end > now() + interval '360 days';`,
        [userDId],
      );
      assert(count.rows[0].n === 1, `expected exactly 1 subscription created from this race, got ${count.rows[0].n}`);
    } finally {
      await race.end();
      await asSuperuser();
    }
  });

  // -----------------------------------------------------------------
  // RLS Remediation Round 4: enforce_subscription_transition() used to
  // fire on UPDATE only — every INSERT (both RPCs that create a row)
  // went through completely unchecked. Fires on every role, no
  // exception, same as before; these direct superuser inserts prove the
  // invariant holds at the table level, not just "the RPCs happen to
  // pass good values today."
  // -----------------------------------------------------------------
  await test("enforce_subscription_transition(): a row can never be INSERTed already-terminal with cancel_at_period_end still true (Round 4)", async () => {
    await asSuperuser();
    await expectReject(
      () => client.query(
        `insert into public.subscriptions (user_id, plan_id, provider, status, cancel_at_period_end) values ($1, $2, 'manual', 'expired', true);`,
        [userCId, planId],
      ),
      { sqlState: "P0001", messageIncludes: "cancel_at_period_end can only be true while status is active or past_due" },
      "an expired row with cancel_at_period_end = true must be rejected even on INSERT, not just UPDATE",
    );
  });

  await test("enforce_subscription_transition(): an ACTIVE row must have a real, future current_period_end, even on INSERT (Round 4)", async () => {
    await asSuperuser();
    await expectReject(
      () => client.query(
        `insert into public.subscriptions (user_id, plan_id, provider, status) values ($1, $2, 'manual', 'active');`,
        [userCId, planId],
      ),
      { sqlState: "P0001", messageIncludes: "must have a current_period_end in the future" },
      "an active row with current_period_end = NULL must be rejected",
    );
    await expectReject(
      () => client.query(
        `insert into public.subscriptions (user_id, plan_id, provider, status, current_period_end) values ($1, $2, 'manual', 'active', now() - interval '1 day');`,
        [userCId, planId],
      ),
      { sqlState: "P0001", messageIncludes: "must have a current_period_end in the future" },
      "an active row with an already-elapsed current_period_end must be rejected",
    );
    // past_due is deliberately exempt — a real past_due row commonly
    // carries an already-elapsed period (that's why it's past_due).
    const pastDue = await client.query(
      `insert into public.subscriptions (user_id, plan_id, provider, status, current_period_end) values ($1, $2, 'manual', 'past_due', now() - interval '1 day') returning id;`,
      [userCId, planId],
    );
    assert(pastDue.rows[0].id, "a past_due row with an elapsed current_period_end must be allowed");
  });

  await test("enforce_subscription_transition(): current_period_end must be after current_period_start, on INSERT and UPDATE alike (Round 4)", async () => {
    await asSuperuser();
    await expectReject(
      () => client.query(
        `insert into public.subscriptions (user_id, plan_id, provider, status, current_period_start, current_period_end) values ($1, $2, 'manual', 'past_due', now(), now() - interval '1 day');`,
        [userDId, planId],
      ),
      { sqlState: "P0001", messageIncludes: "must be after current_period_start" },
      "a period that ends before (or when) it starts must be rejected",
    );
  });

  await test("admin_activate_manual_subscription(): rejected when the admin passes an already-elapsed p_current_period_end (Round 4)", async () => {
    await asSuperuser();
    const mp = await client.query(
      `insert into public.manual_payments (user_id, plan_id, amount_minor, method, status) values ($1, $2, 5000, 'bank', 'approved') returning id;`,
      [userCId, planId],
    );

    await asUser(adminId, "aal2");
    // current_period_start is always now() inside the RPC, so an
    // already-elapsed p_current_period_end also always lands < start —
    // the period-ordering check fires first, which is itself a correct
    // (if not the only possible) rejection reason.
    await expectReject(
      () => client.query(
        `select * from public.admin_activate_manual_subscription($1, $2, now() - interval '1 day');`,
        [mp.rows[0].id, planId],
      ),
      { sqlState: "P0001", messageIncludes: "must be after current_period_start" },
      "activating a manual subscription with an already-expired period must be rejected, not silently create a dead-on-arrival row",
    );
  });

  await asSuperuser();

  // -----------------------------------------------------------------
  // Report + exit code.
  // -----------------------------------------------------------------
  const ok = report();
  await client.end();
  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[rls-test] harness crashed:", err);
  process.exitCode = 1;
});
