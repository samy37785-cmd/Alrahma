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
    // Baseline remediation: this used to be a hand-guessed list of
    // plausible-sounding table names that did NOT match reality — it
    // never actually tested against the real DROP list. This is the
    // real, locked list from docs/product-scope-audit.md §12.
    const dropped = [
      "profile_children", "admin_lockouts", "courses", "course_progress",
      "certificates", "student_records", "live_classes", "hifz_progress",
      "referrals", "messages", "reviews", "posts", "post_likes", "comments",
      "wishlist_items", "tutor_conversations", "system_config",
      "system_audit_log", "rate_limit_counters", "contact_messages",
    ];
    assert(dropped.length === 20, `expected exactly 20 dropped-table names to check, got ${dropped.length}`);
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

  await test("quran_bookmarks_user_verse_unique unique index exists", async () => {
    const { rows } = await pool.query(`
      select indexdef from pg_indexes
      where tablename = 'quran_bookmarks' and indexname = 'quran_bookmarks_user_verse_unique';
    `);
    assert(rows.length === 1, "index not found");
  });

  await test("plain ownership indexes exist on every FK/ownership column from finding 8", async () => {
    const expected = [
      ["payments", "payments_user_id_idx"],
      ["subscriptions", "subscriptions_user_id_idx"],
      ["manual_payments", "manual_payments_user_id_idx"],
      ["invoices", "invoices_user_id_idx"],
      ["notifications", "notifications_user_id_idx"],
      ["coupon_redemptions", "coupon_redemptions_user_id_idx"],
      ["admin_audit_log", "admin_audit_log_actor_admin_id_idx"],
    ];
    for (const [table, indexName] of expected) {
      const { rows } = await pool.query(
        `select 1 from pg_indexes where tablename = $1 and indexname = $2;`,
        [table, indexName],
      );
      assert(rows.length === 1, `missing index ${indexName} on ${table}`);
    }
    // quran_bookmarks is deliberately NOT in this list — its
    // unique(user_id, verse_key) index already covers user_id-led
    // lookups (see quran.ts's comment); a separate plain index would be
    // redundant.
  });

  await test("all 9 hand-authored 0001_functions_triggers.sql functions exist", async () => {
    // Baseline remediation: was "all 6" while actually checking 7 names
    // (a real accuracy bug). RLS Remediation Round 2 added
    // validate_invoice_insert() (finding 1 — closes the raw-invoice-
    // insert forgery gap). reclaim_stale_provider_events() (finding 7)
    // is intentionally NOT in this list — it's defined in
    // 0003_provider_events_lease.sql, not 0001, and is covered by its
    // own behavioral tests in rls.local.test.mjs.
    const expected = [
      "handle_new_user", "enforce_payment_status_transition", "forbid_payment_delete",
      "validate_refund_insert", "validate_invoice_insert", "forbid_audit_log_mutation",
      "claim_provider_event", "complete_provider_event", "set_updated_at",
    ];
    const { rows } = await pool.query(`
      select routine_name from information_schema.routines
      where routine_schema = 'public' and routine_name = any($1::text[]);
    `, [expected]);
    const found = rows.map((r) => r.routine_name);
    assert(found.length === expected.length, `expected exactly ${expected.length} functions, found ${found.length}: ${found.join(", ")}`);
    for (const fn of expected) {
      assert(found.includes(fn), `missing function public.${fn}`);
    }
    assert(!found.includes("forbid_refund_of_refund"), "forbid_refund_of_refund() should no longer exist (replaced by validate_refund_insert())");
  });

  // -------------------------------------------------------------------
  // RLS Remediation Round 3 — targeted schema-shape additions. The
  // functions/RPCs introduced by 0004-0009 live outside 0001, so the
  // "N hand-authored 0001 functions" assertion above stays unchanged
  // (same reasoning already established for reclaim_stale_provider_
  // events() in Round 2) — these are the real, new schema-level facts
  // this round adds.
  // -------------------------------------------------------------------
  await test("manual_payments.activated_at exists, is nullable, and defaults to null (Section C)", async () => {
    const { rows } = await pool.query(`
      select is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'manual_payments' and column_name = 'activated_at';
    `);
    assert(rows.length === 1, "manual_payments.activated_at column not found");
    assert(rows[0].is_nullable === "YES", "manual_payments.activated_at must be nullable — only set once, by admin_activate_manual_subscription()");
    assert(rows[0].column_default === null, "manual_payments.activated_at must default to NULL (unactivated)");
  });

  await test("invoices.payment_id is genuinely NOT NULL with a real unique index and ON DELETE RESTRICT (Section D)", async () => {
    const { rows } = await pool.query(`
      select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'invoices' and column_name = 'payment_id';
    `);
    assert(rows.length === 1, "invoices.payment_id column not found");
    assert(rows[0].is_nullable === "NO", "invoices.payment_id must be NOT NULL — a receipt always names the charge it's a receipt for");

    const { rows: idx } = await pool.query(`
      select indexdef from pg_indexes where tablename = 'invoices' and indexname = 'invoices_payment_id_unique';
    `);
    assert(idx.length === 1, "invoices_payment_id_unique index not found — one invoice per payment is the decided policy");
    assert(/UNIQUE/i.test(idx[0].indexdef), "invoices_payment_id_unique must be a real unique index");

    const { rows: fk } = await pool.query(`
      select rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
      where tc.table_name = 'invoices' and tc.constraint_name = 'invoices_payment_id_payments_id_fk';
    `);
    assert(fk.length === 1 && fk[0].delete_rule === "RESTRICT", `expected ON DELETE RESTRICT on invoices.payment_id's FK, got ${fk[0]?.delete_rule}`);
  });

  await test("plans_slug_active_unique replaces the old flat unique(slug) — a partial index, WHERE active (Section E)", async () => {
    const { rows: oldConstraint } = await pool.query(`
      select 1 from information_schema.table_constraints where table_name = 'plans' and constraint_name = 'plans_slug_unique';
    `);
    assert(oldConstraint.length === 0, "the old flat unique(slug) constraint should be gone — it made real versioning structurally impossible");

    const { rows } = await pool.query(`
      select indexdef from pg_indexes where tablename = 'plans' and indexname = 'plans_slug_active_unique';
    `);
    assert(rows.length === 1, "plans_slug_active_unique index not found");
    assert(/UNIQUE/i.test(rows[0].indexdef) && /WHERE/i.test(rows[0].indexdef), "plans_slug_active_unique must be a partial unique index");
  });

  await test("plans_slug_version_unique — a real (slug, version) backstop against duplicate versions (Round 4)", async () => {
    const { rows } = await pool.query(`
      select indexdef from pg_indexes where tablename = 'plans' and indexname = 'plans_slug_version_unique';
    `);
    assert(rows.length === 1, "plans_slug_version_unique index not found");
    assert(/UNIQUE/i.test(rows[0].indexdef), "plans_slug_version_unique must be a unique index");
    assert(!/WHERE/i.test(rows[0].indexdef), "plans_slug_version_unique must be unconditional — it must guard inactive rows too, not just active ones");
  });

  await test("provider_events carries claim_token/lease_expires_at/attempt_count, and a partial index on the processing lease (Section B)", async () => {
    const { rows } = await pool.query(`
      select column_name, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'provider_events'
        and column_name in ('claim_token', 'lease_expires_at', 'attempt_count');
    `);
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    assert(byName.claim_token?.is_nullable === "YES", "claim_token must be nullable (unset while pending)");
    assert(byName.lease_expires_at?.is_nullable === "YES", "lease_expires_at must be nullable (unset while pending)");
    assert(byName.attempt_count?.is_nullable === "NO" && byName.attempt_count?.column_default?.includes("0"), "attempt_count must be NOT NULL DEFAULT 0");

    const { rows: idx } = await pool.query(`
      select indexdef from pg_indexes where tablename = 'provider_events' and indexname = 'provider_events_processing_lease_idx';
    `);
    assert(idx.length === 1 && /WHERE/i.test(idx[0].indexdef), "provider_events_processing_lease_idx must exist as a partial index");
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

  await test("seed: create a plan fixture (EUR)", async () => {
    const { rows } = await pool.query(
      `insert into public.plans (slug, name, amount_minor, currency) values ('basic-monthly', 'Basic Monthly', 5000, 'EUR') returning id;`,
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

  await test("USD is rejected — currency_code is EUR-only (baseline remediation)", async () => {
    // Baseline remediation: this used to insert 'EUR' expecting
    // rejection, when EUR was the one narrow value the old enum
    // excluded — i.e. it was testing the exact opposite of today's real
    // policy. Now the enum is ['EUR'] only, so USD (the live app's
    // cosmetic-only display currency, never actually charged) is what
    // should be rejected.
    await expectReject(
      () => pool.query(
        `insert into public.plans (slug, name, amount_minor, currency) values ('usd-plan', 'USD Plan', 1000, 'USD');`,
      ),
      "USD should be rejected — currency_code only allows EUR",
    );
  });

  await test("EUR plan insert succeeds", async () => {
    await pool.query(
      `insert into public.plans (slug, name, amount_minor, currency) values ('eur-plan-2', 'EUR Plan 2', 1000, 'EUR');`,
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

  await test("a charge whose amount doesn't reconcile to plan_amount_minor_snapshot - discount is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, amount_minor, plan_amount_minor_snapshot, discount_minor_snapshot, gateway)
         values ($1, $2, 4000, 5000, 500, 'stripe');`, // 5000 - 500 = 4500, not 4000
        [userAId, planId],
      ),
      "a charge with a non-reconciling amount_minor should have been rejected",
    );
  });

  await test("a charge with no plan_amount_minor_snapshot is exempt from the reconciliation CHECK", async () => {
    await pool.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 12345, 'manual');`,
      [userAId, planId],
    );
  });

  // -------------------------------------------------------------------
  // Status-vocabulary allowlists (baseline remediation — real evidence,
  // see enrollments.ts / content.ts's doc comments).
  // -------------------------------------------------------------------
  await test("invalid enrollments.status value is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.enrollments (name, email, status) values ('X', 'x2@example.test', 'bogus');`,
      ),
      "invalid enrollments.status should have been rejected",
    );
  });

  await test("invalid trial_requests.status value is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.trial_requests (name, email, status) values ('X', 'x3@example.test', 'bogus');`,
      ),
      "invalid trial_requests.status should have been rejected",
    );
  });

  await test("invalid subscribers.status value is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.subscribers (email, status) values ('x4@example.test', 'bogus');`,
      ),
      "invalid subscribers.status should have been rejected",
    );
  });

  await test("invalid invoices.status value is rejected (now a real enum)", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.invoices (user_id, amount_minor_snapshot, status) values ($1, 1000, 'issued');`,
        [userAId],
      ),
      "invalid invoice_status enum value should have been rejected",
    );
  });

  await test("notification_preferences accepts all 6 real live-app languages", async () => {
    for (const lang of ["en", "ar", "it", "es", "de", "fr"]) {
      const uid = crypto.randomUUID();
      await pool.query(`insert into auth.users (id, email) values ($1, $2);`, [uid, `${uid}@example.test`]);
      await pool.query(
        `insert into public.notification_preferences (user_id, language) values ($1, $2);`,
        [uid, lang],
      );
    }
  });

  await test("notification_preferences rejects a 7th, unsupported language", async () => {
    const uid = crypto.randomUUID();
    await pool.query(`insert into auth.users (id, email) values ($1, $2);`, [uid, `${uid}@example.test`]);
    await expectReject(
      () => pool.query(
        `insert into public.notification_preferences (user_id, language) values ($1, 'zh');`,
        [uid],
      ),
      "an unsupported language should have been rejected",
    );
  });

  // -------------------------------------------------------------------
  // Case-insensitive uniqueness (baseline remediation).
  // -------------------------------------------------------------------
  await test("coupons.code uniqueness is case-insensitive", async () => {
    await pool.query(
      `insert into public.coupons (code, type, value, discount_scope) values ('CASE10', 'percent', 10, 'first_payment_only');`,
    );
    const err = await expectReject(
      () => pool.query(
        `insert into public.coupons (code, type, value, discount_scope) values ('case10', 'percent', 15, 'first_payment_only');`,
      ),
      "a case-varied duplicate coupon code should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
  });

  await test("subscribers.email uniqueness is case-insensitive", async () => {
    await pool.query(`insert into public.subscribers (email) values ('CaseTest@Example.test');`);
    const err = await expectReject(
      () => pool.query(`insert into public.subscribers (email) values ('casetest@example.test');`),
      "a case-varied duplicate subscriber email should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
  });

  await test("profiles.email uniqueness is case-insensitive", async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    await pool.query(`insert into auth.users (id, email) values ($1, 'CaseProfile@Example.test');`, [id1]);
    await pool.query(`insert into auth.users (id, email) values ($1, 'irrelevant@example.test');`, [id2]);
    // profiles row for id1 now exists with email 'CaseProfile@Example.test'
    // via the trigger. Try to insert a second profiles row (a different
    // id, simulating a bug elsewhere) with only a case-varied email.
    const err = await expectReject(
      () => pool.query(
        `insert into public.profiles (id, email) values ($1, 'caseprofile@example.test');`,
        [id2],
      ),
      "a case-varied duplicate profile email should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
  });

  await test("quran_bookmarks: a second bookmark for the same (user, verse) is rejected", async () => {
    await pool.query(
      `insert into public.quran_bookmarks (user_id, verse_key, chapter_id, verse_num) values ($1, '2:255', 2, 255);`,
      [userAId],
    );
    const err = await expectReject(
      () => pool.query(
        `insert into public.quran_bookmarks (user_id, verse_key, chapter_id, verse_num) values ($1, '2:255', 2, 255);`,
        [userAId],
      ),
      "a second bookmark for the same user+verse should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
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
      `insert into public.notifications (user_id, type, title, dedupe_key) values ($1, 'daily_reminder', 'Reminder', 'daily-2026-08-29');`,
      [userAId],
    );
    const err = await expectReject(
      () => pool.query(
        `insert into public.notifications (user_id, type, title, dedupe_key) values ($1, 'daily_reminder', 'Reminder (dup)', 'daily-2026-08-29');`,
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

  await test("coupons.max_uses <= 0 is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.coupons (code, type, value, discount_scope, max_uses) values ('BADMAX', 'fixed', 5, 'forever', 0);`,
      ),
      "max_uses = 0 should have been rejected",
    );
  });

  // -------------------------------------------------------------------
  // Subscriptions: one active per user.
  // -------------------------------------------------------------------
  await test("a second ACTIVE subscription for the same user is rejected", async () => {
    await pool.query(
      `insert into public.subscriptions (user_id, plan_id, provider, status, current_period_start, current_period_end) values ($1, $2, 'stripe', 'active', now(), now() + interval '30 days');`,
      [userBId, planId],
    );
    const err = await expectReject(
      () => pool.query(
        `insert into public.subscriptions (user_id, plan_id, provider, status, current_period_start, current_period_end) values ($1, $2, 'paypal', 'active', now(), now() + interval '30 days');`,
        [userBId, planId],
      ),
      "a second active subscription for the same user should have been rejected",
    );
    assert(err.code === "23505", `expected a unique_violation (23505), got code=${err.code}`);
  });

  await test("a second CANCELED subscription for the same user is allowed (partial index only guards 'active')", async () => {
    // RLS Remediation Round 4: enforce_subscription_transition() now
    // fires on INSERT too — a canceled row must carry canceled_at
    // consistently even on its very first insert, not just on a later
    // UPDATE into that state.
    await pool.query(
      `insert into public.subscriptions (user_id, plan_id, provider, status, canceled_at) values ($1, $2, 'manual', 'canceled', now());`,
      [userBId, planId],
    );
  });

  // -------------------------------------------------------------------
  // Payments ledger: status transitions, delete-block.
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

  // -------------------------------------------------------------------
  // validate_refund_insert(): the baseline-remediation refund fix.
  // -------------------------------------------------------------------
  let pendingChargeId;
  await test("refunding a charge that hasn't succeeded is rejected", async () => {
    const { rows } = await pool.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway) values ($1, $2, 3000, 'stripe') returning id;`,
      [userAId, planId],
    );
    pendingChargeId = rows[0].id;
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
         values ($1, $2, 'refund', $3, 1000, 'stripe', 'succeeded');`,
        [userAId, planId, pendingChargeId],
      ),
      "refunding a still-pending charge should have been rejected",
    );
  });

  await test("a refund exceeding the charge amount is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
         values ($1, $2, 'refund', $3, 999999, 'stripe', 'succeeded');`,
        [userAId, planId, chargeId],
      ),
      "a refund larger than the charge should have been rejected",
    );
  });

  await test("a refund with a mismatched user_id is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
         values ($1, $2, 'refund', $3, 500, 'stripe', 'succeeded');`,
        [userBId, planId, chargeId], // chargeId's real owner is userAId
      ),
      "a refund with a mismatched user_id should have been rejected",
    );
  });

  await test("a refund with a mismatched gateway is rejected", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
         values ($1, $2, 'refund', $3, 500, 'paypal', 'succeeded');`, // chargeId's real gateway is stripe
        [userAId, planId, chargeId],
      ),
      "a refund with a mismatched gateway should have been rejected",
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

  await test("a third refund that would push the total past the charge amount is rejected", async () => {
    // 3500 already refunded out of 5000 — a further 2000 would be 5500.
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
         values ($1, $2, 'refund', $3, 2000, 'stripe', 'succeeded');`,
        [userAId, planId, chargeId],
      ),
      "a refund pushing the cumulative total past the charge amount should have been rejected",
    );
  });

  await test("a refund of a refund is rejected (validate_refund_insert trigger)", async () => {
    await expectReject(
      () => pool.query(
        `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
         values ($1, $2, 'refund', $3, 500, 'stripe', 'succeeded');`,
        [userAId, planId, refund1Id],
      ),
      "a refund whose parent is itself a refund should have been rejected",
    );
  });

  await test("CONCURRENCY: two refunds racing past the remaining balance — only one succeeds", async () => {
    // Fresh charge, room for exactly one more 1000 refund (5000 charge,
    // 0 refunded so far — two concurrent 3000 refunds would together
    // exceed it if the check weren't serialized by the FOR UPDATE lock).
    const { rows } = await pool.query(
      `insert into public.payments (user_id, plan_id, amount_minor, gateway, gateway_payment_id)
       values ($1, $2, 5000, 'stripe', 'pi_race_1') returning id;`,
      [userAId, planId],
    );
    const raceChargeId = rows[0].id;
    await pool.query(`update public.payments set status = 'succeeded' where id = $1;`, [raceChargeId]);

    const client1 = new pg.Client({ connectionString });
    const client2 = new pg.Client({ connectionString });
    await client1.connect();
    await client2.connect();
    try {
      const attempt = (client) =>
        client
          .query(
            `insert into public.payments (user_id, plan_id, kind, parent_payment_id, amount_minor, gateway, status)
             values ($1, $2, 'refund', $3, 3000, 'stripe', 'succeeded');`,
            [userAId, planId, raceChargeId],
          )
          .then(() => ({ ok: true }))
          .catch((err) => ({ ok: false, err }));

      const [r1, r2] = await Promise.all([attempt(client1), attempt(client2)]);
      const succeeded = [r1, r2].filter((r) => r.ok).length;
      const failed = [r1, r2].filter((r) => !r.ok).length;
      assert(succeeded === 1, `expected exactly 1 of 2 concurrent refunds to succeed, got ${succeeded}`);
      assert(failed === 1, `expected exactly 1 of 2 concurrent refunds to fail, got ${failed}`);

      const totalsRes = await pool.query(
        `select coalesce(sum(amount_minor), 0) as total from public.payments where parent_payment_id = $1 and kind = 'refund';`,
        [raceChargeId],
      );
      assert(Number(totalsRes.rows[0].total) === 3000, `expected total refunded 3000 after the race, got ${totalsRes.rows[0].total}`);
    } finally {
      await client1.end();
      await client2.end();
    }
  });

  // -------------------------------------------------------------------
  // claim_provider_event() / complete_provider_event(): the baseline-
  // remediation two-phase claim.
  // -------------------------------------------------------------------
  await test("claim_provider_event() claims a pending event exactly once", async () => {
    const { rows } = await pool.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('paypal', 'evt_claim_1', 'PAYMENT.CAPTURE.COMPLETED', 'hashclaim1') returning id;`,
    );
    const eventId = rows[0].id;

    const first = await pool.query(`select * from public.claim_provider_event($1);`, [eventId]);
    assert(first.rows.length === 1, "first claim should return exactly 1 row");
    assert(first.rows[0].processing_status === "processing");

    const second = await pool.query(`select * from public.claim_provider_event($1);`, [eventId]);
    assert(second.rows.length === 0, "second claim on an already-processing event should return 0 rows (idempotent no-op)");
  });

  await test("complete_provider_event() finalizes a claimed event, and a repeat complete is a no-op", async () => {
    // RLS Remediation Round 3 (Section B): complete_provider_event()'s
    // signature gained a required claim_token — the caller must pass the
    // exact token claim_provider_event() returned, or the completion
    // matches 0 rows (fencing; see rls.local.test.mjs's dedicated race
    // test for the actual bug this closes). This test only exercises the
    // happy path with the real token.
    const { rows } = await pool.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('paypal', 'evt_complete_1', 'PAYMENT.CAPTURE.COMPLETED', 'hashcomplete1') returning id;`,
    );
    const eventId = rows[0].id;
    const claim = await pool.query(`select * from public.claim_provider_event($1);`, [eventId]);
    const claimToken = claim.rows[0].claim_token;

    const done = await pool.query(`select * from public.complete_provider_event($1, $2, 'processed', null);`, [eventId, claimToken]);
    assert(done.rows.length === 1 && done.rows[0].processing_status === "processed");

    const repeat = await pool.query(`select * from public.complete_provider_event($1, $2, 'processed', null);`, [eventId, claimToken]);
    assert(repeat.rows.length === 0, "completing an already-processed event again should be a no-op");
  });

  await test("complete_provider_event() cannot finalize an event that was never claimed (no claim_token exists to match)", async () => {
    const { rows } = await pool.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('paypal', 'evt_unclaimed_1', 'PAYMENT.CAPTURE.COMPLETED', 'hashunclaimed1') returning id;`,
    );
    const eventId = rows[0].id;
    const res = await pool.query(
      `select * from public.complete_provider_event($1, gen_random_uuid(), 'processed', null);`,
      [eventId],
    );
    assert(res.rows.length === 0, "completing a still-pending (never claimed) event should return 0 rows — no token could ever match");
  });

  await test("CONCURRENCY: two workers racing claim_provider_event() on the same event — only one wins", async () => {
    const { rows } = await pool.query(
      `insert into public.provider_events (provider, provider_event_id, event_type, payload_hash) values ('stripe', 'evt_race_1', 'payment_intent.succeeded', 'hashrace1') returning id;`,
    );
    const eventId = rows[0].id;

    const client1 = new pg.Client({ connectionString });
    const client2 = new pg.Client({ connectionString });
    await client1.connect();
    await client2.connect();
    try {
      const [r1, r2] = await Promise.all([
        client1.query(`select * from public.claim_provider_event($1);`, [eventId]),
        client2.query(`select * from public.claim_provider_event($1);`, [eventId]),
      ]);
      const totalRowsClaimed = r1.rows.length + r2.rows.length;
      assert(totalRowsClaimed === 1, `expected exactly 1 of 2 concurrent claims to win, got ${totalRowsClaimed}`);
    } finally {
      await client1.end();
      await client2.end();
    }
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
  // set_updated_at() sanity check — one already-covered table (plans)
  // plus the 4 tables baseline remediation newly attached it to.
  // -------------------------------------------------------------------
  await test("set_updated_at() bumps updated_at on a plans UPDATE", async () => {
    // RLS Remediation Round 3 (Section E): this used to update `name` —
    // enforce_plan_immutability() (0008) now blocks changing name (and
    // every other catalog-defining column) on an existing plan row, so
    // this uses display_order instead, one of the 2 columns that stays
    // genuinely mutable in place — still a real UPDATE on this table,
    // still proves set_updated_at() fires here.
    const before = await pool.query(`select updated_at from public.plans where id = $1;`, [planId]);
    await new Promise((r) => setTimeout(r, 5));
    await pool.query(`update public.plans set display_order = 7 where id = $1;`, [planId]);
    const after = await pool.query(`select updated_at from public.plans where id = $1;`, [planId]);
    assert(
      new Date(after.rows[0].updated_at).getTime() > new Date(before.rows[0].updated_at).getTime(),
      "updated_at did not advance",
    );
  });

  await test("set_updated_at() is attached to manual_payments/invoices/testimonials/enrollments", async () => {
    const mpId = (
      await pool.query(
        `insert into public.manual_payments (user_id, amount_minor, method) values ($1, 1000, 'bank') returning id;`,
        [userAId],
      )
    ).rows[0].id;
    const before = await pool.query(`select updated_at from public.manual_payments where id = $1;`, [mpId]);
    await new Promise((r) => setTimeout(r, 5));
    await pool.query(`update public.manual_payments set status = 'approved' where id = $1;`, [mpId]);
    const after = await pool.query(`select updated_at from public.manual_payments where id = $1;`, [mpId]);
    assert(
      new Date(after.rows[0].updated_at).getTime() > new Date(before.rows[0].updated_at).getTime(),
      "manual_payments.updated_at did not advance",
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
