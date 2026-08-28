// Real-SQL assertions against the LOCAL Docker Postgres this baseline was
// migrated into (see run-migrations.mjs) — every check here is an actual
// query result, not a read of the schema files. Same localhost-only guard
// as run-migrations.mjs: refuses to run against anything but
// localhost/127.0.0.1.
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

/** Expects the query to reject; returns the error. */
async function expectReject(queryFn, msgIfNotRejected) {
  try {
    await queryFn();
  } catch (err) {
    return err;
  }
  throw new Error(msgIfNotRejected ?? "expected query to be rejected, but it succeeded");
}

async function main() {
  // -------------------------------------------------------------------
  // Table count: exactly 20 in `public`, plus the 1 auth.users stub —
  // auth.users is excluded from the 20-table count per the locked doc.
  // -------------------------------------------------------------------
  await test("public schema has exactly 20 tables (auth.users excluded)", async () => {
    const { rows } = await pool.query(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name;
    `);
    assert(
      rows.length === 20,
      `expected 20 public tables, got ${rows.length}: ${rows.map((r) => r.table_name).join(", ")}`,
    );
  });

  await test("auth.users exists as the single non-public, non-drizzle-internal table", async () => {
    // `drizzle`.`__drizzle_migrations` is drizzle-orm's own migration-
    // tracking table (created by migrate() itself, not by our migrations)
    // — expected here, excluded from this check.
    const { rows } = await pool.query(`
      select table_schema, table_name from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema not in ('public', 'information_schema', 'drizzle')
        and table_schema not like 'pg_%';
    `);
    assert(rows.length === 1 && rows[0].table_schema === "auth" && rows[0].table_name === "users",
      `expected only auth.users outside public/drizzle, got: ${JSON.stringify(rows)}`);
  });

  await test("none of the 20 dropped tables exist", async () => {
    const dropped = [
      "courses", "course_lessons", "enrollments_old", "reviews", "assignments",
      "submissions", "attendance", "class_sessions", "messages", "conversations",
      "gamification", "badges", "streaks", "hifz_progress", "parent_children",
      "admin_lockouts", "teacher_availability", "tutor_conversations",
      "contact_messages", "wishlists",
    ];
    const { rows } = await pool.query(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[]);
    `, [dropped]);
    assert(rows.length === 0, `found tables that should be dropped: ${rows.map((r) => r.table_name).join(", ")}`);
  });

  // -------------------------------------------------------------------
  // Constraint / index presence spot-checks (not exhaustive — the ones
  // that carry real business rules).
  // -------------------------------------------------------------------
  await test("subscriptions_one_active_per_user partial unique index exists", async () => {
    const { rows } = await pool.query(`
      select indexdef from pg_indexes
      where tablename = 'subscriptions' and indexname = 'subscriptions_one_active_per_user';
    `);
    assert(rows.length === 1, "index not found");
    assert(/WHERE/i.test(rows[0].indexdef), "index is not partial (no WHERE clause)");
  });

  await test("notifications_user_dedupe_unique partial unique index exists", async () => {
    const { rows } = await pool.query(`
      select indexdef from pg_indexes
      where tablename = 'notifications' and indexname = 'notifications_user_dedupe_unique';
    `);
    assert(rows.length === 1, "index not found");
  });

  await test("provider_events_provider_event_unique unique index exists", async () => {
    const { rows } = await pool.query(`
      select indexdef from pg_indexes
      where tablename = 'provider_events' and indexname = 'provider_events_provider_event_unique';
    `);
    assert(rows.length === 1, "index not found");
  });

  await test("all 6 hand-authored functions exist", async () => {
    const expected = [
      "handle_new_user", "enforce_payment_status_transition", "forbid_payment_delete",
      "forbid_refund_of_refund", "forbid_audit_log_mutation", "claim_provider_event",
      "set_updated_at",
    ];
    const { rows } = await pool.query(`
      select routine_name from information_schema.routines
      where routine_schema = 'public' and routine_name = any($1::text[]);
    `, [expected]);
    const found = rows.map((r) => r.routine_name);
    for (const fn of expected) {
      assert(found.includes(fn), `missing function public.${fn}`);
    }
  });

  // -------------------------------------------------------------------
  // Seed fixtures shared by the scenarios below.
  // -------------------------------------------------------------------
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  let planId;

  await test("seed: create auth.users fixtures (profiles come from the handle_new_user trigger)", async () => {
    await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb);`,
      [userAId, `${userAId}@example.test`, JSON.stringify({ name: "User A" })]);
    await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb);`,
      [userBId, `${userBId}@example.test`, JSON.stringify({ name: "User B" })]);
    await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb);`,
      [adminId, `${adminId}@example.test`, JSON.stringify({ name: "Admin" })]);
    // Promoting to admin is a deliberate, audited, OUT-OF-BAND DB action
    // (docs/product-scope-audit.md §11) — never via the trigger, which
    // always inserts role='user' regardless of metadata. This UPDATE is
    // that out-of-band step, done here only to seed a fixture.
    await pool.query(`update public.profiles set role = 'admin' where id = $1;`, [adminId]);
  });

  await test("seed: create a plan fixture", async () => {
    const { rows } = await pool.query(
      `insert into public.plans (slug, name, amount_minor, currency) values ('basic-monthly', 'Basic Monthly', 5000, 'USD') returning id;`,
    );
    planId = rows[0].id;
  });

  // -------------------------------------------------------------------
  // handle_new_user(): a real signup via auth.users INSERT, including a
  // spoofed admin role claim in metadata, must always land as role='user'.
  // -------------------------------------------------------------------
  await test("handle_new_user() never produces role='admin' even when metadata claims it", async () => {
    const id = crypto.randomUUID();
    await pool.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb);`,
      [id, `${id}@example.test`, JSON.stringify({ role: "admin", name: "Spoofer" })],
    );
    const { rows } = await pool.query(`select role, name from public.profiles where id = $1;`, [id]);
    assert(rows.length === 1, "handle_new_user did not insert a profiles row");
    assert(rows[0].role === "user", `expected role='user', got '${rows[0].role}'`);
    assert(rows[0].name === "Spoofer", "name from metadata should still be honored (only role is ignored)");
  });

  await test("handle_new_user() falls back to email-local-part when no name is given", async () => {
    const id = crypto.randomUUID();
    await pool.query(`insert into auth.users (id, email) values ($1, 'plainuser@example.test');`, [id]);
    const { rows } = await pool.query(`select name from public.profiles where id = $1;`, [id]);
    assert(rows[0].name === "plainuser", `expected 'plainuser', got '${rows[0].name}'`);
  });

  // -------------------------------------------------------------------
  // Guest-vs-paid account policy.
  // -------------------------------------------------------------------
  await test("guest enrollment insert succeeds with no user_id column at all", async () => {
    await pool.query(
      `insert into public.enrollments (name, email, times, subjects) values ('Guest', 'guest@example.test', '[]'::jsonb, '[]'::jsonb);`,
    );
  });

  await test("guest trial_requests insert succeeds with no user_id column at all", async () => {
    await pool.query(`insert into public.trial_requests (name, email) values ('Guest', 'guest2@example.test');`);
  });

  await test("payments insert without user_id is rejected (paid checkout requires login)", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (plan_id, amount_minor, gateway) values ($1, 5000, 'stripe');`,
        [planId],
      ),
      "payments insert with no user_id should have been rejected",
    );
  });

  // -------------------------------------------------------------------
  // Invalid-value rejections.
  // -------------------------------------------------------------------
  await test("invalid role enum value is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.profiles (id, email, role) values (gen_random_uuid(), 'x@example.test', 'superadmin');`,
      ),
      "invalid role enum value should have been rejected",
    );
  });

  await test("invalid payment_status enum value is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, amount_minor, gateway, status) values ($1, $2, 5000, 'stripe', 'refunded');`,
        [userAId, planId],
      ),
      "invalid payment_status enum value should have been rejected",
    );
  });

  await test("negative amount_minor is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, -100, 'stripe');`,
        [userAId, planId],
      ),
      "negative amount_minor should have been rejected",
    );
  });

  await test("invalid currency_code enum value is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.plans (slug, name, amount_minor, currency) values ('eur-plan', 'EUR Plan', 1000, 'EUR');`,
      ),
      "invalid currency_code enum value should have been rejected",
    );
  });

  await test("a refund with parent_payment_id NULL is rejected (kind/parent CHECK)", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, amount_minor, gateway, kind) values ($1, $2, 5000, 'stripe', 'refund');`,
        [userAId, planId],
      ),
      "refund with no parent_payment_id should have been rejected",
    );
  });

  // -------------------------------------------------------------------
  // Idempotency / dedup guards.
  // -------------------------------------------------------------------
  await test("duplicate provider_events (provider, provider_event_id) is a caught unique violation", async () => {
    await pool.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_dup_1', 'payment_intent.succeeded', 'hash1');`,
    );
    const err = await expectReject(
      () => pool.query(
        `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_dup_1', 'payment_intent.succeeded', 'hash1');`,
      ),
      "duplicate provider_events insert should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
  });

  await test("duplicate (user_id, dedupe_key) notification is rejected by the partial unique index", async () => {
    await pool.query(
      `insert into public.notifications (user_id, type, title, dedupe_key) values ($1, 'daily_reminder', 'Reminder', 'daily-2026-08-28');`,
      [userAId],
    );
    const err = await expectReject(
      () => pool.query(
        `insert into public.notifications (user_id, type, title, dedupe_key) values ($1, 'daily_reminder', 'Reminder (dup)', 'daily-2026-08-28');`,
        [userAId],
      ),
      "duplicate (user_id, dedupe_key) notification should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
  });

  await test("a second notification with dedupe_key NULL for the same user is allowed (partial index)", async () => {
    await pool.query(`insert into public.notifications (user_id, type, title) values ($1, 'admin_announcement', 'Hi');`, [userAId]);
    await pool.query(`insert into public.notifications (user_id, type, title) values ($1, 'admin_announcement', 'Hi again');`, [userAId]);
  });

  await test("duplicate coupon redemption for the same (coupon, user) is rejected by the composite PK", async () => {
    const { rows } = await pool.query(
      `insert into public.coupons (code, type, value, discount_scope) values ('WELCOME10', 'percent', 10, 'first_payment_only') returning id;`,
    );
    const couponId = rows[0].id;
    await pool.query(`insert into public.coupon_redemptions (coupon_id, user_id) values ($1, $2);`, [couponId, userAId]);
    const err = await expectReject(
      () => pool.query(`insert into public.coupon_redemptions (coupon_id, user_id) values ($1, $2);`, [couponId, userAId]),
      "duplicate coupon redemption should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
  });

  // -------------------------------------------------------------------
  // Subscriptions: one active per user.
  // -------------------------------------------------------------------
  await test("a second ACTIVE subscription for the same user is rejected", async () => {
    await pool.query(
      `insert into public.subscriptions (user_id, plan_id, provider, status) values ($1, $2, 'stripe', 'active');`,
      [userBId, planId],
    );
    const err = await expectReject(
      () => pool.query(
        `insert into public.subscriptions (user_id, plan_id, provider, status) values ($1, $2, 'paypal', 'active');`,
        [userBId, planId],
      ),
      "a second active subscription for the same user should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
  });

  await test("a second CANCELED subscription for the same user is allowed (partial index only guards 'active')", async () => {
    await pool.query(
      `insert into public.subscriptions (user_id, plan_id, provider, status) values ($1, $2, 'manual', 'canceled');`,
      [userBId, planId],
    );
  });

  // -------------------------------------------------------------------
  // Payments ledger: status transitions, delete-block, refund chain.
  // -------------------------------------------------------------------
  let chargeId;
  await test("a charge can go pending -> succeeded", async () => {
    const { rows } = await pool.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway, gateway_payment_id) values ($1, $2, 5000, 'stripe', 'pi_test_1') returning id;`,
      [userAId, planId],
    );
    chargeId = rows[0].id;
    await pool.query(`update public.payments set status = 'succeeded' where id = $1;`, [chargeId]);
    const { rows: after } = await pool.query(`select status from public.payments where id = $1;`, [chargeId]);
    assert(after[0].status === "succeeded");
  });

  await test("a frozen (succeeded) payments row cannot be updated at all", async () => {
    await expectReject(
      () => pool.query(`update public.payments set gateway_payment_id = 'pi_changed' where id = $1;`, [chargeId]),
      "updating a frozen succeeded payments row should have been rejected",
    );
  });

  await test("a payments row cannot be deleted (forbid_payment_delete trigger)", async () => {
    await expectReject(
      () => pool.query(`delete from public.payments where id = $1;`, [chargeId]),
      "deleting a payments row should have been rejected",
    );
  });

  let refund1Id;
  await test("a partial refund of the charge succeeds (new row, kind='refund')", async () => {
    const { rows } = await pool.query(
      `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
       values ($1, $2, 'refund', $3, 2000, 'stripe', 'succeeded') returning id;`,
      [userAId, planId, chargeId],
    );
    refund1Id = rows[0].id;
  });

  await test("a second partial refund of the same charge succeeds (multi-refund reconciles)", async () => {
    await pool.query(
      `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
       values ($1, $2, 'refund', $3, 1500, 'stripe', 'succeeded');`,
      [userAId, planId, chargeId],
    );
    const { rows } = await pool.query(
      `select amount_minor from public.payments where parent_payment_id = $1 and kind = 'refund';`,
      [chargeId],
    );
    const totalRefunded = rows.reduce((sum, r) => sum + Number(r.amount_minor), 0);
    assert(totalRefunded === 3500, `expected total refunded 3500, got ${totalRefunded}`);
    assert(totalRefunded < 5000, "sanity: total refunded should not exceed the original charge");
  });

  await test("a refund of a refund is rejected (forbid_refund_of_refund trigger)", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
         values ($1, $2, 'refund', $3, 500, 'stripe', 'succeeded');`,
        [userAId, planId, refund1Id],
      ),
      "a refund whose parent is itself a refund should have been rejected",
    );
  });

  // -------------------------------------------------------------------
  // claim_provider_event(): atomic claim, double-claim is a no-op.
  // -------------------------------------------------------------------
  await test("claim_provider_event() claims a pending event exactly once", async () => {
    const { rows } = await pool.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('paypal', 'evt_claim_1', 'PAYMENT.CAPTURE.COMPLETED', 'hashclaim1') returning id;`,
    );
    const eventId = rows[0].id;

    const first = await pool.query(`select * from public.claim_provider_event($1, 'processed', null);`, [eventId]);
    assert(first.rows.length === 1, "first claim should return exactly 1 row");
    assert(first.rows[0].processing_status === "processed");

    const second = await pool.query(`select * from public.claim_provider_event($1, 'processed', null);`, [eventId]);
    assert(second.rows.length === 0, "second claim on an already-processed event should return 0 rows (idempotent no-op)");
  });

  // -------------------------------------------------------------------
  // admin_audit_log immutability.
  // -------------------------------------------------------------------
  let auditLogId;
  await test("admin_audit_log insert succeeds", async () => {
    const { rows } = await pool.query(
      `insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id) values ($1, 'approve_manual_payment', 'manual_payments', 'some-id') returning id;`,
      [adminId],
    );
    auditLogId = rows[0].id;
  });

  await test("admin_audit_log UPDATE is rejected (forbid_audit_log_mutation trigger)", async () => {
    await expectReject(
      () => pool.query(`update public.admin_audit_log set action = 'changed' where id = $1;`, [auditLogId]),
      "updating an admin_audit_log row should have been rejected",
    );
  });

  await test("admin_audit_log DELETE is rejected (forbid_audit_log_mutation trigger)", async () => {
    await expectReject(
      () => pool.query(`delete from public.admin_audit_log where id = $1;`, [auditLogId]),
      "deleting an admin_audit_log row should have been rejected",
    );
  });

  // -------------------------------------------------------------------
  // set_updated_at() sanity check on one table.
  // -------------------------------------------------------------------
  await test("set_updated_at() bumps updated_at on a plans UPDATE", async () => {
    const before = await pool.query(`select updated_at from public.plans where id = $1;`, [planId]);
    await new Promise((r) => setTimeout(r, 5));
    await pool.query(`update public.plans set name = 'Basic Monthly (renamed)' where id = $1;`, [planId]);
    const after = await pool.query(`select updated_at from public.plans where id = $1;`, [planId]);
    assert(
      new Date(after.rows[0].updated_at).getTime() > new Date(before.rows[0].updated_at).getTime(),
      "updated_at did not advance",
    );
  });

  // -------------------------------------------------------------------
  // Report + exit code.
  // -------------------------------------------------------------------
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  await pool.end();
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[test] harness crashed:", err);
  process.exitCode = 1;
});
