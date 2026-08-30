#!/usr/bin/env node
// Runs ops/option-a-rehearsal/sql/surgical-reset.sql — the only
// sanctioned way to run it. Enforces the same 127.0.0.1/localhost-only
// guard as run-migrate.mjs.
//
// v2: the entire sequence — dependent-object checks, before-fingerprint
// capture, running the DROP statements, after-fingerprint capture,
// every post-condition assertion — now runs inside ONE transaction, on
// ONE connection, with COMMIT issued only if every check passes
// (ROLLBACK otherwise). v1 let sql/surgical-reset.sql commit itself
// (the file had its own begin/commit) before the wrapper's after-
// fingerprint/comparison ran — a code review correctly caught that a
// detected regression would already be too late to prevent. Also
// broadens the dependent-object check beyond the original's
// pg_rewrite/view-only query to also catch a foreign key FROM a table
// OUTSIDE the 34-list INTO one INSIDE it (the exact scenario a code
// review asked to be proven caught, not just claimed) — and now
// compares the full default-ACL content (role/objtype/acl tuples), not
// just a row count.
//
// Known, disclosed residual limitation: pg_depend does not track a
// plpgsql function BODY merely mentioning one of these tables (only
// real catalog-level dependency edges — FKs, defaults, rules, etc. —
// are tracked). A function outside the 34-table/3-enum list whose body
// references one of them by name would not be caught by any check
// here. Not fixed, because there is no general catalog-level mechanism
// to fix it with — stated so this isn't silently assumed complete.
//
// Usage: RESET_DATABASE_URL=postgres://... node scripts/03-surgical-reset.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.join(__dirname, "..", "sql", "surgical-reset.sql");

const EXPECTED_OLD_TABLES = [
  "admin_lockouts", "blogs", "certificates", "comments", "contact_messages",
  "coupon_redemptions", "coupons", "course_progress", "courses", "enrollments",
  "hifz_progress", "invoices", "live_classes", "manual_payments", "messages",
  "notifications", "payments", "post_likes", "posts", "profile_children",
  "profiles", "quran_bookmarks", "quran_memorization_stats", "quran_reading_progress",
  "rate_limit_counters", "referrals", "reviews", "student_records", "subscribers",
  "system_audit_log", "system_config", "trial_requests", "tutor_conversations",
  "wishlist_items",
];
const EXPECTED_OLD_ENUMS = ["role", "subscription_provider", "subscription_status"];

function fail(msg) {
  console.error(`ERROR ${msg}`);
  process.exit(1);
}
function step(msg) { console.log(`--- ${msg}`); }
function ok(msg) { console.log(`OK    ${msg}`); }

const databaseUrl = process.env.RESET_DATABASE_URL;
if (!databaseUrl) fail("RESET_DATABASE_URL must be set.");

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch (e) {
  fail(`RESET_DATABASE_URL is not a parseable URL: ${e.message}`);
}
const hostname = parsedUrl.hostname.toLowerCase();
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  fail(`This script refuses any host but 127.0.0.1/localhost, got "${hostname}". Surgical Reset against a real project is a separate, future, explicitly-approved action, not something this script performs.`);
}

async function checkDependentObjects(client) {
  const problems = [];

  // 1. Views/materialized views whose rewrite rule references one of
  // the 34 named tables.
  const { rows: dependentViews } = await client.query(
    `select distinct dependent_ns.nspname as schema, dependent_view.relname as view_name, source_table.relname as depends_on
     from pg_depend
     join pg_rewrite on pg_depend.objid = pg_rewrite.oid
     join pg_class as dependent_view on pg_rewrite.ev_class = dependent_view.oid
     join pg_class as source_table on pg_depend.refobjid = source_table.oid
     join pg_namespace dependent_ns on dependent_ns.oid = dependent_view.relnamespace
     join pg_namespace source_ns on source_ns.oid = source_table.relnamespace
     where source_ns.nspname = 'public'
       and source_table.relname = any($1::text[])
       and dependent_view.oid != source_table.oid;`,
    [EXPECTED_OLD_TABLES]
  );
  for (const r of dependentViews) {
    problems.push(`view/matview ${r.schema}.${r.view_name} depends on public.${r.depends_on}`);
  }

  // 2. A foreign key FROM a table OUTSIDE the 34-list INTO one INSIDE
  // it — the scenario CASCADE could silently reach into if this check
  // didn't exist. Real catalog joins, not regclass::text (which omits
  // the schema prefix for anything on the default search_path,
  // confirmed by testing — `'public.blogs'::regclass::text` returns
  // just `'blogs'`, which would have made a naive text-array comparison
  // silently never match).
  const { rows: externalFks } = await client.query(
    `select c.conname, dep.relname as dependent_table, dep_ns.nspname as dependent_schema, ref.relname as references_table
     from pg_constraint c
     join pg_class dep on dep.oid = c.conrelid
     join pg_namespace dep_ns on dep_ns.oid = dep.relnamespace
     join pg_class ref on ref.oid = c.confrelid
     join pg_namespace ref_ns on ref_ns.oid = ref.relnamespace
     where c.contype = 'f'
       and ref_ns.nspname = 'public'
       and ref.relname = any($1::text[])
       and not (dep_ns.nspname = 'public' and dep.relname = any($1::text[]));`,
    [EXPECTED_OLD_TABLES]
  );
  for (const r of externalFks) {
    problems.push(`foreign key ${r.dependent_schema}.${r.dependent_table} (constraint ${r.conname}) references public.${r.references_table}, which is outside the 34-table named list`);
  }

  // 3. A column outside the 34-table list using one of the 3 named old
  // enum types (DROP TYPE would fail loudly rather than CASCADE
  // silently, since no CASCADE is used for types — but surfacing it
  // here gives a clear diagnostic before attempting the drop at all).
  const { rows: externalEnumUsers } = await client.query(
    `select att.attname as column_name, cls.relname as table_name, ns.nspname as schema_name, t.typname as enum_name
     from pg_attribute att
     join pg_class cls on cls.oid = att.attrelid
     join pg_namespace ns on ns.oid = cls.relnamespace
     join pg_type t on t.oid = att.atttypid
     where t.typname = any($1::text[])
       and t.typnamespace = 'public'::regnamespace
       and not att.attisdropped
       and not (ns.nspname = 'public' and cls.relname = any($2::text[]));`,
    [EXPECTED_OLD_ENUMS, EXPECTED_OLD_TABLES]
  );
  for (const r of externalEnumUsers) {
    problems.push(`column ${r.schema_name}.${r.table_name}.${r.column_name} uses enum public.${r.enum_name}, on a table outside the 34-table named list`);
  }

  return problems;
}

async function captureFingerprint(client) {
  const { rows: schemaRows } = await client.query(`
    select oid, nspowner::regrole::text as owner, nspacl::text as acl
    from pg_namespace where nspname = 'public';
  `);
  const { rows: defaultAclRows } = await client.query(`
    select r.rolname as defacl_role, d.defaclobjtype, d.defaclacl::text as defaclacl
    from pg_default_acl d join pg_roles r on r.oid = d.defaclrole
    where d.defaclnamespace = 'public'::regnamespace or d.defaclnamespace = 0
    order by r.rolname, d.defaclobjtype;
  `);
  const { rows: rlsAutoEnableRows } = await client.query(`
    select p.oid, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable';
  `);
  const { rows: eventTriggerRows } = await client.query(`
    select oid, evtname, evtevent, evtenabled,
      (select array_agg(x::text) from unnest(evttags) as x) as tags,
      evtfoid::regproc::text as handler
    from pg_event_trigger where evtname = 'rls_auto_enable_trigger';
  `);
  const { rows: authUsersRows } = await client.query(`select count(*)::int as c from auth.users;`);

  return {
    schemaOid: schemaRows[0]?.oid ?? null,
    schemaOwner: schemaRows[0]?.owner ?? null,
    schemaAcl: schemaRows[0]?.acl ?? null,
    defaultAcl: defaultAclRows, // full content: {defacl_role, defaclobjtype, defaclacl}[]
    rlsAutoEnableOid: rlsAutoEnableRows[0]?.oid ?? null,
    rlsAutoEnableDef: rlsAutoEnableRows[0]?.def ?? null,
    eventTriggerOid: eventTriggerRows[0]?.oid ?? null,
    eventTriggerShape: eventTriggerRows[0]
      ? { evtevent: eventTriggerRows[0].evtevent, evtenabled: eventTriggerRows[0].evtenabled, tags: eventTriggerRows[0].tags, handler: eventTriggerRows[0].handler }
      : null,
    authUsersCount: authUsersRows[0]?.c ?? null,
  };
}

function compareFingerprints(before, after) {
  let failures = 0;
  const check = (label, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.log(`FAIL  ${label} changed: before=${JSON.stringify(a)}, after=${JSON.stringify(b)}`);
      failures++;
    } else {
      console.log(`PASS  ${label} unchanged`);
    }
  };
  check("public schema oid", before.schemaOid, after.schemaOid);
  check("public schema owner", before.schemaOwner, after.schemaOwner);
  check("public schema ACL", before.schemaAcl, after.schemaAcl);
  check("pg_default_acl content for public (full role/objtype/acl tuples, not just a count)", before.defaultAcl, after.defaultAcl);
  check("rls_auto_enable() function oid", before.rlsAutoEnableOid, after.rlsAutoEnableOid);
  check("rls_auto_enable() function definition", before.rlsAutoEnableDef, after.rlsAutoEnableDef);
  check("rls_auto_enable_trigger event trigger oid", before.eventTriggerOid, after.eventTriggerOid);
  check("rls_auto_enable_trigger shape (event/enabled/tags/handler)", before.eventTriggerShape, after.eventTriggerShape);
  check("auth.users row count", before.authUsersCount, after.authUsersCount);
  return failures;
}

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl, statement_timeout: 30_000 });
  await client.connect();

  try {
    await client.query("BEGIN;");

    step("checking for dependent objects outside the named 34-table/3-enum list");
    const problems = await checkDependentObjects(client);
    if (problems.length > 0) {
      await client.query("ROLLBACK;");
      fail(`dependent object(s) found outside the named list — refusing to proceed (nothing was dropped, transaction rolled back):\n  - ${problems.join("\n  - ")}`);
    }
    ok("no dependent objects found outside the named 34-table/3-enum list (views/matviews, foreign keys, enum usage)");

    step("capturing before-fingerprint of everything Surgical Reset must preserve");
    const before = await captureFingerprint(client);
    ok(`before-fingerprint captured (public schema oid=${before.schemaOid}, rls_auto_enable oid=${before.rlsAutoEnableOid}, auth.users=${before.authUsersCount} row(s))`);

    step("running sql/surgical-reset.sql (same connection, same open transaction)");
    const sql = fs.readFileSync(SQL_FILE, "utf8");
    await client.query(sql);
    ok("surgical-reset.sql applied (not yet committed)");

    step("capturing after-fingerprint (still the same open transaction)");
    const after = await captureFingerprint(client);

    step("comparing before/after fingerprints — every preserved item must be identical");
    const fingerprintFailures = compareFingerprints(before, after);

    step("verifying every named old table is gone");
    const { rows: remainingTables } = await client.query(
      `select tablename from pg_tables where schemaname='public' and tablename = any($1::text[]);`,
      [EXPECTED_OLD_TABLES]
    );
    if (remainingTables.length > 0) {
      console.log(`FAIL  ${remainingTables.length} named old table(s) still present: ${remainingTables.map((r) => r.tablename).join(", ")}`);
    } else {
      ok(`all ${EXPECTED_OLD_TABLES.length} named old tables are gone`);
    }

    step("verifying every named old enum is gone");
    const { rows: remainingEnums } = await client.query(
      `select typname from pg_type t join pg_namespace n on n.oid=t.typnamespace
       where n.nspname='public' and t.typname = any($1::text[]);`,
      [EXPECTED_OLD_ENUMS]
    );
    if (remainingEnums.length > 0) {
      console.log(`FAIL  ${remainingEnums.length} named old enum(s) still present: ${remainingEnums.map((r) => r.typname).join(", ")}`);
    } else {
      ok(`all ${EXPECTED_OLD_ENUMS.length} named old enums are gone`);
    }

    const totalFailures = fingerprintFailures + (remainingTables.length > 0 ? 1 : 0) + (remainingEnums.length > 0 ? 1 : 0);
    console.log("");
    if (totalFailures > 0) {
      await client.query("ROLLBACK;");
      fail(`Surgical Reset was attempted, but ${totalFailures} post-condition check(s) failed — ROLLED BACK, nothing was committed.`);
    }

    await client.query("COMMIT;");
    console.log("SURGICAL RESET COMPLETE, VERIFIED, AND COMMITTED — every preserved item is unchanged, every named old object is gone.");
  } finally {
    await client.end();
  }
}

main().catch((e) => fail(e.stack || e.message));
