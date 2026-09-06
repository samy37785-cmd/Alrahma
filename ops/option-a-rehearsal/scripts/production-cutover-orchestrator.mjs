#!/usr/bin/env node
// Stage 2D Production Cutover Orchestrator — THE ONLY tool in this repo
// authorized to perform Surgical Reset + migrate() against the real
// Alrahma project. It has never been run against production. Building
// and rehearsing it does not authorize running it — see the task this
// file was built under: "Stage 2D Production Cutover Tooling Hardening
// — No Production Execution," and the corrective-review task that
// followed it ("no merge, no production execution — fix these defects
// in place first").
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
//      process of THIS run, TWICE: once before the advisory lock is
//      even requested (fail fast, cheap), and once again immediately
//      AFTER the lock is acquired, right before BEGIN — closing the gap
//      between "the gate checked a moment ago" and "the lock is held
//      and we're about to touch anything." This does not replace the
//      SQL-level final recheck in step 3 below; it is an additional,
//      earlier layer that re-verifies EVERYTHING the gate checks
//      (project ref/host, HEAD vs approval manifest, backup bundle
//      freshness/hash/provenance, exact table fingerprint, all public
//      row counts, auth.users, storage.buckets/objects) rather than
//      only the DB-side subset.
//   2. advisory lock acquired (fails loudly, does not block, if another
//      cutover OR rollback run already holds it — SAME key as the
//      rollback orchestrator, see scripts/lib/shared-lock.mjs) — held
//      on ONE connection for the rest of this process, through commit
//      or rollback, never released early.
//   3. final recheck + Surgical Reset + all migrations + the migration
//      journal + full post-migration verification, as PLAIN SQL on
//      THAT SAME connection, inside ONE transaction — COMMIT only after
//      verification passes; ANY error at any point ROLLBACKs the whole
//      thing automatically. See scripts/lib/cutover-core.mjs's module
//      doc for exactly why this is possible and how it differs from
//      calling drizzle-orm's migrate() directly.
//   4. advisory lock released (connection closed).
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
//   --policy-fixture <path>   optional. A captured {tablename,
//                             policyname, cmd, roles, qual, with_check}[]
//                             fixture (see fixtures/new-schema-rls-
//                             policies.json) — when present, the
//                             post-migration verification compares the
//                             FULL restored policy set against it
//                             exactly, not just a nonzero count.
//   --confirm-token <literal>   must equal exactly
//     I-UNDERSTAND-THIS-WILL-CUTOVER-PRODUCTION-<PROJECT_REF>-<current-git-SHA>
//     — recomputed fresh from the actual repo state every run, so a
//     stale/copy-pasted token from a previous commit fails closed.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { sharedAdvisoryLockKey } from "./lib/shared-lock.mjs";
import { runAtomicCutoverOnClient } from "./lib/cutover-core.mjs";
import { connectionStringForClient } from "./lib/pg-connection.mjs";

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

const SHARED_ADVISORY_LOCK_KEY = sharedAdvisoryLockKey(PROJECT_REF);

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
  const policyFixturePath = args["policy-fixture"];
  for (const [name, value] of Object.entries({ "approval-manifest": approvalManifestPath, "dump-file": dumpFile, "checksum-file": checksumFile, "ca-cert-file": caCertFile })) {
    if (!value) fail(`missing required --${name}`);
  }
  if (!fs.existsSync(caCertFile)) fail(`--ca-cert-file "${caCertFile}" does not exist`);
  const caCert = fs.readFileSync(caCertFile, "utf8");
  if (!caCert.includes("-----BEGIN CERTIFICATE-----")) fail(`--ca-cert-file "${caCertFile}" does not look like a PEM certificate`);

  let policyFixture;
  if (policyFixturePath) {
    if (!fs.existsSync(policyFixturePath)) fail(`--policy-fixture "${policyFixturePath}" does not exist`);
    policyFixture = JSON.parse(fs.readFileSync(policyFixturePath, "utf8"));
    ok(`--policy-fixture loaded (${policyFixture.length} policy definition(s)) — post-migration verification will match the FULL policy set exactly`);
  } else {
    console.log("INFO  no --policy-fixture given — post-migration verification will only check that RLS policies exist (count > 0), not match an exact set");
  }

  const sha = currentGitSha();
  const expectedToken = `I-UNDERSTAND-THIS-WILL-CUTOVER-PRODUCTION-${PROJECT_REF}-${sha}`;
  if (args["confirm-token"] !== expectedToken) {
    fail(`--confirm-token did not match the required exact literal for the CURRENT HEAD (${sha}):\n  ${expectedToken}\nA token copied from a previous commit will not match — this is deliberate.`);
  }
  ok("confirm-token matches the exact literal for the current HEAD SHA");

  return { databaseUrl, approvalManifestPath, dumpFile, checksumFile, caCertFile, caCert, policyFixture, sha };
}

// ---------------------------------------------------------------------
// Runs the full production-preflight-gate.mjs as a real child process.
// Called TWICE by main(): once before the lock (fail fast), once again
// immediately after the lock is acquired (closes the TOCTOU gap — see
// this file's header). Both calls run the IDENTICAL check, not a
// reduced subset — "don't rely on a separate preflight alone" is
// satisfied by re-running the whole thing under the lock, not by
// duplicating its ~900 lines of logic into this file a second time.
// ---------------------------------------------------------------------
function runPreflightGate(ctx, label) {
  step(`${label} — production-preflight-gate.mjs, run fresh, right now`);
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
    ok(`${label}: preflight gate exited 0 — ALL CHECKS PASSED`);
  } catch (e) {
    console.log(e.stdout || "");
    console.error(e.stderr || "");
    fail(`${label}: preflight gate exited nonzero — refusing to proceed. Nothing was touched.`);
  }
}

// ---------------------------------------------------------------------
// Phase 2 — advisory lock (SHARED key) + re-run preflight under the lock
// + final recheck + Surgical Reset + migrations + verification. ONE
// connection, held from lock acquisition through COMMIT/ROLLBACK,
// released only when this function returns (success or failure).
// ---------------------------------------------------------------------
async function phase2_atomicCriticalSection(ctx) {
  step("Phase 2 — advisory lock (shared with the rollback tool) + atomic critical section");
  const client = new pg.Client({
    // connectionStringForClient strips `sslmode` before connecting —
    // see scripts/lib/pg-connection.mjs for why: left in, it silently
    // overrides the explicit ssl.ca below against a real Supabase host.
    connectionString: connectionStringForClient(ctx.databaseUrl),
    statement_timeout: 0, // migrations can legitimately run longer than a short fixed timeout; the advisory lock, not a timeout, is what bounds this
    ssl: { rejectUnauthorized: true, ca: ctx.caCert },
  });
  await client.connect();

  try {
    // pg_try_advisory_lock, not pg_advisory_lock: a concurrent cutover
    // OR rollback run holding this lock is a signal to fail loudly and
    // immediately, not to queue up and fire later once the state that
    // was just verified may have changed again. SAME key the rollback
    // orchestrator uses (scripts/lib/shared-lock.mjs) — this is the
    // fix for the corrective review's item 1/2: previously each tool
    // had its own key, so a cutover and a rollback could both proceed
    // concurrently without either seeing the other.
    const { rows: lockRows } = await client.query("select pg_try_advisory_lock($1::bigint) as acquired;", [SHARED_ADVISORY_LOCK_KEY]);
    if (!lockRows[0].acquired) {
      fail(`could not acquire the shared advisory lock ${SHARED_ADVISORY_LOCK_KEY} — another cutover or rollback run holds it. Refusing to proceed concurrently.`);
    }
    ok(`shared advisory lock ${SHARED_ADVISORY_LOCK_KEY} acquired — held for the rest of this run`);

    runPreflightGate(ctx, "Phase 2a — re-verify under the lock");

    step("Phase 2b — final recheck + Surgical Reset + migrations + verification (one connection, one transaction)");
    const { appliedCount } = await runAtomicCutoverOnClient(client, {
      expectedOldTables: EXPECTED_OLD_TABLES,
      expectedOldEnums: EXPECTED_OLD_ENUMS,
      surgicalResetSql: fs.readFileSync(SURGICAL_RESET_SQL_FILE, "utf8"),
      drizzleDir: DRIZZLE_DIR,
      policyFixture: ctx.policyFixture,
      log: (msg) => console.log(msg),
    });
    ok(`atomic cutover committed — ${appliedCount} migration file(s) applied, full post-migration fingerprint verified, all in one transaction`);
  } finally {
    // Advisory locks are session-scoped — ending the connection releases
    // it. Held explicitly through the ENTIRE critical section above
    // (that is the point of item 2's fix); released here rather than
    // with an explicit pg_advisory_unlock so a crash mid-phase can't
    // leave the lock held by a dead session past Postgres's own cleanup.
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Stage 2D Production Cutover Orchestrator — target: ${PROJECT_NAME} (${PROJECT_REF}), org "${ORG_NAME}"`);
  const ctx = phase0_validateArgsAndIdentity(args);

  runPreflightGate(ctx, "Phase 1 — pre-lock preflight (fail fast)");
  await phase2_atomicCriticalSection(ctx);

  console.log("\nCUTOVER COMPLETE — preflight (twice), lock, reset, migrate, and post-migration verification all passed, atomically, in this one run.");
}

main().catch((e) => fail(e.stack || e.message));
