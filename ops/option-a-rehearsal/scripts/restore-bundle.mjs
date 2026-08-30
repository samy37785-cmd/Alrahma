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
//     the NEW 20-table schema applied — the actual Option A ROLLBACK
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

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";

const execFileAsync = promisify(execFile);
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
// pg_restore/psql resolution — PATH first, disposable-Docker-for-the-
// binary-only fallback second. Same discipline as backup-bundle.mjs.
// ---------------------------------------------------------------------
async function findOnPath(bin) {
  try { await execFileAsync(bin, ["--version"]); return true; } catch { return false; }
}
async function resolveClientTool(bin) {
  if (await findOnPath(bin)) return { kind: "path", bin };
  console.log(`INFO  "${bin}" not found on PATH — falling back to a disposable Docker container for the binary only.`);
  return { kind: "docker", bin };
}
function dockerRewriteUrl(url) {
  const u = new URL(url);
  u.hostname = "host.docker.internal"; // restore is local-only, always rewrite for the docker path
  return u.toString();
}
async function runClientTool(tool, args, bindMountDir) {
  const effectiveArgs = tool.kind === "docker" ? args.map((a) => (a === databaseUrl ? dockerRewriteUrl(a) : a)) : args;
  if (tool.kind === "path") {
    return execFileAsync(tool.bin, effectiveArgs, { maxBuffer: 1024 * 1024 * 256 });
  }
  const dockerArgs = [
    "run", "--rm",
    "--add-host=host.docker.internal:host-gateway",
    "-v", `${path.resolve(bindMountDir)}:/data`,
    "postgres:17", tool.bin,
    ...effectiveArgs.map((a) => (path.resolve(a).startsWith(path.resolve(bindMountDir)) ? `/data/${path.basename(a)}` : a)),
  ];
  return execFileAsync("docker", dockerArgs, { maxBuffer: 1024 * 1024 * 256 });
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
    // 4. pg_restore the custom-format dump — schema, data, GRANTs, RLS,
    // POLICIES, owners, comments, all as pg_dump itself captured them.
    //
    // pg_dump -n public includes a `CREATE SCHEMA public;` (and a
    // `COMMENT ON SCHEMA public ...`) entry — found by actually running
    // this restore, not assumed: it fails with `schema "public" already
    // exists` against any target this project ever restores onto,
    // because Surgical Reset / Inverse Reset deliberately never drop
    // `public` itself. Same reason `rls_auto_enable()` is excluded too
    // — found the same way, by actually running this and hitting
    // `function "rls_auto_enable" already exists`: it's Supabase-
    // preexisting infrastructure Surgical Reset/Inverse Reset both
    // deliberately never touch, so it's still live in the target under
    // rollback exactly as it was in the source when this bundle was
    // taken — restoring pg_dump's plain (non-`OR REPLACE`) `CREATE
    // FUNCTION` for it would collide with itself. (Its event trigger
    // does NOT need the same exclusion: that's restored separately, via
    // functions_and_triggers.statements.json's own `DROP ... IF EXISTS`
    // + `CREATE` pair, which is safely idempotent against an
    // already-existing trigger.) Both filtered out via pg_restore's own
    // `--list`/`--use-list` mechanism (the standard, correct way to
    // selectively skip specific TOC entries from a custom-format dump)
    // rather than any text-based SQL editing.
    // ---------------------------------------------------------------
    step("restoring public_schema.dump via pg_restore (filtering CREATE SCHEMA public + rls_auto_enable())");
    const pgRestore = await resolveClientTool("pg_restore");
    const dumpPath = path.join(bundleDir, "public_schema.dump");
    const { stdout: tocText } = await runClientTool(pgRestore, ["--list", dumpPath], bundleDir);
    const filteredToc = tocText
      .split("\n")
      .filter((line) => !/\bSCHEMA\s*-?\s*public\b/.test(line))
      .filter((line) => !/\bFUNCTION\s+public\s+rls_auto_enable\(/.test(line))
      .join("\n");
    const tocPath = path.join(bundleDir, ".restore-toc.filtered.txt");
    fs.writeFileSync(tocPath, filteredToc);
    await runClientTool(pgRestore, ["--dbname", databaseUrl, "--exit-on-error", "--single-transaction", "--use-list", tocPath, dumpPath], bundleDir);
    fs.rmSync(tocPath, { force: true });
    ok("public_schema.dump restored (schema + data + GRANTs + RLS + POLICIES + owners, minus the public-schema-creation entry)");

    // ---------------------------------------------------------------
    // 5. Cross-schema artifacts — auth.users trigger + event triggers.
    // ---------------------------------------------------------------
    step("restoring auth.users trigger + event triggers");
    const funcStatements = readStatements("functions_and_triggers.statements.json");
    for (const stmt of funcStatements) {
      await client.query(stmt);
    }
    ok(`${funcStatements.length} statement(s) applied`);

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
      const normalize = (rows) => rows.map((r) => ({ ...r, roles: [...(r.roles || [])].sort() }));
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
    // bundle DID record (this project's own — rls_auto_enable_trigger)
    // is present after restore. An extra, unrecorded, platform-owned
    // event trigger appearing is not a regression.
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
