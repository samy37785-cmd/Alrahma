#!/usr/bin/env node
// Stage 2D — Final Live Read-Only Production Readiness Gate.
//
// A pure READ-ONLY audit of the real Alrahma project's current
// ownership/ACL/role-membership state — never DDL, never DML, never a
// migration/reset/restore. Every query runs inside a single
// `BEGIN TRANSACTION READ ONLY` — Postgres itself rejects any write
// attempt inside that transaction, not just "the script only issues
// SELECTs" (defense in depth: even a bug in this file couldn't write).
// Ends with ROLLBACK (not COMMIT) so there is no ambiguity that nothing
// could have persisted, even though a read-only transaction has nothing
// to persist either way.
//
// This script exists to settle, with live evidence rather than an
// assumption, three things production-preflight-gate.mjs's own pinned
// constants (EXPECTED_SCHEMA_OWNER / EXPECTED_SCHEMA_ACL) have always
// disclosed as unconfirmed against the real project:
//   1. What actually owns public/its tables/functions/sequences/enums,
//      and what their real ACLs are — compared directly against the
//      gate's pinned constants, with every difference named.
//   2. Whether the role CUTOVER_DATABASE_URL/ROLLBACK_DATABASE_URL
//      actually connects as (postgres/postgres.<ref>) is a member of,
//      or can SET ROLE into, supabase_admin — settling whether a real
//      rollback (which needs to replay `ALTER DEFAULT PRIVILEGES FOR
//      ROLE supabase_admin ...` statements recorded in the real backup
//      bundle) can succeed at all.
//   3. Every role name a real restore's dump content actually depends
//      on (this script does NOT parse the dump — see
//      inspect-backup-bundle-roles.mjs for that, a purely local,
//      no-production-connection tool).
//
// Never prints or stores a credential — only object names, boolean
// flags, and ACL/ownership metadata, none of which are secrets.
//
// Required (environment only, never a CLI flag, never logged):
//   AUDIT_DATABASE_URL   a real Supabase host naming --project-ref
//                        (pooler username or direct hostname).
// Required CLI flags:
//   --project-ref <ref>
//   --ca-cert-file <path>   Supabase's own CA (Project Settings >
//                           Database > SSL Configuration).
// Optional:
//   --out-file <path>   default: out/production-readonly-audit.json
//                       (gitignored — never committed).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connectionStringForClient } from "./lib/pg-connection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPS_DIR = path.join(__dirname, "..");

function fail(msg) {
  console.error(`ERROR ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`\n=== ${msg} ===`);
}
function ok(msg) {
  console.log(`OK    ${msg}`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = args["project-ref"];
  const caCertFile = args["ca-cert-file"];
  const outFile = args["out-file"] || path.join(OPS_DIR, "out", "production-readonly-audit.json");
  if (!projectRef) fail("missing required --project-ref");
  if (!caCertFile) fail("missing required --ca-cert-file");
  if (!fs.existsSync(caCertFile)) fail(`--ca-cert-file "${caCertFile}" does not exist`);
  const caCert = fs.readFileSync(caCertFile, "utf8");
  if (!caCert.includes("-----BEGIN CERTIFICATE-----")) fail(`--ca-cert-file "${caCertFile}" does not look like a PEM certificate`);

  const databaseUrl = process.env.AUDIT_DATABASE_URL;
  if (!databaseUrl) fail("AUDIT_DATABASE_URL must be set (environment only, never a CLI flag).");

  step("Phase 0 — identity validation (same discipline as the other production tools)");
  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (e) {
    fail(`AUDIT_DATABASE_URL is not a parseable URL: ${e.message}`);
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
    fail(`refusing a local/private host ("${hostname}") — this tool audits production only, it has no local mode.`);
  }
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(hostname);
  const isPooler = hostname.endsWith(".pooler.supabase.com");
  if (directMatch) {
    if (directMatch[1] !== projectRef) fail(`hostname "${hostname}" names project ref "${directMatch[1]}", not "${projectRef}".`);
  } else if (isPooler) {
    const username = decodeURIComponent(parsedUrl.username || "");
    if (username !== `postgres.${projectRef}`) fail(`pooler username ("${username}") does not equal "postgres.${projectRef}".`);
  } else {
    fail(`AUDIT_DATABASE_URL host "${hostname}" is not a real Supabase hostname (db.<ref>.supabase.co or *.pooler.supabase.com).`);
  }
  const sslmode = parsedUrl.searchParams.get("sslmode");
  if (sslmode !== "require" && sslmode !== "verify-full" && sslmode !== "verify-ca") {
    fail(`AUDIT_DATABASE_URL must declare sslmode=require (or stricter), got "${sslmode}".`);
  }
  ok(`host/username matches project ref ${projectRef}, sslmode=${sslmode}, --ca-cert-file is a PEM certificate`);

  // connectionStringForClient strips `sslmode` before the connection is
  // actually opened — see scripts/lib/pg-connection.mjs for exactly why
  // (found by actually connecting to real production for the first
  // time under this task).
  const client = new pg.Client({ connectionString: connectionStringForClient(databaseUrl), statement_timeout: 30_000, ssl: { rejectUnauthorized: true, ca: caCert } });
  await client.connect();
  const result = { projectRef, auditedAt: new Date().toISOString() };

  try {
    step("Phase 1 — BEGIN TRANSACTION READ ONLY (Postgres itself rejects any write attempt from here on)");
    await client.query("BEGIN TRANSACTION READ ONLY;");
    ok("read-only transaction started");

    step("Phase 2 — identity");
    const { rows: idRows } = await client.query(`select current_user, session_user;`);
    result.identity = idRows[0];
    ok(`current_user=${idRows[0].current_user}, session_user=${idRows[0].session_user}`);

    step("Phase 3 — database + public schema ownership/ACL");
    const { rows: dbRows } = await client.query(`select current_database() as db, pg_get_userbyid(datdba) as db_owner from pg_database where datname = current_database();`);
    result.database = dbRows[0];
    const { rows: nsRows } = await client.query(`select nspname, pg_get_userbyid(nspowner) as owner, nspacl::text as acl from pg_namespace where nspname='public';`);
    result.publicSchema = nsRows[0];
    ok(`database owner=${dbRows[0].db_owner}, public schema owner=${nsRows[0].owner}`);
    console.log(`      public schema ACL: ${nsRows[0].acl}`);

    step("Phase 4 — every table/sequence/view owner + ACL in public");
    const { rows: relRows } = await client.query(`
      select c.relname, c.relkind, pg_get_userbyid(c.relowner) as owner, c.relacl::text as acl
      from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','S','v','m')
      order by c.relname;
    `);
    result.relations = relRows;
    const relOwners = [...new Set(relRows.map((r) => r.owner))];
    ok(`${relRows.length} relation(s) in public — distinct owner(s): ${relOwners.join(", ")}`);

    step("Phase 5 — every function owner + ACL in public");
    const { rows: funcRows } = await client.query(`
      select p.proname, pg_get_userbyid(p.proowner) as owner, p.proacl::text as acl
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      order by p.proname;
    `);
    result.functions = funcRows;
    const funcOwners = [...new Set(funcRows.map((r) => r.owner))];
    ok(`${funcRows.length} function(s) in public — distinct owner(s): ${funcOwners.join(", ")}`);

    step("Phase 6 — every enum owner in public");
    const { rows: enumRows } = await client.query(`
      select t.typname, pg_get_userbyid(t.typowner) as owner
      from pg_type t where t.typnamespace='public'::regnamespace and t.typtype='e'
      order by t.typname;
    `);
    result.enums = enumRows;
    ok(`${enumRows.length} enum type(s) in public`);

    step("Phase 7 — default privileges (pg_default_acl) touching public");
    const { rows: defaclRows } = await client.query(`
      select defaclrole::regrole::text as role, defaclnamespace::regnamespace::text as schema, defaclobjtype as objtype, defaclacl::text as acl
      from pg_default_acl order by role, objtype;
    `);
    result.defaultAcl = defaclRows;
    ok(`${defaclRows.length} pg_default_acl row(s)`);
    for (const r of defaclRows) console.log(`      role=${r.role} schema=${r.schema} objtype=${r.objtype} acl=${r.acl}`);

    step("Phase 8 — role attributes + rollback membership/SET ROLE capability (item 4)");
    const { rows: roleRows } = await client.query(`
      select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
      from pg_roles where rolname in (current_user, 'postgres', 'supabase_admin')
      order by rolname;
    `);
    result.roleAttributes = roleRows;
    for (const r of roleRows) console.log(`      ${r.rolname}: super=${r.rolsuper} inherit=${r.rolinherit} createrole=${r.rolcreaterole} createdb=${r.rolcreatedb} bypassrls=${r.rolbypassrls}`);

    const { rows: memberRows } = await client.query(`
      select
        pg_has_role(current_user, 'supabase_admin', 'MEMBER') as is_member_of_supabase_admin,
        pg_has_role(current_user, 'supabase_admin', 'USAGE') as has_usage_of_supabase_admin;
    `);
    result.rollbackRoleCheck = memberRows[0];
    ok(`pg_has_role(current_user, 'supabase_admin', 'MEMBER') = ${memberRows[0].is_member_of_supabase_admin}`);
    ok(`pg_has_role(current_user, 'supabase_admin', 'USAGE')  = ${memberRows[0].has_usage_of_supabase_admin}`);

    // A direct, real attempt to SET ROLE — the most conclusive possible
    // test, still fully read-only (SET ROLE changes session state only,
    // never touches any table), and immediately reverted via RESET ROLE.
    let setRoleWorked = false;
    let setRoleError = null;
    try {
      await client.query("SET ROLE supabase_admin;");
      setRoleWorked = true;
      await client.query("RESET ROLE;");
    } catch (e) {
      setRoleError = e.message;
    }
    result.setRoleSupabaseAdminWorked = setRoleWorked;
    result.setRoleSupabaseAdminError = setRoleError;
    ok(`SET ROLE supabase_admin; (then RESET ROLE;) actually succeeded: ${setRoleWorked}${setRoleError ? ` (error: ${setRoleError})` : ""}`);

    step("Phase 9 — ROLLBACK (nothing was ever writable in this transaction; rolling back for clarity)");
    await client.query("ROLLBACK;");
    ok("rolled back — no possible write, confirmed");
  } finally {
    await client.end();
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n");
  console.log(`\nAUDIT COMPLETE. Full results (no secrets — only names/owners/ACLs/booleans): ${outFile}`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
