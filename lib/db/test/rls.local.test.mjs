// Real role-switching RLS tests against the LOCAL Docker Postgres this
// baseline was migrated into (0002_rls.sql) — every check here is an
// actual query result under an actual non-owner Postgres role (`anon`/
// `authenticated`/`service_role`), not a read of the policy SQL. Same
// localhost-only guard as the other test scripts.
//
// A single dedicated `pg.Client` (not a Pool) is used throughout, since
// `SET ROLE` / `SET request.jwt.claims` are session state — they must
// stick across statements on the SAME connection. `asAnon()`/`asUser()`/
// `asAdmin()`/`asService()`/`asSuperuser()` each reset to a clean session
// state before applying their role, so tests never leak state into each
// other.
//
// IMPORTANT: Postgres does not enforce RLS for a table's owner or a
// superuser, by design — our migrations were applied as `postgres`
// (superuser), so simply connecting as `postgres` would never exercise
// any policy at all. Every RLS assertion below runs under `SET ROLE` to
// `anon`/`authenticated`/`service_role` specifically because those are
// NOT the table owner and NOT superuser, so RLS actually applies.
import pg from "pg";
import crypto from "node:crypto";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
const host = new URL(connectionString).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error(`Refusing to run: TEST_DATABASE_URL host "${host}" is not localhost/127.0.0.1.`);
}

const client = new pg.Client({ connectionString });

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

async function expectReject(queryFn, msgIfNotRejected) {
  try {
    await queryFn();
  } catch (err) {
    return err;
  }
  throw new Error(msgIfNotRejected ?? "expected query to be rejected, but it succeeded");
}

// `SET var = ...` is a utility statement, not ordinary SQL — it doesn't
// accept a `$1` query parameter. `set_config()` is the parameterizable
// equivalent (`is_local = false` means session-scoped, not just for the
// current transaction), which is what actually lets these helpers pass
// a real userId/aal value safely instead of string-concatenating SQL.

/** Resets to the superuser session state (used for seeding fixtures). */
async function asSuperuser() {
  await client.query(`reset role;`);
  await client.query(`select set_config('request.jwt.claims', '', false);`);
}

async function asAnon() {
  await client.query(`reset role;`);
  await client.query(`select set_config('request.jwt.claims', '', false);`);
  await client.query(`set role anon;`);
}

async function asUser(userId, aal = "aal1") {
  await client.query(`reset role;`);
  await client.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: userId, aal })]);
  await client.query(`set role authenticated;`);
}

async function asService() {
  await client.query(`reset role;`);
  await client.query(`select set_config('request.jwt.claims', '', false);`);
  await client.query(`set role service_role;`);
}

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

  await test("anon cannot SELECT from enrollments (RLS filters to 0 rows)", async () => {
    await asAnon();
    const { rows } = await client.query(`select * from public.enrollments;`);
    assert(rows.length === 0, `expected 0 rows visible to anon, got ${rows.length}`);
  });

  await test("anon cannot SELECT from payments (RLS filters to 0 rows)", async () => {
    await asAnon();
    const { rows } = await client.query(`select * from public.payments;`);
    assert(rows.length === 0, `expected 0 rows visible to anon, got ${rows.length}`);
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

  await test("user A's raw UPDATE on profiles.role is silently filtered (0 rows) — no policy permits it", async () => {
    await asUser(userAId);
    const res = await client.query(`update public.profiles set role = 'admin' where id = $1 returning *;`, [userAId]);
    assert(res.rows.length === 0, `expected the raw UPDATE to affect 0 rows (RLS has no matching policy for a non-admin), got ${res.rows.length}`);

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

  await asSuperuser();

  // -----------------------------------------------------------------
  // Report + exit code.
  // -----------------------------------------------------------------
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  await client.end();
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[rls-test] harness crashed:", err);
  process.exitCode = 1;
});
