// The NEW (post-migration) schema's expected fingerprint — used by the
// strengthened post-cutover verification (Stage 2D corrective review
// item 6) and by the rollback orchestrator's pre-restore target check
// (item 5: confirm the target really is the expected NEW schema before
// removing it).
//
// Stage 2I-A audit correction: every constant below was regenerated from
// scratch by actually running lib/db/test/run-migrations.mjs (the real
// migrator) against a fresh, disposable local Postgres 17 and
// introspecting the result directly — not transcribed from
// sql/inverse-reset-new-schema.sql as the file previously claimed. That
// file, and this one, had both silently drifted out of sync with
// lib/db/drizzle: the canonical migration set grew from the original
// 20-table/27-function/12-enum baseline (0000-0011) to the current
// 36-table/51-function/20-enum/2-view/91-policy schema across migrations
// 0012-0021 (new domains: teachers/courses/certificates/live classes/
// parent-linking/admin RBAC/referrals/reviews/contact messages/etc.),
// and neither this fingerprint nor the rollback tool's DROP list was ever
// updated to match. Found by actually re-running cutover-core.test.mjs
// fresh on current main (not by inspection) — it failed with a table-set
// mismatch that masked the specific failure-injection case it was meant
// to prove. sql/inverse-reset-new-schema.sql was corrected in the same
// change; a rollback run against the OLD constants would have silently
// left 16 tables, ~24 functions, 8 enums, and both views behind after
// "rolling back."
export const EXPECTED_NEW_TABLES = [
  "admin_audit_log", "admin_role_assignments", "blogs", "certificates",
  "contact_messages", "coupon_redemptions", "coupons", "course_progress",
  "courses", "document_counters", "enrollments", "hifz_progress",
  "invoices", "live_classes", "manual_payments", "messages",
  "notification_preferences", "notifications", "parent_student_links",
  "payments", "plans", "profiles", "provider_events", "quran_bookmarks",
  "quran_memorization_stats", "quran_reading_progress", "referrals",
  "reviews", "role_permissions", "student_records", "subscribers",
  "subscriptions", "system_config", "testimonials", "trial_requests",
  "user_extra_permissions", "wishlists",
];

// Empty by construction: every table in EXPECTED_NEW_TABLES is expected
// to have RLS enabled, no exceptions. A first draft of this file added
// "document_counters" here after a migrate() run against a BARE Postgres
// container showed it with RLS off — but that container has no
// rls_auto_enable() event trigger at all (real Supabase platform
// infrastructure, stubbed by lib/db/test/local-harness.mjs for local
// rehearsal, absent from a plain `postgres:17` image). Against the real
// project (and this repo's own local-harness-stubbed rehearsal, which
// cutover-core.test.mjs actually exercises), that event trigger fires on
// every CREATE TABLE in public and enables RLS regardless of whether the
// migration file itself does — so document_counters genuinely does end
// up RLS-enabled on the real target, and a bare-Postgres-only check was
// the wrong reference. Caught by cutover-core.test.mjs actually failing
// against the real local-harness stub, not by re-inspection. Kept as an
// empty, still-checked constant (not deleted) so a REAL future exception
// has a clear, deliberate place to be added — see the check below, which
// treats an unexpectedly-RLS-disabled table in EXPECTED_NEW_TABLES as a
// hard failure, exactly like any other unexplained drift.
export const TABLES_WITHOUT_RLS = [];

// Views the migrations create — used by both the RLS-safe-view design
// (0016) and the teachers-public design (0019). Neither the fingerprint
// nor the rollback tool checked/dropped these before this correction.
export const EXPECTED_NEW_VIEWS = ["reviews_public", "teachers_public"];

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
// It genuinely is not one of the functions this project's own migrations
// create, so it is listed here as its own explicit constant rather than
// folded silently into the list below.
export const PREEXISTING_PLATFORM_FUNCTIONS = ["rls_auto_enable"];

export const EXPECTED_NEW_FUNCTIONS = [
  "admin_activate_manual_subscription", "admin_assign_teacher",
  "admin_deactivate_subscription", "admin_grant_permission",
  "admin_record_refund", "admin_review_manual_payment",
  "admin_set_admin_role", "admin_set_family_name", "admin_set_role",
  "admin_set_teacher_flag", "admin_update_plan_display",
  "admin_update_plan_marketing", "admin_update_profile", "authorize",
  "can_message", "claim_provider_event", "complete_provider_event",
  "create_plan_version", "deactivate_plan", "delete_course_cascade",
  "enforce_payment_status_transition", "enforce_plan_immutability",
  "enforce_subscription_transition", "ensure_parent_link_code",
  "ensure_referral_code", "forbid_audit_log_mutation",
  "forbid_invoice_mutation", "forbid_payment_delete", "handle_new_user",
  "is_admin", "is_admin_aal2", "is_parent_of", "is_super_admin_aal2",
  "is_teacher_of", "issue_certificate", "issue_invoice_from_payment",
  "link_child_by_code", "mark_notification_read", "my_teacher_id",
  "next_document_number", "reclaim_stale_provider_events",
  "request_cancel_subscription", "revoke_certificate",
  "service_apply_subscription_update",
  "service_grant_subscription_from_payment", "set_updated_at",
  "system_config_set", "track_referral", "update_own_profile_name",
  "validate_coupon", "validate_invoice_insert", "validate_refund_insert",
];

// name -> exact ordered enum labels, confirmed live against a fresh
// migrate() run (see the module-level comment above) rather than
// transcribed by hand from CREATE TYPE statements across 22 files.
export const EXPECTED_NEW_ENUMS = {
  account_role: ["user", "admin"],
  admin_role: ["super-admin", "admin", "editor", "viewer"],
  attendance_status: ["present", "absent", "late", "excused", "unmarked"],
  certificate_type: ["ijazah", "completion", "hifz", "attendance"],
  contact_status: ["new", "in_progress", "resolved", "spam"],
  coupon_type: ["percent", "fixed"],
  course_level: ["Beginner", "Intermediate", "Advanced", "All levels"],
  currency_code: ["EUR"],
  discount_scope: ["first_payment_only", "fixed_duration", "forever"],
  invoice_status: ["pending", "paid", "cancelled"],
  live_class_status: ["scheduled", "cancelled", "completed"],
  manual_payment_status: ["pending", "approved", "rejected"],
  notification_type: [
    "payment_received", "payment_failed", "subscription_renewed",
    "subscription_expiring", "trial_status", "admin_announcement",
    "daily_reminder", "class_scheduled", "class_cancelled",
    "class_reminder", "message_received", "enrollment_approved",
    "enrollment_rejected", "certificate_issued", "coupon_received",
    "review_approved",
  ],
  payment_gateway: ["stripe", "paypal", "manual"],
  payment_kind: ["charge", "refund"],
  payment_status: ["pending", "succeeded", "failed"],
  provider_event_status: ["pending", "processing", "processed", "failed", "ignored"],
  referral_status: ["pending", "converted", "rewarded", "expired"],
  review_status: ["pending", "approved", "rejected"],
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

  // 1b. Exact view set.
  const { rows: viewRows } = await client.query(`select table_name from information_schema.views where table_schema='public' order by table_name;`);
  const actualViews = viewRows.map((r) => r.table_name).sort();
  const expectedViews = [...EXPECTED_NEW_VIEWS].sort();
  if (JSON.stringify(actualViews) !== JSON.stringify(expectedViews)) {
    fail(`post-migration fingerprint: view set mismatch.\n  expected: ${expectedViews.join(", ")}\n  actual:   ${actualViews.join(", ")}`);
  }

  // 2. Exact function set — not just "the core RPCs are present", the
  // full named set, no extras.
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

  // 5. RLS enabled on every new table EXCEPT the known TABLES_WITHOUT_RLS
  // exception (document_counters — see its own constant above), and
  // (when a policy fixture is supplied — see cutover-core.mjs) the FULL
  // policy definition set matches exactly, the same "not just a count"
  // discipline restore-bundle.mjs already uses.
  const rlsCheckedTables = EXPECTED_NEW_TABLES.filter((t) => !TABLES_WITHOUT_RLS.includes(t));
  const { rows: rlsRows } = await client.query(`
    select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname = any($1::text[]);
  `, [rlsCheckedTables]);
  const notEnabled = rlsRows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
  if (notEnabled.length > 0) {
    fail(`post-migration fingerprint: RLS is not enabled on: ${notEnabled.join(", ")}`);
  }
  const { rows: rlsExceptionRows } = await client.query(`
    select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname = any($1::text[]);
  `, [TABLES_WITHOUT_RLS]);
  const unexpectedlyEnabled = rlsExceptionRows.filter((r) => r.relrowsecurity).map((r) => r.relname);
  if (unexpectedlyEnabled.length > 0) {
    fail(`post-migration fingerprint: RLS is now enabled on table(s) previously known to intentionally have it off (${unexpectedlyEnabled.join(", ")}) — TABLES_WITHOUT_RLS is stale, or this table's design changed and the constant needs updating deliberately, not silently passing.`);
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
  // else naming one of the new tables as a leftover from a PARTIAL
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
  return { tables: actualTables, views: actualViews, functions: actualFuncs, enums: actualEnums, triggers: unexpectedTrigRows };
}
