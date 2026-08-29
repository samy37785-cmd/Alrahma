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
  let planId;
  let chargeId;

  // -----------------------------------------------------------------
  // Seed fixtures as superuser (bypasses RLS entirely, as intended for
  // fixture setup — not what's under test here).
  // -----------------------------------------------------------------
  await test("seed: fixtures (auth.users, profiles via trigger, admin promotion, plan, a succeeded charge)", async () => {
    await asSuperuser();
    for (const [id, name] of [[userAId, "User A"], [userBId, "User B"], [adminId, "Admin"]]) {
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

  await test("admin_issue_refund() issues a refund and writes an admin_audit_log row atomically", async () => {
    await asUser(adminId, "aal2");
    const res = await client.query(`select * from public.admin_issue_refund($1, 1000);`, [chargeId]);
    assert(res.rows[0].kind === "refund" && Number(res.rows[0].amount_minor) === 1000);

    const log = await client.query(
      `select * from public.admin_audit_log where action = 'admin_issue_refund' and resource_id = $1;`,
      [res.rows[0].id],
    );
    assert(log.rows.length === 1, "admin_issue_refund should have written exactly one admin_audit_log row");
  });

  await test("admin_issue_refund() is still governed by validate_refund_insert() — an oversized refund is rejected", async () => {
    await asUser(adminId, "aal2");
    // 1000 already refunded above, 5000 charge — 4500 more would push
    // the total to 5500, over the limit.
    await expectReject(
      () => client.query(`select * from public.admin_issue_refund($1, 4500);`, [chargeId]),
      "an over-limit refund via the RPC should still be rejected by the trigger",
    );
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
  // invoices: no RPC wraps issuance (a receipt snapshot, not a ledger
  // mutation), so validate_invoice_insert() (0001) is the real guard
  // behind the raw admin INSERT policy.
  // -----------------------------------------------------------------
  await test("invoices: raw INSERT for a payment that never succeeded is rejected (validate_invoice_insert trigger)", async () => {
    await asSuperuser();
    const pendingCharge = await client.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 5000, 'stripe') returning id;`,
      [userAId, planId],
    );
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(
        `insert into public.invoices (user_id, payment_id, amount_minor_snapshot) values ($1, $2, 5000);`,
        [userAId, pendingCharge.rows[0].id],
      ),
      "an invoice referencing a non-succeeded payment should be rejected",
    );
  });

  await test("invoices: raw INSERT with a mismatched user_id is rejected", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(
        `insert into public.invoices (user_id, payment_id, amount_minor_snapshot) values ($1, $2, 5000);`,
        [userBId, chargeId],
      ),
      "an invoice whose user_id disagrees with its linked payment should be rejected",
    );
  });

  await test("invoices: raw INSERT tied to a real succeeded payment succeeds", async () => {
    await asUser(adminId, "aal2");
    const res = await client.query(
      `insert into public.invoices (user_id, payment_id, amount_minor_snapshot) values ($1, $2, 5000) returning id;`,
      [userAId, chargeId],
    );
    assert(res.rows.length === 1, "a valid invoice tied to a real succeeded charge should succeed");
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
      `insert into public.subscriptions (user_id, plan_id, provider, status, provider_customer_id) values ($1, $2, 'stripe', 'active', 'cus_rls_test') returning id;`,
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
  // RLS Remediation Round 2 (finding 7): claim_provider_event() now sets
  // a claimed_at lease; reclaim_stale_provider_events() is the real
  // recovery contract for a worker that claimed an event and crashed.
  // -----------------------------------------------------------------
  let staleEventId;
  let freshEventId;
  await test("claim_provider_event() sets claimed_at on claim", async () => {
    await asService();
    const seed = await client.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_lease_stale', 'payment_intent.succeeded', 'hashlease1') returning id;`,
    );
    staleEventId = seed.rows[0].id;

    const claimed = await client.query(`select * from public.claim_provider_event($1);`, [staleEventId]);
    assert(claimed.rows.length === 1 && claimed.rows[0].claimed_at !== null, "claiming should set claimed_at");
  });

  await test("reclaim_stale_provider_events() reclaims a stale 'processing' event, but not a fresh one", async () => {
    await asService();
    // Backdate the stale event's claimed_at to simulate a worker that
    // claimed it 30 minutes ago and then crashed.
    await asSuperuser();
    await client.query(`update public.provider_events set claimed_at = now() - interval '30 minutes' where id = $1;`, [staleEventId]);

    // A second event, claimed just now — must NOT be reclaimed.
    await asService();
    const seed2 = await client.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_lease_fresh', 'payment_intent.succeeded', 'hashlease2') returning id;`,
    );
    freshEventId = seed2.rows[0].id;
    await client.query(`select * from public.claim_provider_event($1);`, [freshEventId]);

    const reclaimed = await client.query(`select * from public.reclaim_stale_provider_events('10 minutes'::interval);`);
    const reclaimedIds = reclaimed.rows.map((r) => r.id);
    assert(reclaimedIds.includes(staleEventId), "the stale (30min-old) event should have been reclaimed");
    assert(!reclaimedIds.includes(freshEventId), "the fresh (just-claimed) event should NOT have been reclaimed");

    const staleRow = await client.query(`select processing_status, claimed_at from public.provider_events where id = $1;`, [staleEventId]);
    assert(staleRow.rows[0].processing_status === "pending" && staleRow.rows[0].claimed_at === null, "the reclaimed event should be back to pending with claimed_at cleared");
  });

  await test("a reclaimed event can be claimed again by a second worker", async () => {
    await asService();
    const reclaim = await client.query(`select * from public.claim_provider_event($1);`, [staleEventId]);
    assert(reclaim.rows.length === 1, "the reclaimed event should be claimable again");
  });

  await test("a non-service authenticated session cannot call reclaim_stale_provider_events() (EXECUTE not granted)", async () => {
    await asUser(adminId, "aal2");
    await expectReject(
      () => client.query(`select * from public.reclaim_stale_provider_events();`),
      "reclaim_stale_provider_events() should be service_role-only, even for an AAL2 admin session",
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
