#!/usr/bin/env node
// Option A backup bundle — theoretically Remote-valid, never run against
// Remote during this task.
//
// v2: replaces v1's hand-rolled catalog-introspection DDL/data generator
// with a REAL `pg_dump`. A code review of v1 found it never captured
// RLS-enabled state, CREATE POLICY definitions, replayable table/
// function GRANTs, object owners, or comments — `pg_get_functiondef()`/
// `pg_get_constraintdef()` etc. reconstruct table/function *shape*, not
// the full authoritative dump `pg_dump` already produces. `pg_dump` is
// a network client: identical whether it targets 127.0.0.1:54322 or a
// real db.<ref>.supabase.co:5432 — this does NOT reintroduce the
// rejected `docker exec`-into-the-target's-own-container pattern (that
// only works against a container you already have shell access to;
// this tool never assumes the target is a container at all).
//
// Connection info comes from the environment ONLY — never a CLI flag,
// never printed.
//
//   BACKUP_DATABASE_URL    required. postgres connection string.
//   BACKUP_MODE             required. "local" or "production" — same
//                            host-safety/SSL policy as
//                            production-preflight-gate.mjs.
//   BACKUP_PROJECT_REF      required. Never inferred/guessed from the
//                            connection string — an explicit operator-
//                            supplied value, recorded in the manifest so
//                            a gate check can later confirm a bundle
//                            was actually produced against the project
//                            it claims to be.
//   BACKUP_OUT_DIR          optional, default "./out/backup-bundle".
//
// pg_dump/pg_restore resolution: tries the `pg_dump`/`pg_restore`
// binaries on PATH first; if not found (ENOENT), falls back to
// `docker run --rm postgres:17 pg_dump/pg_restore ...` — this uses
// Docker ONLY to obtain the client binary (this dev host has neither
// tool on PATH at all, confirmed), never to exec into the target's own
// container. When falling back to the Docker path against a
// 127.0.0.1/localhost target, the hostname is rewritten to
// `host.docker.internal` for that invocation only (Docker's own DNS
// name for "the host running Docker") — a real network host, not a
// container name; a real `db.<ref>.supabase.co` target needs no
// rewriting since containers already have outbound internet access.
//
// Output (all files land in BACKUP_OUT_DIR):
//   public_schema.dump           pg_dump --format=custom --schema=public
//                                 — the actual restorable artifact
//                                 (schema + data + GRANTs + RLS +
//                                 POLICIES + owners + comments, exactly
//                                 what pg_dump itself captures)
//   public_schema_readable.sql   pg_dump --format=plain --schema=public
//                                 — human-readable companion for review/
//                                 diffing; NOT used by restore-bundle.mjs
//   functions_and_triggers.sql   + .statements.json — the auth.users
//                                 trigger + every event trigger, by
//                                 pg_get_triggerdef()/introspection
//                                 (pg_dump -n public cannot capture
//                                 either: one lives on a table in a
//                                 different schema, the other is
//                                 database-level, not schema-scoped —
//                                 same split Phase 2's
//                                 02-dump.sh/02b-dump-cross-schema-
//                                 artifacts.sh already proved necessary)
//   inventory.json                table/row-count/function/trigger/
//                                 enum/policy snapshot, used by
//                                 restore-bundle.mjs for post-restore
//                                 verification
//   manifest.json                 {generatedAt, sourceMode, projectRef,
//                                 files: [{name, size, sha256}, ...]}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);

function fail(msg) {
  console.error(`ERROR ${msg}`);
  process.exit(1);
}

const databaseUrl = process.env.BACKUP_DATABASE_URL;
const mode = process.env.BACKUP_MODE;
const projectRef = process.env.BACKUP_PROJECT_REF;
const outDir = process.env.BACKUP_OUT_DIR || path.join(process.cwd(), "out", "backup-bundle");

if (!databaseUrl) fail("BACKUP_DATABASE_URL must be set (read from the environment only — never pass this on the command line).");
if (mode !== "local" && mode !== "production") fail('BACKUP_MODE must be "local" or "production".');
if (!projectRef) fail("BACKUP_PROJECT_REF must be set explicitly (never inferred from the connection string).");

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch (e) {
  fail(`BACKUP_DATABASE_URL is not a parseable URL: ${e.message}`);
}
const hostname = parsedUrl.hostname.toLowerCase();
const isLocalHost = hostname === "127.0.0.1" || hostname === "localhost";

const clientConfig = { connectionString: databaseUrl, statement_timeout: 60_000 };
if (mode === "local") {
  if (!isLocalHost) fail(`BACKUP_MODE=local requires a 127.0.0.1/localhost host, got "${hostname}".`);
} else {
  if (isLocalHost || hostname === "0.0.0.0") fail("BACKUP_MODE=production refuses a local host.");
  const directMatch = /^db\.[a-z0-9]+\.supabase\.co$/.test(hostname);
  const isPooler = hostname.endsWith(".pooler.supabase.com");
  if (!directMatch && !isPooler) fail(`BACKUP_MODE=production requires a real Supabase hostname, got "${hostname}".`);
  clientConfig.ssl = { rejectUnauthorized: true };
}

fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------
// pg_dump/pg_restore resolution — PATH first, disposable-Docker-for-
// the-binary-only fallback second. Never docker exec into anything.
// ---------------------------------------------------------------------
async function findOnPath(bin) {
  try {
    await execFileAsync(bin, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function resolveClientTool(bin) {
  if (await findOnPath(bin)) {
    return { kind: "path", bin };
  }
  console.log(`INFO  "${bin}" not found on PATH — falling back to a disposable Docker container for the binary only (never docker exec into the target's own container).`);
  return { kind: "docker", bin };
}

function dockerRewriteUrl(url) {
  if (!isLocalHost) return url; // real hostnames are reachable from inside a container unchanged
  const u = new URL(url);
  u.hostname = "host.docker.internal";
  return u.toString();
}

async function runClientTool(tool, args, { stdout } = {}) {
  const effectiveArgs = tool.kind === "docker" ? args.map((a) => (a === databaseUrl ? dockerRewriteUrl(a) : a)) : args;
  if (tool.kind === "path") {
    const { stdout: out } = await execFileAsync(tool.bin, effectiveArgs, { maxBuffer: 1024 * 1024 * 256 });
    if (stdout) fs.writeFileSync(stdout, out);
    return;
  }
  // Docker fallback: bind-mount outDir so pg_dump's -f can write directly
  // into it, add host-gateway mapping (required on Linux; harmless and
  // redundant with Docker Desktop's built-in DNS on Windows/Mac).
  const dockerArgs = [
    "run", "--rm",
    "--add-host=host.docker.internal:host-gateway",
    "-v", `${path.resolve(outDir)}:/out`,
    "postgres:17", tool.bin,
    ...effectiveArgs.map((a) => (path.resolve(a).startsWith(path.resolve(outDir)) ? `/out/${path.basename(a)}` : a)),
  ];
  const { stdout: out } = await execFileAsync("docker", dockerArgs, { maxBuffer: 1024 * 1024 * 256 });
  if (stdout) fs.writeFileSync(stdout, out);
}

async function main() {
  const files = []; // { name, absPath }

  const pgDump = await resolveClientTool("pg_dump");

  // -------------------------------------------------------------
  // 1. public_schema.dump — custom format, the real restorable
  // artifact. Deliberately no --no-owner/--no-privileges: the whole
  // point of switching to pg_dump was to stop losing owners/GRANTs/RLS/
  // policies, so none of that is stripped here.
  // -------------------------------------------------------------
  const customDumpPath = path.join(outDir, "public_schema.dump");
  await runClientTool(pgDump, ["--format=custom", "--schema=public", "-f", customDumpPath, databaseUrl]);
  files.push({ name: "public_schema.dump", absPath: customDumpPath });

  // -------------------------------------------------------------
  // 2. public_schema_readable.sql — plain format, human-readable
  // companion for review/diffing. NOT used by restore-bundle.mjs.
  // -------------------------------------------------------------
  const readableDumpPath = path.join(outDir, "public_schema_readable.sql");
  await runClientTool(pgDump, ["--format=plain", "--schema=public", "-f", readableDumpPath, databaseUrl]);
  files.push({ name: "public_schema_readable.sql", absPath: readableDumpPath });

  // -------------------------------------------------------------
  // 3. Cross-schema artifacts pg_dump -n public cannot capture: the
  // auth.users trigger (lives on a table in a different schema) and
  // every event trigger (database-level, not schema-scoped). Plain
  // catalog introspection — unchanged from v1, since this part was
  // never in question.
  // -------------------------------------------------------------
  const client = new pg.Client(clientConfig);
  await client.connect();
  let enumRows, tableRows, funcRows;
  try {
    await client.query("BEGIN READ ONLY;");
    await client.query("SET LOCAL statement_timeout = '60s';");

    const { rows: authTrigRows } = await client.query(`
      select tgname, pg_get_triggerdef(oid) as def
      from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
    `);
    // Round 2 fix (found by actually running the full rollback proof
    // against the real local Supabase stack, not by inspection): scope
    // this to event triggers OWNED BY `postgres` only. Unfiltered, this
    // query also captures Supabase-platform event triggers
    // (issue_pg_cron_access, issue_pg_graphql_access, pgrst_ddl_watch,
    // etc. — all owned by `supabase_admin`), and replaying their
    // `drop event trigger`/`create event trigger` pair later as
    // `postgres` fails outright ("must be owner of event trigger ...")
    // — `postgres` cannot even drop an object it doesn't own, let alone
    // recreate it. Those platform event triggers are not this project's
    // to back up or restore in the first place (same reasoning as
    // never touching an extension in sql/surgical-reset.sql /
    // sql/inverse-reset-new-schema.sql) — `rls_auto_enable_trigger` is
    // the only event trigger this project's own tooling has ever
    // created, and it is the only one owned by `postgres`.
    const { rows: eventTrigDefs } = await client.query(`
      select evtname, evtevent, evtfoid::regproc::text as handler_function,
        (select array_agg(x::text) from unnest(evttags) as x) as tags
      from pg_event_trigger
      where evtowner::regrole::text = 'postgres';
    `);

    let funcsSql = `-- auth.users trigger + event triggers, generated by backup-bundle.mjs (pg_dump -n public cannot capture either)\n\n`;
    const funcStatements = [];
    for (const t of authTrigRows) {
      const dropStmt = `drop trigger if exists ${t.tgname} on auth.users`;
      funcsSql += `${dropStmt};\n${t.def};\n\n`;
      funcStatements.push(dropStmt, t.def);
    }
    for (const et of eventTrigDefs) {
      const dropStmt = `drop event trigger if exists ${et.evtname}`;
      const tagsClause = et.tags && et.tags.length ? ` when tag in (${et.tags.map((t) => `'${t}'`).join(",")})` : "";
      const createStmt = `create event trigger ${et.evtname} on ${et.evtevent}${tagsClause} execute function ${et.handler_function}()`;
      funcsSql += `${dropStmt};\n${createStmt};\n\n`;
      funcStatements.push(dropStmt, createStmt);
    }
    const funcsPath = path.join(outDir, "functions_and_triggers.sql");
    fs.writeFileSync(funcsPath, funcsSql);
    files.push({ name: "functions_and_triggers.sql", absPath: funcsPath });
    const funcsStatementsPath = path.join(outDir, "functions_and_triggers.statements.json");
    fs.writeFileSync(funcsStatementsPath, JSON.stringify(funcStatements, null, 2));
    files.push({ name: "functions_and_triggers.statements.json", absPath: funcsStatementsPath });

    // -------------------------------------------------------------
    // 4. inventory.json — used by restore-bundle.mjs for post-restore
    // verification. Now includes per-table RLS-enabled state and full
    // policy definitions (not just a count), since the whole point of
    // this rewrite is to actually prove RLS/policies round-trip.
    // -------------------------------------------------------------
    const { rows: enumRowsQ } = await client.query(`
      select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' group by t.typname order by t.typname;
    `);
    enumRows = enumRowsQ;
    const { rows: tableRowsQ } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
    tableRows = tableRowsQ;
    const rowCounts = {};
    const rlsState = {};
    for (const { tablename } of tableRows) {
      const { rows } = await client.query(`select count(*) as c from public."${tablename}";`);
      rowCounts[tablename] = Number(rows[0].c);
      const { rows: relRows } = await client.query(
        `select relrowsecurity, relforcerowsecurity from pg_class where oid = format('public.%I', $1::text)::regclass;`,
        [tablename]
      );
      rlsState[tablename] = { enabled: relRows[0]?.relrowsecurity ?? null, forced: relRows[0]?.relforcerowsecurity ?? null };
    }
    const { rows: policyRows } = await client.query(`
      select schemaname, tablename, policyname, cmd, roles, qual, with_check
      from pg_policies where schemaname='public' order by tablename, policyname;
    `);
    const { rows: funcRowsQ } = await client.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' order by p.proname;
    `);
    funcRows = funcRowsQ;

    const inventory = {
      generatedAt: new Date().toISOString(),
      sourceMode: mode,
      projectRef,
      tables: tableRows.map((t) => t.tablename),
      rowCounts,
      rlsState,
      policies: policyRows,
      policyCount: policyRows.length,
      enums: enumRows.map((e) => ({ name: e.typname, labels: e.labels })),
      functions: funcRows.map((f) => f.proname),
      eventTriggers: eventTrigDefs.map((e) => e.evtname),
      authUsersTriggers: authTrigRows.map((t) => t.tgname),
    };
    const inventoryPath = path.join(outDir, "inventory.json");
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
    files.push({ name: "inventory.json", absPath: inventoryPath });

    await client.query("ROLLBACK;");
  } finally {
    await client.end();
  }

  // -------------------------------------------------------------
  // 5. Manifest — name/size/sha256 for EVERY file above, plus
  // sourceMode/projectRef so a gate can verify a bundle actually came
  // from the mode/project it claims to.
  // -------------------------------------------------------------
  const manifestFiles = files.map(({ name, absPath }) => {
    const buf = fs.readFileSync(absPath);
    return { name, size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
  });
  const manifest = { generatedAt: new Date().toISOString(), sourceMode: mode, projectRef, files: manifestFiles };
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Backup bundle written to ${outDir}`);
  for (const f of manifestFiles) console.log(`  ${f.name}  (${f.size} bytes, sha256 ${f.sha256.slice(0, 12)}...)`);
  console.log(`  manifest.json`);
}

main().catch((e) => fail(e.stack || e.message));
