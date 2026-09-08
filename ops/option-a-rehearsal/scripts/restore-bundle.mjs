#!/usr/bin/env node
// Option A restore — replays a backup-bundle.mjs (v2) bundle onto a
// target database, using `pg_restore` for the actual schema+data+GRANT+
// RLS+POLICY content (see backup-bundle.mjs's header for why v1's hand-
// rolled DDL/data generator was replaced). Real, executable, hard-
// failing (`pg_restore --exit-on-error`, equivalent to `psql -v
// ON_ERROR_STOP=1`) — not narrative, not ad-hoc interactive commands.
//
// Two distinct scenarios, both supported:
//   - Restoring onto an EMPTY target (disaster recovery from nothing).
//   - Restoring an OLD-schema bundle onto a target that currently has
//     the NEW schema applied (scripts/lib/new-schema-fingerprint.mjs) —
//     the actual Option A ROLLBACK
//     scenario. Set RESTORE_ROLLBACK_FROM_NEW_SCHEMA=yes to first run
//     sql/inverse-reset-new-schema.sql (drops the 20 named new tables/
//     enums/functions explicitly — never DROP SCHEMA) before restoring,
//     so the OLD bundle's CREATE TABLE/TYPE statements land cleanly.
//
// Connection info from the environment ONLY — never a CLI flag, never
// printed.
//
//   RESTORE_DATABASE_URL             required. postgres connection string.
//   RESTORE_MODE                      required. "local" only —
//                                      RESTORE_MODE=production is
//                                      refused unconditionally; restoring
//                                      into the real project is a
//                                      separate, future, explicitly-
//                                      approved action this script does
//                                      not perform regardless of what
//                                      else is set.
//   RESTORE_BUNDLE_DIR                required. directory containing
//                                      manifest.json + the bundle's files.
//   RESTORE_ROLLBACK_FROM_NEW_SCHEMA  optional. "yes" to run the inverse
//                                      reset first (the rollback scenario).
//   RESTORE_ALLOW_NONEMPTY            optional. "yes" to restore onto a
//                                      target whose public schema already
//                                      has tables NOT accounted for by
//                                      RESTORE_ROLLBACK_FROM_NEW_SCHEMA —
//                                      default refuses, to avoid silently
//                                      clobbering an unrelated database.
//
// Stage 2I-D hardening — closes two gaps found rehearsing this script
// against a REAL production bundle for the first time (Stage 2I-C):
//   1. This script used to need `rls_auto_enable()` manually pre-created
//      on the target before running, because its pg_restore step always
//      excluded that function's own CREATE FUNCTION entry (assuming it
//      already exists — true only for the ROLLBACK-from-new-schema
//      scenario, where this project's own Surgical Reset never removed
//      it; false for a genuinely fresh, just-reset target — this
//      script's OTHER documented scenario, disaster recovery from
//      nothing). It now extracts that ONE function's definition from the
//      bundle's own dump and applies it as `CREATE OR REPLACE FUNCTION`
//      before the main restore runs — idempotent either way, sourced
//      from the bundle itself, never a separately hardcoded copy. See
//      ensureRlsAutoEnableFunctionExists() below.
//   2. This script used to need to be run AS `supabase_admin` to avoid
//      "permission denied to change default privileges" on the bundle's
//      `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` TOC
//      entries — the real production connecting role (`postgres`) is not
//      a member of `supabase_admin` and cannot act for it. It now shares
//      scripts/lib/pg-restore-runner.mjs's `restorePublicSchemaDump()` /
//      `filterRestoreToc()` — the SAME TOC-filtering already proven
//      against this exact failure mode by the production rollback
//      orchestrator's own tests — instead of this file's own, separately
//      written and less complete filter. pg_default_acl is now also
//      snapshotted before and verified byte-for-byte unchanged after
//      (scripts/lib/default-acl.mjs, shared with cutover-core.mjs /
//      rollback-core.mjs), proving the fix actually works rather than
//      merely that pg_restore stopped erroring.
// Neither fix needs RESTORE_ALLOW_NONEMPTY or a different connecting
// role/actor than whatever RESTORE_DATABASE_URL already names — this
// script now runs end-to-end, unmodified invocation, on a Supabase CLI
// stack fresh out of `supabase db reset`, as the SAME actor a real
// production rollback would use.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { parsePgTextArray } from "./lib/pg-array.mjs";
import { resolveClientTool, runClientTool, restorePublicSchemaDump } from "./lib/pg-restore-runner.mjs";
import { snapshotDefaultAcl, verifyDefaultAclUnchanged } from "./lib/default-acl.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INVERSE_RESET_SQL_FILE = path.join(__dirname, "..", "sql", "inverse-reset-new-schema.sql");

function fail(msg) {
  console.error(`ERROR ${msg}`);
  process.exit(1);
}
function step(msg) { console.log(`--- ${msg}`); }
function ok(msg) { console.log(`OK    ${msg}`); }

const databaseUrl = process.env.RESTORE_DATABASE_URL;
const mode = process.env.RESTORE_MODE;
const bundleDir = process.env.RESTORE_BUNDLE_DIR;
const rollbackFromNewSchema = process.env.RESTORE_ROLLBACK_FROM_NEW_SCHEMA === "yes";
const allowNonempty = process.env.RESTORE_ALLOW_NONEMPTY === "yes";

if (!databaseUrl) fail("RESTORE_DATABASE_URL must be set (environment only).");
if (mode !== "local") {
  fail(
    mode === "production"
      ? "RESTORE_MODE=production is refused unconditionally by this script. Restoring into the real Supabase project is a separate, future, explicitly-approved action — not something this task authorizes or this script will perform, regardless of what else is set."
      : 'RESTORE_MODE must be "local".'
  );
}
if (!bundleDir) fail("RESTORE_BUNDLE_DIR must be set.");

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch (e) {
  fail(`RESTORE_DATABASE_URL is not a parseable URL: ${e.message}`);
}
const hostname = parsedUrl.hostname.toLowerCase();
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  fail(`RESTORE_MODE=local requires a 127.0.0.1/localhost host, got "${hostname}".`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function readStatements(name) {
  const p = path.join(bundleDir, name);
  if (!fs.existsSync(p)) fail(`bundle is missing required file: ${name}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ---------------------------------------------------------------------
// Stage 2I-D: ensures rls_auto_enable() exists on the target BEFORE the
// main restore runs, using the definition captured in THIS bundle's own
// dump — never a separately hardcoded copy. Idempotent (CREATE OR
// REPLACE): safe whether the function already exists (the ROLLBACK-from-
// new-schema scenario, where Surgical Reset never removed it) or
// genuinely doesn't yet (a fresh, just-reset target — disaster recovery
// from nothing). This is what lets the main restore's TOC filter keep
// excluding the function's own bare (non-idempotent) CREATE FUNCTION
// entry without that exclusion silently assuming a precondition nobody
// actually guaranteed.
// ---------------------------------------------------------------------
async function ensureRlsAutoEnableFunctionExists(client, pgRestoreTool, dumpPath, bundleDir) {
  const { stdout: tocText } = await runClientTool(pgRestoreTool, ["--list", dumpPath], bundleDir);
  const functionLine = tocText.split("\n").find((line) => /\bFUNCTION\s+public\s+rls_auto_enable\(/.test(line));
  if (!functionLine) {
    throw new Error("bundle's public_schema.dump has no rls_auto_enable() FUNCTION entry — refusing to fabricate a definition that isn't sourced from the bundle itself.");
  }
  const tocPath = path.join(bundleDir, ".restore-rls-auto-enable-toc.txt");
  const outSqlPath = path.join(bundleDir, ".restore-rls-auto-enable.sql");
  try {
    fs.writeFileSync(tocPath, `${functionLine}\n`);
    await runClientTool(pgRestoreTool, ["--use-list", tocPath, "-f", outSqlPath, dumpPath], bundleDir);
    let sql = fs.readFileSync(outSqlPath, "utf8");
    // pg_restore -f always prepends two things to its plain-SQL
    // extraction, neither of which this call wants applied to the
    // shared, long-lived `client` connection the rest of this script
    // keeps using afterward:
    //   1. Postgres 17's `\restrict <token>` / `\unrestrict <token>`
    //      psql-ONLY meta-commands (a new pg17 dump/restore-session
    //      security feature) — `client.query()` is a raw SQL protocol
    //      connection, not psql, and errors immediately on the leading
    //      backslash ("syntax error at or near \"").
    //   2. A preamble of top-level `SET ...;` statements plus `SELECT
    //      pg_catalog.set_config('search_path', '', false);` — found by
    //      actually running this, not by inspection: that set_config
    //      call's third argument (is_local) is `false`, meaning it
    //      applies to the whole SESSION, not just this one
    //      client.query() call, so it silently emptied `client`'s
    //      search_path for every later statement on this same
    //      connection — the very next step's unqualified `EXECUTE
    //      FUNCTION handle_new_user()` then failed with "function
    //      handle_new_user() does not exist" despite the function
    //      genuinely existing, because it could no longer be found
    //      without explicit schema-qualification. (`SET row_security =
    //      off;` in the same preamble is equally dangerous left
    //      standing.) Stripped by anchoring to column 0 — the function
    //      body's own internal `SET search_path TO 'pg_catalog'` line is
    //      indented, not a top-level statement, so it is untouched.
    //      Comments are left alone; SQL tolerates them.
    sql = sql
      .split("\n")
      .filter((line) => !line.startsWith("\\"))
      .filter((line) => !/^SET\s+\S/.test(line))
      .filter((line) => !/^SELECT\s+pg_catalog\.set_config\(/.test(line))
      .join("\n");
    // pg_dump always emits a bare `CREATE FUNCTION` (never OR REPLACE)
    // for a fresh dump — rewriting it is what makes this idempotent.
    if (!/\bCREATE FUNCTION\b/.test(sql)) {
      throw new Error(`extracted rls_auto_enable() TOC entry did not contain a CREATE FUNCTION statement as expected:\n${sql}`);
    }
    sql = sql.replace(/\bCREATE FUNCTION\b/, "CREATE OR REPLACE FUNCTION");
    await client.query(sql);
  } finally {
    fs.rmSync(tocPath, { force: true });
    fs.rmSync(outSqlPath, { force: true });
  }
}

async function main() {
  // -------------------------------------------------------------
  // 1. Checksum manifest FIRST, before any statement is trusted or any
  // connection is made.
  // -------------------------------------------------------------
  step("verifying bundle manifest checksums");
  const manifestPath = path.join(bundleDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail(`RESTORE_BUNDLE_DIR has no manifest.json: ${bundleDir}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail("manifest.json has no files listed — refusing to restore from an empty manifest");
  }
  for (const f of manifest.files) {
    const p = path.join(bundleDir, f.name);
    if (!fs.existsSync(p)) fail(`manifest names "${f.name}" which does not exist in the bundle directory`);
    const actual = sha256File(p);
    if (actual !== f.sha256) fail(`checksum mismatch on "${f.name}": manifest says ${f.sha256}, actual is ${actual} — refusing to restore from a bundle that doesn't match its own manifest`);
  }
  ok(`all ${manifest.files.length} bundle file(s) match their recorded sha256`);

  const inventory = JSON.parse(fs.readFileSync(path.join(bundleDir, "inventory.json"), "utf8"));

  const client = new pg.Client({ connectionString: databaseUrl, statement_timeout: 60_000 });
  await client.connect();

  try {
    // ---------------------------------------------------------------
    // 2. Rollback scenario: drop the new schema's named objects first.
    // ---------------------------------------------------------------
    if (rollbackFromNewSchema) {
      step("RESTORE_ROLLBACK_FROM_NEW_SCHEMA=yes — running sql/inverse-reset-new-schema.sql first");
      const inverseSql = fs.readFileSync(INVERSE_RESET_SQL_FILE, "utf8");
      await client.query(inverseSql);
      ok("inverse-reset-new-schema.sql applied — the 20 named new tables/enums/functions and their migration journal are gone");
    }

    // ---------------------------------------------------------------
    // 3. Refuse a non-empty target unless explicitly overridden.
    // ---------------------------------------------------------------
    const { rows: existingTables } = await client.query(`select tablename from pg_tables where schemaname='public';`);
    if (existingTables.length > 0 && !allowNonempty) {
      fail(
        `target public schema still has ${existingTables.length} table(s) ` +
        `(${existingTables.map((r) => r.tablename).join(", ")}) after the pre-restore step — refusing to restore onto ` +
        `a non-empty target. Set RESTORE_ALLOW_NONEMPTY=yes to override deliberately.`
      );
    }

    // ---------------------------------------------------------------
    // pg_default_acl baseline — captured before this step touches
    // anything, verified byte-for-byte unchanged at the very end. Same
    // shared fingerprint (scripts/lib/default-acl.mjs) cutover-core.mjs
    // and rollback-core.mjs already use — proves the TOC filter below
    // actually keeps default-privilege registrations untouched, not
    // merely that pg_restore stopped erroring on them.
    // ---------------------------------------------------------------
    const defaultAclBefore = await snapshotDefaultAcl(client);

    // ---------------------------------------------------------------
    // 4. Ensure rls_auto_enable() exists (Stage 2I-D — see
    // ensureRlsAutoEnableFunctionExists()'s own comment above: sourced
    // from THIS bundle's own dump, idempotent, no manual pre-create step
    // needed regardless of whether the target already has it).
    // ---------------------------------------------------------------
    step("ensuring rls_auto_enable() exists (idempotent, sourced from this bundle's own dump)");
    const dumpPath = path.join(bundleDir, "public_schema.dump");
    const pgRestore = await resolveClientTool("pg_restore");
    await ensureRlsAutoEnableFunctionExists(client, pgRestore, dumpPath, bundleDir);
    ok("rls_auto_enable() present on the target, matching this bundle's own captured definition");

    // ---------------------------------------------------------------
    // 5. pg_restore the custom-format dump — schema, data, GRANTs, RLS,
    // POLICIES, owners, comments, all as pg_dump itself captured them.
    // Uses the SAME shared TOC filter the production rollback
    // orchestrator's own tests already proved against this exact target
    // shape (scripts/lib/pg-restore-runner.mjs's filterRestoreToc/
    // restorePublicSchemaDump) instead of a separate, less complete
    // filter — it excludes `CREATE SCHEMA public` (the target's public
    // schema already exists, Surgical Reset/Inverse Reset never drop
    // it), the bare `CREATE FUNCTION rls_auto_enable()` entry (just
    // ensured above, idempotently, so this raw non-`OR REPLACE` entry
    // would otherwise collide with itself), AND — the Stage 2I-C finding
    // this closes — the bundle's `ALTER DEFAULT PRIVILEGES FOR ROLE
    // supabase_admin ...` entries, which the real production connecting
    // role (`postgres`, not a member of `supabase_admin`) cannot execute
    // and does not need to: those are default-privilege REGISTRATIONS
    // for future objects, not schema content, and the target's own
    // pre-existing rows for `supabase_admin` are untouched by their
    // absence here (proven by the pg_default_acl check below, not merely
    // assumed). Connection info flows through libpq's own PG*
    // environment variables (pg-restore-runner.mjs's pgEnvFromUrl), never
    // a CLI argument — `forLocalTestTarget: true` because this script is
    // local-only (its own host check above already guarantees that).
    // ---------------------------------------------------------------
    step("restoring public_schema.dump via pg_restore (shared TOC filter: public schema + rls_auto_enable() + supabase_admin default-ACL entries)");
    await restorePublicSchemaDump(databaseUrl, bundleDir, { forLocalTestTarget: true });
    ok("public_schema.dump restored (schema + data + GRANTs + RLS + POLICIES + owners, minus the entries the target either already has or cannot — and does not need to — replay)");

    // ---------------------------------------------------------------
    // 6. Cross-schema artifacts — auth.users trigger + event triggers.
    // Wrapped in its own explicit transaction (Stage 2I-D — matching
    // rollback-core.mjs's own already-fixed pattern): the un-wrapped
    // per-statement loop this used to be left one statement committed
    // and the other not on a failure between them, silently, with no
    // transactional undo — "no partial restore on error" now actually
    // holds here too, not just in the rollback path.
    // ---------------------------------------------------------------
    step("restoring auth.users trigger + event triggers (own explicit transaction)");
    const funcStatements = readStatements("functions_and_triggers.statements.json");
    await client.query("BEGIN");
    try {
      for (const stmt of funcStatements) {
        await client.query(stmt);
      }
      await client.query("COMMIT");
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // connection may already be broken; nothing more to undo either way
      }
      throw e;
    }
    ok(`${funcStatements.length} statement(s) applied atomically`);

    // ---------------------------------------------------------------
    // 6. Post-restore verification against the bundle's own
    // inventory.json — tables, row counts, functions, auth trigger,
    // event triggers, enums, RLS-enabled state per table, and full
    // policy definitions (not just a count).
    // ---------------------------------------------------------------
    step("post-restore verification against the bundle's inventory.json");
    let verifyFailures = 0;
    const vfail = (msg) => { console.log(`FAIL  ${msg}`); verifyFailures++; };
    const vpass = (msg) => console.log(`PASS  ${msg}`);

    const { rows: restoredTables } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
    const restoredTableNames = restoredTables.map((r) => r.tablename).sort();
    const expectedTableNames = [...inventory.tables].sort();
    if (JSON.stringify(restoredTableNames) !== JSON.stringify(expectedTableNames)) {
      vfail(`restored table list differs from inventory.json: got ${JSON.stringify(restoredTableNames)}, expected ${JSON.stringify(expectedTableNames)}`);
    } else {
      vpass(`all ${expectedTableNames.length} table(s) from inventory.json are present, no extras`);
    }

    let rowCountFailures = 0;
    for (const table of inventory.tables) {
      const { rows } = await client.query(`select count(*) as c from public."${table}";`);
      const actual = Number(rows[0].c);
      const expected = inventory.rowCounts[table];
      if (actual !== expected) { vfail(`public.${table} has ${actual} row(s) after restore, expected ${expected}`); rowCountFailures++; }
    }
    if (rowCountFailures === 0) vpass("every table's row count matches inventory.json");

    if (inventory.rlsState) {
      let rlsFailures = 0;
      for (const table of inventory.tables) {
        const { rows } = await client.query(
          `select relrowsecurity, relforcerowsecurity from pg_class where oid = format('public.%I', $1::text)::regclass;`,
          [table]
        );
        const expected = inventory.rlsState[table];
        const actual = { enabled: rows[0]?.relrowsecurity ?? null, forced: rows[0]?.relforcerowsecurity ?? null };
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          vfail(`public.${table} RLS state after restore is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
          rlsFailures++;
        }
      }
      if (rlsFailures === 0) vpass(`RLS enabled/forced state matches inventory.json on all ${inventory.tables.length} table(s)`);
    } else {
      console.log("INFO  bundle's inventory.json has no rlsState field (older bundle format) — RLS state not verified this run");
    }

    if (Array.isArray(inventory.policies)) {
      const { rows: restoredPolicies } = await client.query(`
        select tablename, policyname, cmd, roles, qual, with_check
        from pg_policies where schemaname='public' order by tablename, policyname;
      `);
      // parsePgTextArray, not `[...(r.roles || [])]`: node-postgres has no
      // type parser registered for `name[]` (pg_policies.roles is one),
      // so it comes back as the raw Postgres text literal
      // ("{authenticated,anon}"), not a parsed JS array — spreading a
      // STRING splits it into individual characters, not role names.
      // Found while building fixtures/new-schema-rls-policies.json for
      // the Option A cutover tooling (scripts/lib/pg-array.mjs's own
      // comment has the full story); see test/restore-roles-array.test.mjs
      // for a test that fails against the old `[...r.roles]` pattern and
      // passes with this one.
      const normalize = (rows) => rows.map((r) => ({ ...r, roles: parsePgTextArray(r.roles || []).sort() }));
      const restoredNorm = JSON.stringify(normalize(restoredPolicies));
      const expectedNorm = JSON.stringify(normalize(inventory.policies));
      if (restoredNorm !== expectedNorm) {
        vfail(`restored policy set differs from inventory.json (full definitions, not just count) — restored ${restoredPolicies.length}, expected ${inventory.policies.length}`);
      } else {
        vpass(`all ${inventory.policies.length} policy definition(s) match inventory.json exactly (not just a count)`);
      }
    } else {
      const { rows: policyCountRows } = await client.query(`select count(*) as c from pg_policies where schemaname='public';`);
      if (Number(policyCountRows[0].c) !== inventory.policyCount) {
        vfail(`restored policy_count is ${policyCountRows[0].c}, inventory.json says ${inventory.policyCount}`);
      } else {
        vpass(`policy_count matches inventory.json (${inventory.policyCount}) — older bundle format, full definitions not available to compare`);
      }
    }

    const { rows: restoredFuncs } = await client.query(`
      select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by proname;
    `);
    const restoredFuncNames = restoredFuncs.map((r) => r.proname).sort();
    const expectedFuncNames = [...inventory.functions].sort();
    if (JSON.stringify(restoredFuncNames) !== JSON.stringify(expectedFuncNames)) {
      vfail(`restored function list differs from inventory.json: got ${JSON.stringify(restoredFuncNames)}, expected ${JSON.stringify(expectedFuncNames)}`);
    } else {
      vpass(`all ${expectedFuncNames.length} function(s) from inventory.json are present, no extras`);
    }

    const { rows: restoredEnums } = await client.query(`
      select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid=t.typnamespace
      where n.nspname='public' group by t.typname order by t.typname;
    `);
    const restoredEnumsNorm = JSON.stringify(restoredEnums.map((r) => ({ name: r.typname, labels: r.labels })));
    const expectedEnumsNorm = JSON.stringify([...inventory.enums].sort((a, b) => a.name.localeCompare(b.name)));
    if (restoredEnumsNorm !== expectedEnumsNorm) {
      vfail(`restored enum set differs from inventory.json: got ${restoredEnumsNorm}, expected ${expectedEnumsNorm}`);
    } else {
      vpass(`all ${inventory.enums.length} enum(s)/value(s) match inventory.json exactly`);
    }

    const { rows: restoredAuthTrigs } = await client.query(`
      select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by tgname;
    `);
    const restoredAuthTrigNames = restoredAuthTrigs.map((r) => r.tgname).sort();
    const expectedAuthTrigNames = [...inventory.authUsersTriggers].sort();
    if (JSON.stringify(restoredAuthTrigNames) !== JSON.stringify(expectedAuthTrigNames)) {
      vfail(`restored auth.users trigger list differs from inventory.json: got ${JSON.stringify(restoredAuthTrigNames)}, expected ${JSON.stringify(expectedAuthTrigNames)}`);
    } else {
      vpass("auth.users trigger(s) match inventory.json");
    }

    // Subset check, not exact-set equality — a real finding from
    // testing this against the actual local Supabase CLI stack: the
    // live target can carry event triggers this project never created
    // and inventory.json never recorded (issue_pg_cron_access,
    // issue_pg_net_access, issue_pg_graphql_access,
    // issue_graphql_placeholder, pgrst_ddl_watch, pgrst_drop_watch —
    // all Supabase-platform/extension-owned, appearing whenever those
    // extensions get created on the project, which can happen at any
    // point independent of this project's own migrations or of when a
    // given backup bundle was taken). Neither Surgical Reset nor
    // Inverse Reset ever touches an extension, so their event triggers
    // are correctly out of scope for a public-schema-only rollback to
    // restore, preserve, or fail on. What this check actually needs to
    // guarantee is narrower and still real: every event trigger the
    // bundle DID record (this project's own — rls_auto_enable()'s event
    // trigger, by whatever name it actually carries: `ensure_rls` in
    // real production, `rls_auto_enable_trigger` in this project's own
    // local fixtures — inventory.json records the real captured name,
    // never a hardcoded assumption) is present after restore. An extra,
    // unrecorded, platform-owned event trigger appearing is not a
    // regression.
    const { rows: restoredEventTrigs } = await client.query(`select evtname from pg_event_trigger order by evtname;`);
    const restoredEventTrigNames = restoredEventTrigs.map((r) => r.evtname).sort();
    const expectedEventTrigNames = [...inventory.eventTriggers].sort();
    const missingEventTrigs = expectedEventTrigNames.filter((n) => !restoredEventTrigNames.includes(n));
    if (missingEventTrigs.length > 0) {
      vfail(`event trigger(s) recorded in inventory.json are missing after restore: ${missingEventTrigs.join(", ")} (present: ${restoredEventTrigNames.join(", ")})`);
    } else {
      const extra = restoredEventTrigNames.filter((n) => !expectedEventTrigNames.includes(n));
      vpass(`all ${expectedEventTrigNames.length} event trigger(s) from inventory.json are present${extra.length ? ` (plus ${extra.length} platform/extension-owned one(s) not recorded by the bundle and out of its scope: ${extra.join(", ")})` : ""}`);
    }

    // Stage 2I-D: proves the shared TOC filter's exclusion of the
    // bundle's supabase_admin DEFAULT ACL entries actually left
    // pg_default_acl untouched, byte-for-byte — not merely that
    // pg_restore stopped erroring on them.
    try {
      await verifyDefaultAclUnchanged(client, defaultAclBefore);
      vpass("pg_default_acl unchanged — the filtered restore never touched default-privilege registrations");
    } catch (e) {
      vfail(e.message);
    }

    console.log("");
    if (verifyFailures > 0) {
      fail(`${verifyFailures} post-restore verification check(s) failed — the restore ran, but the result does not match the bundle it was restored from.`);
    }
    console.log("RESTORE COMPLETE AND VERIFIED — every post-restore check (structure, data, RLS, policies, functions, triggers, enums) matches the bundle's own inventory.json.");
  } finally {
    await client.end();
  }
}

main().catch((e) => fail(e.stack || e.message));
