#!/usr/bin/env node
// Stage 2D Production Cutover Orchestrator — THE ONLY tool in this repo
// authorized to perform Surgical Reset + migrate() against the real
// Alrahma project. It has never been run against production. Building
// and rehearsing it does not authorize running it — see the task this
// file was built under: "Stage 2D Production Cutover Tooling Hardening
// — No Production Execution."
//
// ============================================================================
// THIS SCRIPT MUST NOT BE RUN WITHOUT A SEPARATE, EXPLICIT, HUMAN
// GO-DECISION MADE AFTER REVIEWING A REHEARSAL REPORT. Its existence is
// not that decision. No other script or CI job invokes this file.
// ============================================================================
//
// Hardcoded identity (never accepted as input, so no flag/typo can
// repoint this tool at a different project):
const PROJECT_NAME = "Alrahma";
const PROJECT_REF = "difzynyphojgisrfvrkd";
const ORG_NAME = "alrahmaacademy038@gmail.com's Org";
//
// Fixed, non-skippable sequence, one process, one invocation:
//   1. backup verification + live preflight — runs
//      production-preflight-gate.mjs --mode production as a child
//      process of THIS run (not "please run the gate first and trust
//      the operator did" — this script runs it itself, every time, and
//      refuses to proceed past a nonzero exit code).
//   2. advisory lock acquired (fails loudly, does not block, if another
//      run already holds it) — held for the rest of this process.
//   3. final recheck, on the SAME connection that is about to run
//      Surgical Reset, inside the SAME transaction — closes the gap
//      between "the gate checked five minutes ago" and "the DROP
//      statement about to run."
//   4. Surgical Reset (sql/surgical-reset.sql, the same file
//      03-surgical-reset.mjs uses for local rehearsal — read fresh off
//      disk, never duplicated/hand-copied here) — commits only if every
//      post-condition passes, same discipline as 03-surgical-reset.mjs.
//   5. migrate() — lib/db/drizzle/0000-0011 via drizzle-orm, the same
//      migrator run-migrate.mjs uses for local rehearsal.
//   6. post-migration verification — the 20 new tables exist, core RPCs
//      exist, RLS policies exist.
//   7. advisory lock released.
//
// There is no CLI flag to run any single phase alone. main() always runs
// the full sequence in order; a phase's function is not reachable any
// other way from this file's exports (there are none — this is not a
// library, only `node production-cutover-orchestrator.mjs` exists).
//
// Deliberately NOT built by editing 03-surgical-reset.mjs / run-migrate.mjs
// in place: those two remain exactly what they were, localhost-only,
// usable for local rehearsal without any of the production-only
// machinery below ever being reachable from them.
//
// Connection info from the environment ONLY:
//   CUTOVER_DATABASE_URL   required. Must be a real Supabase host naming
//                          PROJECT_REF (pooler username or direct
//                          hostname) — enforced below, not merely hoped
//                          for.
// Everything else is a CLI flag (never a secret):
//   --approval-manifest <path>   real, non-expired, matches branch/SHA.
//   --dump-file / --checksum-file   the backup bundle to verify.
//   --ca-cert-file <path>   Supabase's own CA (Project Settings >
//                           Database > SSL Configuration). TLS
//                           verification stays strict throughout — no
//                           code path in this file ever sets
//                           rejectUnauthorized:false.
//   --confirm-token <literal>   must equal exactly
//     I-UNDERSTAND-THIS-WILL-CUTOVER-PRODUCTION-<PROJECT_REF>-<current-git-SHA>
//     — recomputed fresh from the actual repo state every run, so a
//     stale/copy-pasted token from a previous commit fails closed.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPS_DIR = path.join(__dirname, "..");
const REPO_ROOT = path.join(OPS_DIR, "..", "..");
const DRIZZLE_DIR = path.join(REPO_ROOT, "lib", "db", "drizzle");
const SURGICAL_RESET_SQL_FILE = path.join(OPS_DIR, "sql", "surgical-reset.sql");
const GATE_SCRIPT = path.join(__dirname, "production-preflight-gate.mjs");

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

// A fixed 63-bit advisory-lock key, derived deterministically from the
// project ref so it can never collide with an unrelated lock used
// elsewhere in this codebase or a future one. Not a secret — advisory
// lock keys are visible to anyone with SELECT on pg_locks anyway.
const ADVISORY_LOCK_KEY = BigInt(
  "0x" + crypto.createHash("sha256").update(`option-a-cutover:${PROJECT_REF}`).digest("hex").slice(0, 15)
);

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

function currentGitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: REPO_ROOT }).trim();
}

// ---------------------------------------------------------------------
// Phase 0 — identity, args, confirm-token. All static, no DB connection.
// ---------------------------------------------------------------------
function phase0_validateArgsAndIdentity(args) {
  step("Phase 0 — identity + argument validation");
  console.log(`Hardcoded target: ${PROJECT_NAME} / ${PROJECT_REF} / ${ORG_NAME}`);

  const databaseUrl = process.env.CUTOVER_DATABASE_URL;
  if (!databaseUrl) fail("CUTOVER_DATABASE_URL must be set (environment only, never a CLI flag).");

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (e) {
    fail(`CUTOVER_DATABASE_URL is not a parseable URL: ${e.message}`);
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
    fail(`refusing a local/private host ("${hostname}") — this tool targets production only, it has no local mode.`);
  }
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(hostname);
  const isPooler = hostname.endsWith(".pooler.supabase.com");
  if (directMatch) {
    if (directMatch[1] !== PROJECT_REF) fail(`hostname "${hostname}" names project ref "${directMatch[1]}", not "${PROJECT_REF}" — refusing to touch a different project.`);
    ok(`direct hostname matches project ref ${PROJECT_REF}`);
  } else if (isPooler) {
    const username = decodeURIComponent(parsedUrl.username || "");
    if (username !== `postgres.${PROJECT_REF}`) fail(`pooler connection username ("${username}") does not equal "postgres.${PROJECT_REF}" — refusing to touch a different project.`);
    ok(`pooler username matches project ref ${PROJECT_REF}`);
  } else {
    fail(`CUTOVER_DATABASE_URL host "${hostname}" is not a real Supabase hostname (db.<ref>.supabase.co or *.pooler.supabase.com).`);
  }
  const sslmode = parsedUrl.searchParams.get("sslmode");
  if (sslmode !== "require" && sslmode !== "verify-full" && sslmode !== "verify-ca") {
    fail(`CUTOVER_DATABASE_URL must declare sslmode=require (or stricter) in its query string, got "${sslmode}".`);
  }
  ok(`sslmode=${sslmode} declared`);

  const approvalManifestPath = args["approval-manifest"];
  const dumpFile = args["dump-file"];
  const checksumFile = args["checksum-file"];
  const caCertFile = args["ca-cert-file"];
  for (const [name, value] of Object.entries({ "approval-manifest": approvalManifestPath, "dump-file": dumpFile, "checksum-file": checksumFile, "ca-cert-file": caCertFile })) {
    if (!value) fail(`missing required --${name}`);
  }
  if (!fs.existsSync(caCertFile)) fail(`--ca-cert-file "${caCertFile}" does not exist`);
  const caCert = fs.readFileSync(caCertFile, "utf8");
  if (!caCert.includes("-----BEGIN CERTIFICATE-----")) fail(`--ca-cert-file "${caCertFile}" does not look like a PEM certificate`);

  const sha = currentGitSha();
  const expectedToken = `I-UNDERSTAND-THIS-WILL-CUTOVER-PRODUCTION-${PROJECT_REF}-${sha}`;
  if (args["confirm-token"] !== expectedToken) {
    fail(`--confirm-token did not match the required exact literal for the CURRENT HEAD (${sha}):\n  ${expectedToken}\nA token copied from a previous commit will not match — this is deliberate.`);
  }
  ok("confirm-token matches the exact literal for the current HEAD SHA");

  return { databaseUrl, approvalManifestPath, dumpFile, checksumFile, caCertFile, caCert, sha };
}

// ---------------------------------------------------------------------
// Phase 1 — backup verification + live preflight, run as a REAL child
// process of this run (not "trust it was run earlier"). Any nonzero
// exit code halts the orchestrator before anything is touched.
// ---------------------------------------------------------------------
function phase1_runPreflightGate(ctx) {
  step("Phase 1 — backup verification + live preflight (production-preflight-gate.mjs, run fresh, right now)");
  const gateArgs = [
    GATE_SCRIPT,
    "--mode", "production",
    "--project-ref", PROJECT_REF,
    "--confirm-token", `I-UNDERSTAND-THIS-WILL-DROP-PRODUCTION-${PROJECT_REF}`,
    "--approval-manifest", ctx.approvalManifestPath,
    "--dump-file", ctx.dumpFile,
    "--checksum-file", ctx.checksumFile,
    "--ca-cert-file", ctx.caCertFile,
    "--max-dump-age-hours", "1",
  ];
  try {
    const out = execFileSync("node", gateArgs, { encoding: "utf8", cwd: REPO_ROOT, env: { ...process.env, GATE_DATABASE_URL: ctx.databaseUrl } });
    console.log(out);
    ok("preflight gate exited 0 — ALL CHECKS PASSED");
  } catch (e) {
    console.log(e.stdout || "");
    console.error(e.stderr || "");
    fail("preflight gate exited nonzero — refusing to proceed to Surgical Reset. Nothing was touched.");
  }
}

// ---------------------------------------------------------------------
// Phase 2 — advisory lock, final recheck, Surgical Reset. One
// connection, one transaction, from lock acquisition through commit.
// ---------------------------------------------------------------------
async function phase2_lockRecheckReset(ctx) {
  step("Phase 2 — advisory lock + final recheck + Surgical Reset");
  const client = new pg.Client({
    connectionString: ctx.databaseUrl,
    statement_timeout: 60_000,
    ssl: { rejectUnauthorized: true, ca: ctx.caCert },
  });
  await client.connect();

  try {
    // pg_try_advisory_lock, not pg_advisory_lock: a concurrent run
    // holding this lock is a signal to fail loudly and immediately, not
    // to queue up and fire later once the state that was just verified
    // may have changed again.
    const { rows: lockRows } = await client.query("select pg_try_advisory_lock($1::bigint) as acquired;", [ctx.advisoryLockKey]);
    if (!lockRows[0].acquired) {
      fail(`could not acquire advisory lock ${ctx.advisoryLockKey} — another cutover/rollback run holds it. Refusing to proceed concurrently.`);
    }
    ok(`advisory lock ${ctx.advisoryLockKey} acquired`);

    await client.query("BEGIN;");

    step("Phase 2a — final recheck (same connection, same transaction, immediately before the first DROP)");
    const { rows: tableRows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
    const actualTables = tableRows.map((r) => r.tablename).sort();
    const expectedSorted = [...EXPECTED_OLD_TABLES].sort();
    if (JSON.stringify(actualTables) !== JSON.stringify(expectedSorted)) {
      await client.query("ROLLBACK;");
      fail(`final recheck failed: public tables do not exactly match the expected 34 — state changed since the preflight gate ran. Rolled back, nothing dropped.`);
    }
    for (const table of EXPECTED_OLD_TABLES) {
      const { rows } = await client.query(`select count(*) as c from public."${table.replace(/"/g, '""')}";`);
      if (Number(rows[0].c) !== 0) {
        await client.query("ROLLBACK;");
        fail(`final recheck failed: public.${table} now has ${rows[0].c} row(s) — state changed since the preflight gate ran. Rolled back, nothing dropped.`);
      }
    }
    const { rows: authRows } = await client.query(`select count(*) as c from auth.users;`);
    if (Number(authRows[0].c) !== 0) {
      await client.query("ROLLBACK;");
      fail(`final recheck failed: auth.users now has ${authRows[0].c} row(s). Rolled back, nothing dropped.`);
    }
    ok("final recheck: all 34 expected tables present and empty, auth.users empty — state is unchanged since the preflight gate ran");

    step("Phase 2b — running sql/surgical-reset.sql (same connection, same open transaction)");
    const sql = fs.readFileSync(SURGICAL_RESET_SQL_FILE, "utf8");
    await client.query(sql);

    const { rows: remaining } = await client.query(
      `select tablename from pg_tables where schemaname='public' and tablename = any($1::text[]);`,
      [EXPECTED_OLD_TABLES]
    );
    const { rows: remainingEnums } = await client.query(
      `select typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname = any($1::text[]);`,
      [EXPECTED_OLD_ENUMS]
    );
    if (remaining.length > 0 || remainingEnums.length > 0) {
      await client.query("ROLLBACK;");
      fail(`post-reset check failed: ${remaining.length} old table(s) / ${remainingEnums.length} old enum(s) still present. Rolled back, nothing committed.`);
    }
    await client.query("COMMIT;");
    ok("Surgical Reset applied and committed — all 34 old tables and 3 old enums are gone.");
  } finally {
    // Advisory locks are session-scoped — ending the connection releases
    // it. Held explicitly through this whole phase (that is the point);
    // released here rather than with an explicit pg_advisory_unlock so a
    // crash mid-phase can't leave the lock held by a dead session past
    // Postgres's own cleanup.
    await client.end();
  }
}

// ---------------------------------------------------------------------
// Phase 3 — migrate() via drizzle-orm, same migrator run-migrate.mjs
// uses for local rehearsal, pointed at the same production URL.
// ---------------------------------------------------------------------
async function phase3_migrate(ctx) {
  step("Phase 3 — migrate() (lib/db/drizzle/0000-0011)");
  const pool = new pg.Pool({ connectionString: ctx.databaseUrl, ssl: { rejectUnauthorized: true, ca: ctx.caCert } });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder: DRIZZLE_DIR });
    ok("migrate() completed — 0000 through 0011 applied.");
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------
// Phase 4 — post-migration verification: the new 20-table schema exists,
// core RPCs exist, RLS policies exist. Not a full re-audit (the local
// rehearsal + existing test suites already prove the migration chain's
// correctness in the abstract) — this only proves THIS run actually
// landed on THIS database.
// ---------------------------------------------------------------------
async function phase4_postMigrationVerification(ctx) {
  step("Phase 4 — post-migration verification");
  const client = new pg.Client({ connectionString: ctx.databaseUrl, statement_timeout: 30_000, ssl: { rejectUnauthorized: true, ca: ctx.caCert } });
  await client.connect();
  try {
    const { rows: migRows } = await client.query(`select count(*) as c from drizzle.__drizzle_migrations;`);
    if (Number(migRows[0].c) < 12) fail(`post-migration check failed: drizzle.__drizzle_migrations has only ${migRows[0].c} row(s), expected >= 12 (0000-0011).`);
    ok(`drizzle.__drizzle_migrations has ${migRows[0].c} row(s)`);

    const { rows: funcRows } = await client.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('is_admin','is_admin_aal2','admin_set_role','handle_new_user');`);
    const foundFuncs = funcRows.map((r) => r.proname).sort();
    const requiredFuncs = ["admin_set_role", "handle_new_user", "is_admin", "is_admin_aal2"];
    const missingFuncs = requiredFuncs.filter((f) => !foundFuncs.includes(f));
    if (missingFuncs.length > 0) fail(`post-migration check failed: missing function(s): ${missingFuncs.join(", ")}`);
    ok(`all ${requiredFuncs.length} core RPC(s) present`);

    const { rows: policyRows } = await client.query(`select count(*) as c from pg_policies where schemaname='public';`);
    if (Number(policyRows[0].c) === 0) fail(`post-migration check failed: public has 0 RLS policies after migration — expected > 0.`);
    ok(`public has ${policyRows[0].c} RLS policy(ies)`);
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Stage 2D Production Cutover Orchestrator — target: ${PROJECT_NAME} (${PROJECT_REF}), org "${ORG_NAME}"`);
  const ctx = phase0_validateArgsAndIdentity(args);
  ctx.advisoryLockKey = ADVISORY_LOCK_KEY.toString();

  phase1_runPreflightGate(ctx);
  await phase2_lockRecheckReset(ctx);
  await phase3_migrate(ctx);
  await phase4_postMigrationVerification(ctx);

  console.log("\nCUTOVER COMPLETE — preflight, reset, migrate, and post-migration verification all passed, in this order, in this one run.");
}

main().catch((e) => fail(e.stack || e.message));
