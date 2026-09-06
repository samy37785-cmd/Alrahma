#!/usr/bin/env node
// Stage 2D "Final Three-Gate Closure" — item 3.
//
// Proves, against the REAL production project, that a native-libpq
// connection (psql — NOT the Node `pg` driver, which has different
// sslmode semantics; see lib/pg-connection.mjs's own discovery of that
// asymmetry) using the EXACT same PGSSLMODE=verify-full / PGSSLROOTCERT
// / host that production-rollback-orchestrator.mjs's pg_restore call
// will use (lib/pg-restore-runner.mjs's pgEnvFromUrl + strict-TLS env
// vars, reused directly here — not reimplemented) actually succeeds:
// real certificate verification, real hostname match, not merely
// "connects at all". Strictly read-only: BEGIN TRANSACTION READ ONLY,
// one identity SELECT, ROLLBACK. No DDL, no DML, no restore.
//
// If verify-full fails, this does NOT retry with a weaker sslmode —
// that would defeat the entire point of the probe. It reports the
// sanitized (credential-free) libpq error and a best-effort classification
// of whether the failure looks like a hostname mismatch or a certificate
// problem, then exits non-zero.
//
// Required (environment only, never a CLI flag, never logged):
//   PROBE_DATABASE_URL   a real Supabase host naming --project-ref.
// Required CLI flags:
//   --project-ref <ref>
//   --ca-cert-file <path>
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { resolveClientTool, runClientTool, pgEnvFromUrl, redactSecretsFromError } from "./lib/pg-restore-runner.mjs";

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

// Best-effort classification of a sanitized libpq error, so a human
// doesn't have to re-derive "is this a hostname problem or a cert
// problem" from raw text — never re-attempted automatically either way.
function classifyTlsFailure(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("does not match") || t.includes("hostname")) return "hostname mismatch (certificate does not name the host being connected to)";
  if (t.includes("certificate verify failed") || t.includes("self-signed") || t.includes("unable to get local issuer") || t.includes("certificate")) return "certificate verification failure (chain does not validate against the supplied --ca-cert-file)";
  if (t.includes("timeout") || t.includes("could not connect")) return "network/connectivity failure (not a TLS/certificate problem)";
  return "unclassified — see the sanitized error text above";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = args["project-ref"];
  const caCertFile = args["ca-cert-file"];
  if (!projectRef) fail("missing required --project-ref");
  if (!caCertFile) fail("missing required --ca-cert-file");
  if (!fs.existsSync(caCertFile)) fail(`--ca-cert-file "${caCertFile}" does not exist`);
  const caCert = fs.readFileSync(caCertFile, "utf8");
  if (!caCert.includes("-----BEGIN CERTIFICATE-----")) fail(`--ca-cert-file "${caCertFile}" does not look like a PEM certificate`);

  const databaseUrl = process.env.PROBE_DATABASE_URL;
  if (!databaseUrl) fail("PROBE_DATABASE_URL must be set (environment only, never a CLI flag).");

  step("Phase 0 — identity validation (same discipline as every other production tool in this repo)");
  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (e) {
    fail(`PROBE_DATABASE_URL is not a parseable URL: ${e.message}`);
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
    fail(`refusing a local/private host ("${hostname}") — this tool probes production only, it has no local mode.`);
  }
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(hostname);
  const isPooler = hostname.endsWith(".pooler.supabase.com");
  if (directMatch) {
    if (directMatch[1] !== projectRef) fail(`hostname "${hostname}" names project ref "${directMatch[1]}", not "${projectRef}".`);
  } else if (isPooler) {
    const username = decodeURIComponent(parsedUrl.username || "");
    if (username !== `postgres.${projectRef}`) fail(`pooler username ("${username}") does not equal "postgres.${projectRef}".`);
  } else {
    fail(`PROBE_DATABASE_URL host "${hostname}" is not a real Supabase hostname (db.<ref>.supabase.co or *.pooler.supabase.com).`);
  }
  const sslmode = parsedUrl.searchParams.get("sslmode");
  if (sslmode !== "require" && sslmode !== "verify-full" && sslmode !== "verify-ca") {
    fail(`PROBE_DATABASE_URL must declare sslmode=require (or stricter), got "${sslmode}".`);
  }
  ok(`host/username matches project ref ${projectRef} (host: ${hostname} — the SAME host pg_restore will use)`);

  step("Phase 1 — resolving psql (PATH first, disposable Docker container fallback — same discipline as pg_restore)");
  const psql = await resolveClientTool("psql");
  ok(`psql resolved: ${psql.kind === "path" ? "found on PATH" : "using disposable postgres:17 Docker container"}`);

  // Same pgEnvFromUrl this task's pg-restore-runner.mjs fix uses for the
  // real rollback restore — not reimplemented here. PGSSLMODE is forced
  // to verify-full unconditionally: this probe's entire purpose is
  // proving verify-full itself works, so there is no weaker fallback.
  const pgEnv = pgEnvFromUrl(databaseUrl);
  pgEnv.PGSSLMODE = "verify-full";
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "strict-tls-probe-"));
  let caCertCopyPath = null;
  try {
    if (psql.kind === "docker") {
      caCertCopyPath = path.join(scratchDir, "ca.pem");
      fs.copyFileSync(caCertFile, caCertCopyPath);
      pgEnv.PGSSLROOTCERT = "/data/ca.pem";
    } else {
      pgEnv.PGSSLROOTCERT = path.resolve(caCertFile).replace(/\\/g, "/");
    }

    step("Phase 2 — BEGIN TRANSACTION READ ONLY; SELECT identity; ROLLBACK — via native libpq (psql), PGSSLMODE=verify-full");
    const sql = "BEGIN TRANSACTION READ ONLY; SELECT current_user, session_user, current_database(), inet_server_addr()::text as server_addr; ROLLBACK;";
    let stdout;
    try {
      const result = await runClientTool(
        psql,
        ["--dbname", pgEnv.PGDATABASE, "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-c", sql],
        scratchDir,
        pgEnv
      );
      stdout = result.stdout;
    } catch (e) {
      redactSecretsFromError(e);
      const sanitized = (e.stderr || e.message || "").toString();
      console.error(`\nSTRICT TLS PROBE FAILED (sanitized — no credentials shown):\n${sanitized}`);
      console.error(`\nLikely cause: ${classifyTlsFailure(sanitized)}`);
      console.error(`\nRefusing to retry with a weaker sslmode. Production was not modified (the failure happened before/during connection setup — no transaction was ever opened).`);
      process.exit(1);
    }

    ok("verify-full connection succeeded — real certificate chain AND hostname validated against --ca-cert-file, exactly as pg_restore will do it");
    console.log(`\n${stdout}`);
    ok("BEGIN TRANSACTION READ ONLY / ROLLBACK completed — no DDL, no DML, no restore, nothing could have been written even if attempted");
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }

  console.log("\nSTRICT TLS PRODUCTION READ-ONLY PROBE COMPLETE.");
}

main().catch((e) => {
  redactSecretsFromError(e);
  fail(e.stack || e.message);
});
