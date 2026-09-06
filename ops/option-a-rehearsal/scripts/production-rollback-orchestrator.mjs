#!/usr/bin/env node
// Stage 2D Production Rollback Orchestrator — THE ONLY tool in this repo
// authorized to restore a backup bundle onto the real Alrahma project.
// It has never been run against production, and is NOT run against
// production by the task that built it or the corrective-review task
// that hardened it — see "Stage 2D Production Cutover Tooling
// Hardening — No Production Execution." Building and rehearsing it
// does not authorize running it.
//
// ============================================================================
// THIS SCRIPT MUST NOT BE RUN WITHOUT A SEPARATE, EXPLICIT, HUMAN
// GO-DECISION, DISTINCT FROM THE CUTOVER APPROVAL. A cutover approval
// manifest does not authorize a rollback — see --rollback-approval-manifest
// below, a different file with a different required approver field.
// ============================================================================
//
const PROJECT_NAME = "Alrahma";
const PROJECT_REF = "difzynyphojgisrfvrkd";
const ORG_NAME = "alrahmaacademy038@gmail.com's Org";
//
// Sequence, one process, one invocation:
//   1. identity + args + confirm-token (distinct literal from the
//      cutover tool's, so a cutover confirm-token can never double as a
//      rollback confirm-token by accident).
//   2. rollback approval manifest — separate file, separate approver
//      field, separate expiry, checked the same rigorous way the
//      cutover approval manifest is checked. Never the cutover
//      approval — a different schema/required key is enforced.
//   3. bundle checksum + freshness + provenance verification
//      (manifest.json's own sha256 per file, sourceMode=="production",
//      projectRef match, generatedAt age <= 1h) — previously only
//      checksums were checked here; freshness/provenance were a gap
//      this file alone had, closed by scripts/lib/rollback-core.mjs's
//      verifyBundleChecksumsAndFreshness().
//   4. advisory lock — THE SAME shared key the cutover orchestrator
//      uses (scripts/lib/shared-lock.mjs), fixing the corrective
//      review's item 1/2: previously this file used a DIFFERENT key
//      than the cutover tool, so a cutover and a rollback could race
//      each other undetected. Held on ONE connection for the entire
//      critical section below (target check through post-restore
//      verification) — never released early.
//   5. target verification: the live public schema must be EXACTLY the
//      expected NEW (post-cutover) 20-table schema — not "no table
//      outside the bundle's inventory" (which --allow-nonempty used to
//      let a caller bypass entirely). --allow-nonempty has been REMOVED
//      — there is no flag anywhere in this file that widens this check.
//   6. sql/inverse-reset-new-schema.sql — removes the 20 named new
//      tables/enums/functions AND the drizzle migration journal,
//      verified gone — BEFORE pg_restore ever runs, restoring the
//      documented "inverse reset happens first" order.
//   7. pg_restore of the bundle's public_schema.dump, mirroring
//      restore-bundle.mjs exactly (same filtering of the platform-owned
//      CREATE SCHEMA/rls_auto_enable entries; its own
//      --single-transaction is its atomicity boundary — see
//      rollback-core.mjs's module doc for why this can't share one
//      Postgres transaction with the rest of this run).
//   8. auth.users trigger + event triggers — now applied inside their
//      OWN explicit transaction (fixes a real bug: the previous version
//      ran these as a bare loop of auto-committing statements, so a
//      failure between the two could leave one applied and one not,
//      silently).
//   9. post-restore verification against the bundle's own inventory.json
//      (tables, row counts, RLS, full policy definitions, functions,
//      enums, auth trigger, event triggers — exact, not count-only).
//  10. advisory lock released.
//
// This file duplicates restore-bundle.mjs's pg_restore-invocation logic
// rather than importing it, because restore-bundle.mjs's own top-level
// guard (RESTORE_MODE must be "local", "production" refused
// unconditionally) is deliberately not a parameter — it is not designed
// to ever be pointed at a real project, by anyone, so this file does not
// change it or route around it. Deliberately NOT built by editing
// restore-bundle.mjs in place, matching the cutover orchestrator's own
// choice not to touch 03-surgical-reset.mjs/run-migrate.mjs.
//
// Connection info from the environment ONLY:
//   ROLLBACK_DATABASE_URL   required. Real Supabase host naming
//                           PROJECT_REF.
// CLI flags (never secrets):
//   --rollback-approval-manifest <path>
//   --bundle-dir <path>   directory containing manifest.json + the
//                         backup files to restore.
//   --ca-cert-file <path>
//   --confirm-token <literal>   must equal exactly
//     I-UNDERSTAND-THIS-WILL-ROLLBACK-PRODUCTION-<PROJECT_REF>-<current-git-SHA>
// There is no --allow-nonempty flag. A target that is not exactly the
// expected new schema must be investigated and resolved by a human —
// this tool will not restore over it under any flag combination.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { sharedAdvisoryLockKey } from "./lib/shared-lock.mjs";
import { runRollbackOnClient, verifyBundleChecksumsAndFreshness } from "./lib/rollback-core.mjs";
import { restorePublicSchemaDump } from "./lib/pg-restore-runner.mjs";
import { connectionStringForClient } from "./lib/pg-connection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPS_DIR = path.join(__dirname, "..");
const REPO_ROOT = path.join(OPS_DIR, "..", "..");
const INVERSE_RESET_SQL_FILE = path.join(OPS_DIR, "sql", "inverse-reset-new-schema.sql");

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

function phase0_validateArgsAndIdentity(args) {
  step("Phase 0 — identity + argument validation (ROLLBACK)");
  console.log(`Hardcoded target: ${PROJECT_NAME} / ${PROJECT_REF} / ${ORG_NAME}`);

  const databaseUrl = process.env.ROLLBACK_DATABASE_URL;
  if (!databaseUrl) fail("ROLLBACK_DATABASE_URL must be set (environment only).");
  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (e) {
    fail(`ROLLBACK_DATABASE_URL is not a parseable URL: ${e.message}`);
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0") {
    fail(`refusing a local host ("${hostname}") — this tool targets production only, it has no local mode. Use restore-bundle.mjs for local rehearsal.`);
  }
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(hostname);
  const isPooler = hostname.endsWith(".pooler.supabase.com");
  if (directMatch) {
    if (directMatch[1] !== PROJECT_REF) fail(`hostname "${hostname}" names project ref "${directMatch[1]}", not "${PROJECT_REF}".`);
  } else if (isPooler) {
    const username = decodeURIComponent(parsedUrl.username || "");
    if (username !== `postgres.${PROJECT_REF}`) fail(`pooler username ("${username}") does not equal "postgres.${PROJECT_REF}".`);
  } else {
    fail(`ROLLBACK_DATABASE_URL host "${hostname}" is not a real Supabase hostname.`);
  }
  ok(`host/username matches project ref ${PROJECT_REF}`);

  const rollbackApprovalPath = args["rollback-approval-manifest"];
  const bundleDir = args["bundle-dir"];
  const caCertFile = args["ca-cert-file"];
  if (args["allow-nonempty"]) {
    fail("--allow-nonempty does not exist on this tool (removed by corrective review — a target that is not exactly the expected new schema must be resolved manually, never bypassed).");
  }
  for (const [name, value] of Object.entries({ "rollback-approval-manifest": rollbackApprovalPath, "bundle-dir": bundleDir, "ca-cert-file": caCertFile })) {
    if (!value) fail(`missing required --${name}`);
  }
  if (!fs.existsSync(caCertFile)) fail(`--ca-cert-file "${caCertFile}" does not exist`);
  const caCert = fs.readFileSync(caCertFile, "utf8");
  if (!caCert.includes("-----BEGIN CERTIFICATE-----")) fail(`--ca-cert-file does not look like a PEM certificate`);

  const sha = currentGitSha();
  const expectedToken = `I-UNDERSTAND-THIS-WILL-ROLLBACK-PRODUCTION-${PROJECT_REF}-${sha}`;
  if (args["confirm-token"] !== expectedToken) {
    fail(`--confirm-token did not match the required literal for the current HEAD (${sha}):\n  ${expectedToken}`);
  }
  ok("confirm-token matches");

  return { databaseUrl, rollbackApprovalPath, bundleDir, caCertFile, caCert, sha };
}

function phase1_verifyRollbackApproval(ctx) {
  step("Phase 1 — separate rollback approval manifest");
  if (!fs.existsSync(ctx.rollbackApprovalPath)) fail(`--rollback-approval-manifest "${ctx.rollbackApprovalPath}" does not exist`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(ctx.rollbackApprovalPath, "utf8"));
  } catch (e) {
    fail(`--rollback-approval-manifest is not valid JSON: ${e.message}`);
  }
  const requiredKeys = ["projectRef", "approvedBranch", "approvedCommitSha", "reasonForRollback", "approvedAt", "expiresAt", "approvedBy"];
  const missing = requiredKeys.filter((k) => !(k in manifest));
  if (missing.length > 0) fail(`rollback approval manifest missing key(s): ${missing.join(", ")}`);
  if (manifest.projectRef !== PROJECT_REF) fail(`rollback approval manifest projectRef "${manifest.projectRef}" != "${PROJECT_REF}"`);
  if (typeof manifest.approvedBy !== "string" || manifest.approvedBy.startsWith("LOCAL-FIXTURE") || manifest.approvedBy.length === 0) {
    fail(`rollback approval manifest approvedBy is missing or is the local-fixture literal — not a real approval`);
  }
  if (!manifest.reasonForRollback || typeof manifest.reasonForRollback !== "string" || manifest.reasonForRollback.length < 10) {
    fail(`rollback approval manifest reasonForRollback must be a real, non-trivial explanation of why a rollback is being approved`);
  }
  const now = new Date();
  const expiresAt = new Date(manifest.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    fail(`rollback approval manifest is expired or has an invalid expiresAt ("${manifest.expiresAt}")`);
  }
  const currentBranch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8", cwd: REPO_ROOT }).trim();
  if (currentBranch !== manifest.approvedBranch) fail(`current branch "${currentBranch}" != rollback approval's approvedBranch "${manifest.approvedBranch}"`);
  if (ctx.sha !== manifest.approvedCommitSha) fail(`current HEAD "${ctx.sha}" != rollback approval's approvedCommitSha "${manifest.approvedCommitSha}"`);
  ok(`rollback approval manifest is real, unexpired, and matches branch/SHA (approved by "${manifest.approvedBy}": ${manifest.reasonForRollback})`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Stage 2D Production Rollback Orchestrator — target: ${PROJECT_NAME} (${PROJECT_REF}), org "${ORG_NAME}"`);
  const ctx = phase0_validateArgsAndIdentity(args);
  phase1_verifyRollbackApproval(ctx);

  step("Phase 2 — bundle checksum + freshness + provenance verification");
  const { inventory } = verifyBundleChecksumsAndFreshness(ctx.bundleDir, {
    expectedProjectRef: PROJECT_REF,
    expectedSourceMode: "production",
    maxAgeHours: 1,
  });
  ok("bundle checksums match, sourceMode=production, projectRef matches, generatedAt is within 1h");

  step("Phase 3 — advisory lock (shared with the cutover tool) + critical section");
  // connectionStringForClient strips `sslmode` before connecting — see
  // scripts/lib/pg-connection.mjs: left in, it silently overrides the
  // explicit ssl.ca below against a real Supabase host.
  const client = new pg.Client({ connectionString: connectionStringForClient(ctx.databaseUrl), statement_timeout: 0, ssl: { rejectUnauthorized: true, ca: ctx.caCert } });
  await client.connect();
  try {
    const { rows: lockRows } = await client.query("select pg_try_advisory_lock($1::bigint) as acquired;", [SHARED_ADVISORY_LOCK_KEY]);
    if (!lockRows[0].acquired) fail(`could not acquire the shared advisory lock ${SHARED_ADVISORY_LOCK_KEY} — another cutover or rollback run holds it.`);
    ok(`shared advisory lock ${SHARED_ADVISORY_LOCK_KEY} acquired — held for the rest of this run`);

    await runRollbackOnClient(client, {
      inverseResetSql: fs.readFileSync(INVERSE_RESET_SQL_FILE, "utf8"),
      inventory,
      // caCertFile forces pg_restore's OWN libpq connection to
      // sslmode=verify-full against Supabase's real CA (see
      // withStrictTls in pg-restore-runner.mjs) — previously this
      // native-binary connection used the URL's sslmode=require
      // unmodified, which libpq treats as encrypt-only (no certificate
      // verification at all), an asymmetry the Stage 2D read-only audit
      // disclosed but left unfixed.
      restoreFn: () => restorePublicSchemaDump(ctx.databaseUrl, ctx.bundleDir, { caCertFile: ctx.caCertFile }),
      runTriggerStatements: async (txClient) => {
        const statementsPath = path.join(ctx.bundleDir, "functions_and_triggers.statements.json");
        const statements = fs.existsSync(statementsPath) ? JSON.parse(fs.readFileSync(statementsPath, "utf8")) : [];
        for (const stmt of statements) await txClient.query(stmt);
      },
      log: (msg) => console.log(msg),
    });
  } finally {
    await client.end();
  }

  console.log("\nROLLBACK COMPLETE AND VERIFIED.");
}

main().catch((e) => fail(e.stack || e.message));
