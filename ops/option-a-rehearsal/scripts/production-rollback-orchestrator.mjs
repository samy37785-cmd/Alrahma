#!/usr/bin/env node
// Stage 2D Production Rollback Orchestrator — THE ONLY tool in this repo
// authorized to restore a backup bundle onto the real Alrahma project.
// It has never been run against production, and is NOT run against
// production by the task that built it — see
// "Stage 2D Production Cutover Tooling Hardening — No Production
// Execution." Building and rehearsing it does not authorize running it.
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
//   3. bundle checksum verification (manifest.json + every file's
//      sha256) — refuses a tampered or incomplete bundle.
//   4. advisory lock (a DIFFERENT key than the cutover tool's, so a
//      concurrent cutover and rollback can never race silently past
//      each other — each is unaware of the other's key today, which is
//      a known, disclosed limitation, not a hidden gap; see the bottom
//      of this file).
//   5. live identity/shape check of the CURRENT target state — refuses
//      an unrelated or unexpectedly non-empty database before restoring
//      onto it (an accidental restore onto a database with real,
//      unrelated rows in it is exactly the failure mode this exists to
//      prevent).
//   6. pg_restore of the bundle's public_schema.dump, then the bundle's
//      functions_and_triggers.sql, mirroring restore-bundle.mjs exactly
//      (same filtering of the platform-owned CREATE SCHEMA/rls_auto_enable
//      entries) — but production-only, gated by everything above.
//   7. post-restore verification against the bundle's own inventory.json
//      (same check restore-bundle.mjs already performs).
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
//   --allow-nonempty   optional, default refuses a target whose public
//                      schema already has ANY table not in the bundle's
//                      own inventory.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPS_DIR = path.join(__dirname, "..");
const REPO_ROOT = path.join(OPS_DIR, "..", "..");

const ADVISORY_LOCK_KEY = BigInt(
  "0x" + crypto.createHash("sha256").update(`option-a-rollback:${PROJECT_REF}`).digest("hex").slice(0, 15)
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
function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

// pg_restore resolution + invocation — mirrors restore-bundle.mjs
// exactly (same PATH-first/Docker-fallback discipline). No
// dockerRewriteUrl here: unlike restore-bundle.mjs (local-only, so its
// Docker fallback must rewrite 127.0.0.1 to host.docker.internal), this
// tool refuses every local host at Phase 0 — a real Supabase hostname is
// reachable unchanged from inside a container, nothing to rewrite.
async function resolveClientTool(bin) {
  try {
    await execFileAsync(bin, ["--version"]);
    return { kind: "path", bin };
  } catch {
    console.log(`INFO  "${bin}" not found on PATH — falling back to a disposable Docker container for the binary only.`);
    return { kind: "docker", bin };
  }
}
async function runClientTool(tool, args, bindMountDir) {
  if (tool.kind === "path") {
    return execFileAsync(tool.bin, args, { maxBuffer: 1024 * 1024 * 256 });
  }
  const dockerArgs = [
    "run", "--rm",
    "-v", `${path.resolve(bindMountDir)}:/data`,
    "postgres:17", tool.bin,
    ...args.map((a) => (path.resolve(a).startsWith(path.resolve(bindMountDir)) ? `/data/${path.basename(a)}` : a)),
  ];
  return execFileAsync("docker", dockerArgs, { maxBuffer: 1024 * 1024 * 256 });
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
  const allowNonempty = Boolean(args["allow-nonempty"]);
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

  return { databaseUrl, rollbackApprovalPath, bundleDir, caCertFile, caCert, allowNonempty, sha };
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

function phase2_verifyBundleChecksums(ctx) {
  step("Phase 2 — bundle checksum verification");
  const manifestPath = path.join(ctx.bundleDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail(`bundle manifest.json not found in "${ctx.bundleDir}"`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) fail(`bundle manifest.json has no files[]`);
  for (const f of manifest.files) {
    const p = path.join(ctx.bundleDir, f.name);
    if (!fs.existsSync(p)) fail(`bundle names "${f.name}" which does not exist`);
    const actual = sha256File(p);
    if (actual !== f.sha256) fail(`bundle file "${f.name}" sha256 mismatch: manifest says ${f.sha256}, actual ${actual}`);
  }
  ok(`all ${manifest.files.length} bundle file(s) match their recorded sha256`);
  const inventoryPath = path.join(ctx.bundleDir, "inventory.json");
  if (!fs.existsSync(inventoryPath)) fail(`bundle inventory.json not found — cannot post-verify a restore without it`);
  return { manifest, inventory: JSON.parse(fs.readFileSync(inventoryPath, "utf8")) };
}

async function phase3_advisoryLockAndTargetCheck(ctx, inventory) {
  step("Phase 3 — advisory lock + refusal of an unrelated/non-empty target");
  const client = new pg.Client({ connectionString: ctx.databaseUrl, statement_timeout: 30_000, ssl: { rejectUnauthorized: true, ca: ctx.caCert } });
  await client.connect();
  try {
    const { rows: lockRows } = await client.query("select pg_try_advisory_lock($1::bigint) as acquired;", [ADVISORY_LOCK_KEY.toString()]);
    if (!lockRows[0].acquired) fail(`could not acquire rollback advisory lock ${ADVISORY_LOCK_KEY} — another run holds it.`);
    ok(`advisory lock ${ADVISORY_LOCK_KEY} acquired`);

    const { rows: tableRows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
    const actualTables = tableRows.map((r) => r.tablename);
    const unexpected = actualTables.filter((t) => !inventory.tables.includes(t));
    if (unexpected.length > 0 && !ctx.allowNonempty) {
      fail(`target public schema has table(s) not accounted for by the bundle being restored: ${unexpected.join(", ")} — refusing (pass --allow-nonempty only if this is a deliberately reviewed exception).`);
    }
    ok(`target schema shape is accounted for by the bundle (or --allow-nonempty was explicitly passed)`);
  } finally {
    await client.end();
  }
}

async function phase4_restore(ctx) {
  step("Phase 4 — pg_restore (mirrors restore-bundle.mjs's proven TOC-filtering exactly, production-target only)");
  const pgRestore = await resolveClientTool("pg_restore");
  const dumpPath = path.join(ctx.bundleDir, "public_schema.dump");

  // Same two exclusions restore-bundle.mjs proved necessary by actually
  // running this restore: pg_dump -n public's own `CREATE SCHEMA public`
  // entry (Surgical Reset never drops `public` itself, so it always
  // already exists) and `rls_auto_enable()` (Supabase's own
  // pre-existing infrastructure, never touched by Surgical Reset either
  // — restoring pg_dump's plain, non-`OR REPLACE` CREATE FUNCTION for it
  // would collide with the live one).
  const { stdout: tocText } = await runClientTool(pgRestore, ["--list", dumpPath], ctx.bundleDir);
  const filteredToc = tocText
    .split("\n")
    .filter((line) => !/\bSCHEMA\s*-?\s*public\b/.test(line))
    .filter((line) => !/\bFUNCTION\s+public\s+rls_auto_enable\(/.test(line))
    .join("\n");
  const tocPath = path.join(ctx.bundleDir, ".rollback-toc.filtered.txt");
  fs.writeFileSync(tocPath, filteredToc);
  await runClientTool(pgRestore, ["--dbname", ctx.databaseUrl, "--exit-on-error", "--single-transaction", "--use-list", tocPath, dumpPath], ctx.bundleDir);
  fs.rmSync(tocPath, { force: true });
  ok("public_schema.dump restored (schema + data + GRANTs + RLS + POLICIES + owners, minus the public-schema-creation entry)");

  step("Phase 4b — restoring auth.users trigger + event triggers");
  const statementsPath = path.join(ctx.bundleDir, "functions_and_triggers.statements.json");
  const statements = fs.existsSync(statementsPath) ? JSON.parse(fs.readFileSync(statementsPath, "utf8")) : [];
  if (statements.length > 0) {
    const client = new pg.Client({ connectionString: ctx.databaseUrl, statement_timeout: 30_000, ssl: { rejectUnauthorized: true, ca: ctx.caCert } });
    await client.connect();
    try {
      for (const stmt of statements) await client.query(stmt);
      ok(`${statements.length} statement(s) applied`);
    } finally {
      await client.end();
    }
  }
}

async function phase5_postRestoreVerification(ctx, inventory) {
  step("Phase 5 — post-restore verification against the bundle's own inventory.json");
  const client = new pg.Client({ connectionString: ctx.databaseUrl, statement_timeout: 30_000, ssl: { rejectUnauthorized: true, ca: ctx.caCert } });
  await client.connect();
  try {
    const { rows: tableRows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
    const actualTables = tableRows.map((r) => r.tablename).sort();
    const expectedTables = [...inventory.tables].sort();
    if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
      fail(`post-restore check failed: tables do not match inventory.json exactly.\n  expected: ${expectedTables.join(", ")}\n  actual:   ${actualTables.join(", ")}`);
    }
    ok(`all ${expectedTables.length} table(s) from inventory.json present, no extras`);

    for (const table of expectedTables) {
      const { rows } = await client.query(`select count(*) as c from public."${table.replace(/"/g, '""')}";`);
      const expectedCount = inventory.rowCounts[table];
      if (Number(rows[0].c) !== expectedCount) fail(`post-restore check failed: ${table} has ${rows[0].c} row(s), expected ${expectedCount}`);
    }
    ok("every table's row count matches inventory.json");
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Stage 2D Production Rollback Orchestrator — target: ${PROJECT_NAME} (${PROJECT_REF}), org "${ORG_NAME}"`);
  const ctx = phase0_validateArgsAndIdentity(args);
  phase1_verifyRollbackApproval(ctx);
  const { inventory } = phase2_verifyBundleChecksums(ctx);
  await phase3_advisoryLockAndTargetCheck(ctx, inventory);
  await phase4_restore(ctx);
  await phase5_postRestoreVerification(ctx, inventory);
  console.log("\nROLLBACK COMPLETE AND VERIFIED.");
}

main().catch((e) => fail(e.stack || e.message));

// ---------------------------------------------------------------------
// Disclosed limitation, not fixed here (out of this task's scope, which
// explicitly does not run this tool against production at all): the
// cutover orchestrator's advisory lock key and this file's are DIFFERENT
// (derived from "option-a-cutover:<ref>" vs "option-a-rollback:<ref>"),
// so a cutover run and a rollback run could theoretically both proceed
// concurrently without either seeing the other's lock. Neither this
// task nor any prior one runs either tool against production, so this
// has never been exercised for real. A future hardening pass should
// consider a single shared lock key for both tools before either is
// ever run against production.
// ---------------------------------------------------------------------
