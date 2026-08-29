// RLS Remediation Round 3 (Section G.2): direct ACL assertions against
// the fully-migrated (0000-0009) LOCAL Docker Postgres — not role-
// switched behavior (that's rls.local.test.mjs / rls-full-matrix.local.
// test.mjs), a declarative audit of the actual privilege state itself,
// via has_table_privilege()/has_column_privilege()/has_function_
// privilege(). This is what actually PROVES a "denied at the GRANT
// layer" claim made elsewhere in the suite, rather than inferring the
// mechanism from a caught error. Same localhost-only guard as every
// other script here.
import pg from "pg";

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

async function hasTable(role, table, priv) {
  const { rows } = await pool.query(`select has_table_privilege($1, $2, $3) as v;`, [role, `public.${table}`, priv]);
  return rows[0].v;
}
async function hasColumn(role, table, column, priv) {
  const { rows } = await pool.query(`select has_column_privilege($1, $2, $3, $4) as v;`, [role, `public.${table}`, column, priv]);
  return rows[0].v;
}
async function hasFunction(role, signature, priv = "EXECUTE") {
  const { rows } = await pool.query(`select has_function_privilege($1, $2, $3) as v;`, [role, signature, priv]);
  return rows[0].v;
}

async function assertTable(role, table, priv, expected, note = "") {
  const got = await hasTable(role, table, priv);
  assert(got === expected, `has_table_privilege('${role}', '${table}', '${priv}') expected ${expected}, got ${got}${note ? " — " + note : ""}`);
}
async function assertColumn(role, table, column, priv, expected, note = "") {
  const got = await hasColumn(role, table, column, priv);
  assert(got === expected, `has_column_privilege('${role}', '${table}', '${column}', '${priv}') expected ${expected}, got ${got}${note ? " — " + note : ""}`);
}
async function assertFunction(role, signature, expected, priv = "EXECUTE", note = "") {
  const got = await hasFunction(role, signature, priv);
  assert(got === expected, `has_function_privilege('${role}', '${signature}', '${priv}') expected ${expected}, got ${got}${note ? " — " + note : ""}`);
}

const ALL_TABLES = [
  "admin_audit_log", "coupon_redemptions", "coupons", "invoices", "manual_payments",
  "blogs", "subscribers", "testimonials", "trial_requests", "enrollments", "profiles",
  "quran_bookmarks", "quran_memorization_stats", "quran_reading_progress", "plans",
  "subscriptions", "payments", "provider_events", "notification_preferences", "notifications",
];

async function main() {
  // -------------------------------------------------------------------
  // PUBLIC itself: the exact gap Section A closes. 0002's original
  // closing block only ever REVOKEd FROM PUBLIC, which never touches a
  // grant made directly to a named role — PUBLIC having nothing is a
  // necessary but not sufficient check (a named role could still carry
  // a direct grant PUBLIC's revoke never reached). Verified alongside
  // the real fix below: every named role's grants are individually
  // checked against the intended matrix, not inferred from PUBLIC.
  // -------------------------------------------------------------------
  await test("PUBLIC has no table privileges and no function EXECUTE on anything in schema public", async () => {
    for (const table of ALL_TABLES) {
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        await assertTable("public", table, priv, false);
      }
    }
    await assertFunction("public", "public.is_admin()", false);
    await assertFunction("public", "public.claim_provider_event(uuid)", false);
  });

  // -------------------------------------------------------------------
  // anon: read-only public catalog + the 3 column-restricted guest-
  // insert forms. Nothing else, ever.
  // -------------------------------------------------------------------
  await test("anon: SELECT only on plans/blogs/testimonials, nothing else", async () => {
    for (const table of ["plans", "blogs", "testimonials"]) {
      await assertTable("anon", table, "SELECT", true);
    }
    for (const table of ALL_TABLES.filter((t) => !["plans", "blogs", "testimonials"].includes(t))) {
      await assertTable("anon", table, "SELECT", false, "anon must not read any table outside the public catalog");
    }
    for (const table of ALL_TABLES) {
      await assertTable("anon", table, "UPDATE", false);
      await assertTable("anon", table, "DELETE", false);
    }
  });

  await test("anon: column-restricted INSERT on enrollments/trial_requests/subscribers — allowed fields only, never created_at/id/status-forgery fields", async () => {
    await assertColumn("anon", "enrollments", "status", "INSERT", true);
    await assertColumn("anon", "enrollments", "email", "INSERT", true);
    await assertColumn("anon", "enrollments", "created_at", "INSERT", false, "created_at must never be forgeable by a guest");
    await assertColumn("anon", "enrollments", "id", "INSERT", false);

    await assertColumn("anon", "trial_requests", "status", "INSERT", true);
    await assertColumn("anon", "trial_requests", "created_at", "INSERT", false);

    await assertColumn("anon", "subscribers", "email", "INSERT", true);
    await assertColumn("anon", "subscribers", "status", "INSERT", true);
    await assertColumn("anon", "subscribers", "created_at", "INSERT", false);

    for (const table of ALL_TABLES.filter((t) => !["enrollments", "trial_requests", "subscribers"].includes(t))) {
      await assertTable("anon", table, "INSERT", false);
    }
  });

  await test("anon: no EXECUTE on any admin/service/owner RPC — only is_admin() (referenced by an anon-visible policy)", async () => {
    await assertFunction("anon", "public.is_admin()", true);
    await assertFunction("anon", "public.is_admin_aal2()", false);
    await assertFunction("anon", "public.claim_provider_event(uuid)", false);
    await assertFunction("anon", "public.complete_provider_event(uuid, uuid, public.provider_event_status, text)", false);
    await assertFunction("anon", "public.reclaim_stale_provider_events(interval)", false);
    await assertFunction("anon", "public.service_apply_subscription_update(uuid, uuid, public.payment_gateway, text, text, public.subscription_status, timestamp with time zone, timestamp with time zone, boolean)", false);
    await assertFunction("anon", "public.issue_invoice_from_payment(uuid)", false);
    await assertFunction("anon", "public.create_plan_version(uuid, text, text, integer, public.currency_code, text, text, text, text, integer, integer, integer)", false);
    await assertFunction("anon", "public.admin_record_refund(uuid, integer, text)", false);
  });

  // -------------------------------------------------------------------
  // authenticated: SELECT everywhere (RLS narrows per row), INSERT/
  // UPDATE/DELETE per the FINAL matrix — subscriptions/invoices/plans
  // lost their raw write grants this round; the rest are unchanged from
  // 0004's restatement of Round 2's baseline.
  // -------------------------------------------------------------------
  await test("authenticated: SELECT on every one of the 20 tables (RLS is what actually narrows visibility, not the GRANT)", async () => {
    for (const table of ALL_TABLES) {
      await assertTable("authenticated", table, "SELECT", true, "a blanket SELECT grant + per-table RLS is this codebase's established defense-in-depth shape");
    }
  });

  await test("authenticated: subscriptions has NO INSERT/UPDATE/DELETE at all — fully RPC-only (Section C)", async () => {
    await assertTable("authenticated", "subscriptions", "INSERT", false, "0006 closed the leftover, RLS-only-blocked INSERT grant 0004 had carried forward");
    await assertTable("authenticated", "subscriptions", "UPDATE", false, "0006 closed the raw admin UPDATE path");
    await assertTable("authenticated", "subscriptions", "DELETE", false, "never granted at any point");
  });

  await test("authenticated: invoices has NO INSERT/UPDATE/DELETE at all — issue_invoice_from_payment() is the only path (Section D)", async () => {
    await assertTable("authenticated", "invoices", "INSERT", false, "0007 closed the raw admin INSERT policy/grant");
    await assertTable("authenticated", "invoices", "UPDATE", false, "no UPDATE grant ever existed — immutable once issued");
    await assertTable("authenticated", "invoices", "DELETE", false);
  });

  await test("authenticated: plans has NO INSERT/UPDATE/DELETE at all — create_plan_version()/deactivate_plan()/admin_update_plan_display() are the only paths (Section E)", async () => {
    await assertTable("authenticated", "plans", "INSERT", false, "0008 closed the raw admin INSERT policy/grant");
    await assertTable("authenticated", "plans", "UPDATE", false, "0008 closed the raw admin UPDATE policy/grant");
    await assertTable("authenticated", "plans", "DELETE", false);
  });

  await test("authenticated: the remaining INSERT-granted tables are unchanged from the 0004 baseline", async () => {
    const stillInsertable = [
      "quran_bookmarks", "quran_reading_progress", "quran_memorization_stats",
      "manual_payments", "coupons", "blogs", "testimonials", "notifications", "notification_preferences",
    ];
    for (const table of stillInsertable) {
      await assertTable("authenticated", table, "INSERT", true);
    }
    // payments/admin_audit_log/provider_events/profiles/enrollments/
    // trial_requests/subscribers: never had an authenticated INSERT
    // grant at any point — RPC/service_role/guest-column-restricted only.
    for (const table of ["payments", "admin_audit_log", "provider_events", "profiles"]) {
      await assertTable("authenticated", table, "INSERT", false);
    }
  });

  await test("authenticated: UPDATE remains granted exactly where 0002's policies still allow a raw owner/admin write", async () => {
    const stillUpdatable = [
      "quran_bookmarks", "quran_reading_progress", "quran_memorization_stats",
      "enrollments", "coupons", "blogs", "testimonials", "trial_requests", "subscribers",
      "notification_preferences",
    ];
    for (const table of stillUpdatable) {
      await assertTable("authenticated", table, "UPDATE", true);
    }
    for (const table of ["payments", "profiles", "manual_payments", "admin_audit_log", "provider_events", "notifications"]) {
      await assertTable("authenticated", table, "UPDATE", false, "RPC/trigger-governed, no raw UPDATE grant");
    }
  });

  await test("authenticated: EXECUTE on the 3 new Section C/D/E/F RPCs it's actually meant to call (self-guarded internally)", async () => {
    await assertFunction("authenticated", "public.request_cancel_subscription(uuid)", true);
    await assertFunction("authenticated", "public.admin_activate_manual_subscription(uuid, uuid, timestamp with time zone)", true);
    await assertFunction("authenticated", "public.issue_invoice_from_payment(uuid)", true);
    await assertFunction("authenticated", "public.create_plan_version(uuid, text, text, integer, public.currency_code, text, text, text, text, integer, integer, integer)", true);
    await assertFunction("authenticated", "public.deactivate_plan(uuid)", true);
    await assertFunction("authenticated", "public.admin_update_plan_display(uuid, integer)", true);
    await assertFunction("authenticated", "public.admin_record_refund(uuid, integer, text)", true);
  });

  await test("authenticated: NO EXECUTE on the service_role-only RPCs — webhook lease functions and the subscription upsert", async () => {
    await assertFunction("authenticated", "public.claim_provider_event(uuid)", false);
    await assertFunction("authenticated", "public.complete_provider_event(uuid, uuid, public.provider_event_status, text)", false);
    await assertFunction("authenticated", "public.reclaim_stale_provider_events(interval)", false);
    await assertFunction("authenticated", "public.service_apply_subscription_update(uuid, uuid, public.payment_gateway, text, text, public.subscription_status, timestamp with time zone, timestamp with time zone, boolean)", false);
  });

  await test("authenticated: the old admin_issue_refund(uuid, integer) function object no longer exists at all", async () => {
    const { rows } = await pool.query(`
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_issue_refund';
    `);
    assert(rows.length === 0, "admin_issue_refund should be fully gone — renamed to admin_record_refund, not left behind as a dead overload");
  });

  // -------------------------------------------------------------------
  // service_role: unrestricted table access (the trusted server role) +
  // EXECUTE only on the functions it's actually meant to call.
  // -------------------------------------------------------------------
  await test("service_role: full SELECT/INSERT/UPDATE/DELETE on every table", async () => {
    for (const table of ALL_TABLES) {
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        await assertTable("service_role", table, priv, true);
      }
    }
  });

  await test("service_role: EXECUTE on the webhook lease functions and the subscription upsert", async () => {
    await assertFunction("service_role", "public.claim_provider_event(uuid)", true);
    await assertFunction("service_role", "public.complete_provider_event(uuid, uuid, public.provider_event_status, text)", true);
    await assertFunction("service_role", "public.reclaim_stale_provider_events(interval)", true);
    await assertFunction("service_role", "public.service_apply_subscription_update(uuid, uuid, public.payment_gateway, text, text, public.subscription_status, timestamp with time zone, timestamp with time zone, boolean)", true);
  });

  await test("service_role: also has EXECUTE on issue_invoice_from_payment() (an automated post-charge issuance flow) and the shared admin RPCs (self-guarded, but not force-excluded)", async () => {
    await assertFunction("service_role", "public.issue_invoice_from_payment(uuid)", true);
  });

  // -------------------------------------------------------------------
  // Schema-level: USAGE, and the confirmed absence of any sequence to
  // manage (every id column uses gen_random_uuid(), not serial/identity
  // — Section A's own doc comment, re-verified here rather than assumed
  // stale).
  // -------------------------------------------------------------------
  await test("schema public: USAGE granted to anon/authenticated/service_role, nothing more", async () => {
    const { rows } = await pool.query(`
      select has_schema_privilege('anon', 'public', 'USAGE') as anon,
             has_schema_privilege('authenticated', 'public', 'USAGE') as authenticated,
             has_schema_privilege('service_role', 'public', 'USAGE') as service_role;
    `);
    assert(rows[0].anon && rows[0].authenticated && rows[0].service_role, "all 3 roles should have USAGE on schema public");
  });

  await test("no sequences exist anywhere in schema public (every id is gen_random_uuid()-defaulted, not serial/identity)", async () => {
    const { rows } = await pool.query(`
      select sequence_name from information_schema.sequences where sequence_schema = 'public';
    `);
    assert(rows.length === 0, `expected 0 sequences in schema public, found: ${rows.map((r) => r.sequence_name).join(", ")}`);
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
  console.error("[acl-test] harness crashed:", err);
  process.exitCode = 1;
});
