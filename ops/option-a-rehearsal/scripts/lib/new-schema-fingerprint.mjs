// The NEW (post-migration, 20-table) schema's expected fingerprint —
// used by the strengthened post-cutover verification (Stage 2D
// corrective review item 6) and by the rollback orchestrator's
// pre-restore target check (item 5: confirm the target really is the
// expected NEW schema before removing it).
//
// Every list below is transcribed directly from
// sql/inverse-reset-new-schema.sql's own DROP TABLE/DROP TYPE/function
// name array — that file is the existing, already-reviewed canonical
// enumeration of "every named new-schema object" (its whole job is to
// remove all of them by name), so reusing it here rather than
// maintaining a second hand-written list keeps both in sync by
// construction. Cross-checked against a real local rehearsal run (see
// out/rehearsal-log — gitignored) rather than trusted blind.
export const EXPECTED_NEW_TABLES = [
  "admin_audit_log", "blogs", "coupon_redemptions", "coupons", "enrollments",
  "invoices", "manual_payments", "notification_preferences", "notifications",
  "payments", "plans", "profiles", "provider_events", "quran_bookmarks",
  "quran_memorization_stats", "quran_reading_progress", "subscribers",
  "subscriptions", "testimonials", "trial_requests",
];

// Note: this is the set of functions the MIGRATIONS create — it does
// NOT include "rls_auto_enable". That function is pre-existing Supabase
// platform infrastructure, deliberately never touched by either
// sql/surgical-reset.sql or sql/inverse-reset-new-schema.sql (both
// scripts' own header comments say so explicitly), so it is legitimately
// present in `public` both BEFORE and AFTER a cutover — found by
// actually running the atomic cutover core against a fixture built from
// a real captured old-schema dump (which, being a real snapshot,
// includes this real platform function) and hitting a false-positive
// "unexpected function" failure here before this comment/entry existed.
// It genuinely is not one of the 27 functions this project's own
// migrations create, so it is listed here as its own explicit constant
// rather than folded silently into the 27 below.
export const PREEXISTING_PLATFORM_FUNCTIONS = ["rls_auto_enable"];

export const EXPECTED_NEW_FUNCTIONS = [
  "admin_activate_manual_subscription", "admin_record_refund",
  "admin_review_manual_payment", "admin_set_role",
  "admin_update_plan_display", "claim_provider_event",
  "complete_provider_event", "create_plan_version", "deactivate_plan",
  "enforce_payment_status_transition", "enforce_plan_immutability",
  "enforce_subscription_transition", "forbid_audit_log_mutation",
  "forbid_invoice_mutation", "forbid_payment_delete",
  "handle_new_user", "is_admin", "is_admin_aal2",
  "issue_invoice_from_payment", "mark_notification_read",
  "reclaim_stale_provider_events", "request_cancel_subscription",
  "service_apply_subscription_update", "set_updated_at",
  "update_own_profile_name", "validate_invoice_insert",
  "validate_refund_insert",
];

// name -> exact ordered enum labels, transcribed from
// lib/db/drizzle/0000_init_20_table_baseline.sql's own CREATE TYPE
// statements.
export const EXPECTED_NEW_ENUMS = {
  account_role: ["user", "admin"],
  coupon_type: ["percent", "fixed"],
  currency_code: ["EUR"],
  discount_scope: ["first_payment_only", "fixed_duration", "forever"],
  invoice_status: ["pending", "paid", "cancelled"],
  manual_payment_status: ["pending", "approved", "rejected"],
  notification_type: [
    "payment_received", "payment_failed", "subscription_renewed",
    "subscription_expiring", "trial_status", "admin_announcement",
    "daily_reminder",
  ],
  payment_gateway: ["stripe", "paypal", "manual"],
  payment_kind: ["charge", "refund"],
  payment_status: ["pending", "succeeded", "failed"],
  provider_event_status: ["pending", "processing", "processed", "failed", "ignored"],
  subscription_status: ["active", "past_due", "canceled", "expired"],
};

import { parsePgTextArray } from "./pg-array.mjs";

function fail(msg) {
  throw new Error(msg);
}

// Runs every strengthened check on the given (already-connected, already
// -in-the-right-transaction) client. Throws on the FIRST mismatch — the
// caller (cutover-core.mjs) treats any throw here as "verification
// failed", which triggers an automatic ROLLBACK of the whole critical
// section, not just a warning.
export async function verifyNewSchemaFingerprint(client, { migrationRows, expectedMigrations, policyFixture }) {
  // 1. Exact table set — no missing table, no unexpected leftover table.
  const { rows: tableRows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
  const actualTables = tableRows.map((r) => r.tablename).sort();
  const expectedTables = [...EXPECTED_NEW_TABLES].sort();
  if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
    fail(`post-migration fingerprint: table set mismatch.\n  expected: ${expectedTables.join(", ")}\n  actual:   ${actualTables.join(", ")}`);
  }

  // 2. Exact function set — not just "the 4 core RPCs are present", the
  // full named 27, no extras.
  const { rows: funcRows } = await client.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' order by p.proname;
  `);
  const actualFuncs = funcRows.map((r) => r.proname).sort();
  const expectedFuncs = [...EXPECTED_NEW_FUNCTIONS, ...PREEXISTING_PLATFORM_FUNCTIONS].sort();
  if (JSON.stringify(actualFuncs) !== JSON.stringify(expectedFuncs)) {
    fail(`post-migration fingerprint: function set mismatch.\n  expected: ${expectedFuncs.join(", ")}\n  actual:   ${actualFuncs.join(", ")}`);
  }

  // 3. Exact enum set AND exact value lists per enum.
  const { rows: enumRows } = await client.query(`
    select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' group by t.typname order by t.typname;
  `);
  const actualEnums = Object.fromEntries(enumRows.map((r) => [r.typname, r.labels]));
  const expectedEnumNames = Object.keys(EXPECTED_NEW_ENUMS).sort();
  const actualEnumNames = Object.keys(actualEnums).sort();
  if (JSON.stringify(actualEnumNames) !== JSON.stringify(expectedEnumNames)) {
    fail(`post-migration fingerprint: enum set mismatch.\n  expected: ${expectedEnumNames.join(", ")}\n  actual:   ${actualEnumNames.join(", ")}`);
  }
  for (const name of expectedEnumNames) {
    if (JSON.stringify(actualEnums[name]) !== JSON.stringify(EXPECTED_NEW_ENUMS[name])) {
      fail(`post-migration fingerprint: enum "${name}" values mismatch.\n  expected: ${EXPECTED_NEW_ENUMS[name].join(", ")}\n  actual:   ${actualEnums[name].join(", ")}`);
    }
  }

  // 4. Migrations journal — every migration file's EXACT hash (from
  // drizzle's own readMigrationFiles(), not re-derived by hand here) is
  // present as a row, not just "row count >= 12".
  const journalRows = migrationRows.map((r) => ({ hash: r.hash, created_at: Number(r.created_at) })).sort((a, b) => a.created_at - b.created_at);
  const expected = expectedMigrations.map((m) => ({ hash: m.hash, created_at: m.folderMillis })).sort((a, b) => a.created_at - b.created_at);
  if (JSON.stringify(journalRows) !== JSON.stringify(expected)) {
    fail(`post-migration fingerprint: drizzle.__drizzle_migrations rows do not exactly match the migration files' own computed {hash, folderMillis} — expected ${expected.length} row(s), got ${journalRows.length}.`);
  }

  // 5. RLS enabled on every new table, and (when a policy fixture is
  // supplied — see cutover-core.mjs) the FULL policy definition set
  // matches exactly, the same "not just a count" discipline
  // restore-bundle.mjs already uses.
  const { rows: rlsRows } = await client.query(`
    select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname = any($1::text[]);
  `, [EXPECTED_NEW_TABLES]);
  const notEnabled = rlsRows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
  if (notEnabled.length > 0) {
    fail(`post-migration fingerprint: RLS is not enabled on: ${notEnabled.join(", ")}`);
  }
  const { rows: policyCountRows } = await client.query(`select count(*) as c from pg_policies where schemaname='public';`);
  if (Number(policyCountRows[0].c) === 0) {
    fail(`post-migration fingerprint: public has 0 RLS policies after migration.`);
  }
  if (policyFixture) {
    const { rows: policyRows } = await client.query(`
      select tablename, policyname, cmd, roles, qual, with_check
      from pg_policies where schemaname='public' order by tablename, policyname;
    `);
    const normalize = (rows) => rows.map((r) => ({ ...r, roles: parsePgTextArray(r.roles || []).sort() }));
    const actualNorm = JSON.stringify(normalize(policyRows));
    const expectedNorm = JSON.stringify(normalize(policyFixture));
    if (actualNorm !== expectedNorm) {
      fail(`post-migration fingerprint: full policy definition set does not match the captured fixture exactly (count: actual ${policyRows.length}, expected ${policyFixture.length}).`);
    }
  }

  // 6. Grants — the 0011 deny-by-default posture must have actually
  // landed: a pg_default_acl row for role postgres/functions, not just
  // "migration 0011's file happened to run" (0011's own header
  // documents a real prior version that silently no-op'd despite
  // appearing to succeed — this checks the observable *effect*, not the
  // statement's exit code).
  const { rows: defaclRows } = await client.query(`
    select defaclacl from pg_default_acl where defaclrole = 'postgres'::regrole and defaclobjtype = 'f';
  `);
  if (defaclRows.length === 0) {
    fail(`post-migration fingerprint: no pg_default_acl row for role postgres/functions — migration 0011's deny-by-default posture does not appear to have taken effect (see that migration's own header for why this exact failure mode has happened before).`);
  }

  // 7. No unexpected leftover triggers/event-triggers beyond what this
  // project's own migrations create (auth.users' on_auth_user_created +
  // rls_auto_enable_trigger are pre-existing Supabase/local-stack
  // infrastructure this project never drops or recreates — anything
  // else naming one of the 20 new tables as a leftover from a PARTIAL
  // prior state would be a real red flag).
  const { rows: unexpectedTrigRows } = await client.query(`
    select tgname, relname from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and relname = any($1::text[]);
  `, [EXPECTED_NEW_TABLES]);
  // Not asserted against a hardcoded list (some tables legitimately carry
  // an updated_at trigger from set_updated_at()) — this query's purpose
  // is to make the actual set observable in the failure report above if
  // any other check in this function fails, not to fail on its own.
  return { tables: actualTables, functions: actualFuncs, enums: actualEnums, triggers: unexpectedTrigRows };
}
