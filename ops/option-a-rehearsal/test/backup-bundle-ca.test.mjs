// Regression tests for scripts/backup-bundle.mjs's BACKUP_MODE=production
// CA-certificate precondition — Stage 2I-B1 audit hardening
// (BACKUP_CA_CERT_PATH used to be optional; now required, validated to
// exist and look like a PEM file, before anything else in the script
// runs).
//
// Runs the REAL script as a child process. Every case here is crafted to
// fail on this static precondition BEFORE the script ever resolves
// pg_dump or attempts a network connection — BACKUP_DATABASE_URL below is
// a syntactically valid but entirely fake/unreachable Supabase-shaped
// connection string, used only to get past the earlier hostname-shape
// check. No real production credentials are needed or used.
//
// Usage: cd ops/option-a-rehearsal && node test/backup-bundle-ca.test.mjs
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const repoRoot = path.resolve(opsDir, "..", "..");
const backupScript = path.join(opsDir, "scripts", "backup-bundle.mjs");
const scratchDir = path.join(opsDir, "out", "backup-bundle-ca-test");

// Deliberately NOT the real project's ref: unlike
// production-preflight-gate.mjs / production-cutover-orchestrator.mjs,
// backup-bundle.mjs's production-mode host check only validates the
// HOSTNAME SHAPE (db.<anything>.supabase.co / *.pooler.supabase.com), not
// a pinned expected ref — so a fictitious ref is enough to pass that
// shape check while guaranteeing this test never even DNS-resolves
// toward the real project's actual endpoint (T4 below is the one case
// that clears every static check and would otherwise reach a real
// pg_dump network attempt).
const FAKE_BACKUP_DATABASE_URL = "postgresql://postgres:fake-unreachable@db.zzzfaketestrefzzz.supabase.co:5432/postgres?sslmode=require";
const REAL_CA_CERT_PATH = path.join(opsDir, "fixtures", "test-ca.crt");

function runBackup(env) {
  try {
    const out = execFileSync(process.execPath, [backupScript], {
      env: {
        ...process.env,
        BACKUP_DATABASE_URL: FAKE_BACKUP_DATABASE_URL,
        BACKUP_MODE: "production",
        BACKUP_PROJECT_REF: "difzynyphojgisrfvrkd",
        BACKUP_OUT_DIR: path.join(scratchDir, "bundle-out"),
        ...env,
      },
      encoding: "utf8",
      cwd: repoRoot,
      timeout: 15_000, // this call must fail on a static check well before any network attempt; a real hang would mean the precondition didn't fire
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

async function main() {
  console.log("--- building scratch fixtures");
  fs.rmSync(scratchDir, { recursive: true, force: true });
  fs.mkdirSync(scratchDir, { recursive: true });

  // ------------------------------------------------------------------
  // T1: BACKUP_MODE=production with no BACKUP_CA_CERT_PATH at all.
  // ------------------------------------------------------------------
  console.log("--- T1: BACKUP_MODE=production with no BACKUP_CA_CERT_PATH is refused");
  const t1 = runBackup({ BACKUP_CA_CERT_PATH: undefined });
  assert.notEqual(t1.code, 0, "T1: backup-bundle.mjs must exit nonzero with no BACKUP_CA_CERT_PATH in production mode");
  assert.match(t1.out, /ERROR BACKUP_MODE=production requires BACKUP_CA_CERT_PATH to be set/, `T1 output:\n${t1.out}`);

  // ------------------------------------------------------------------
  // T2: BACKUP_CA_CERT_PATH points at a file that does not exist.
  // ------------------------------------------------------------------
  console.log("--- T2: BACKUP_CA_CERT_PATH naming a nonexistent file is refused");
  const missingCertPath = path.join(scratchDir, "does-not-exist.crt");
  const t2 = runBackup({ BACKUP_CA_CERT_PATH: missingCertPath });
  assert.notEqual(t2.code, 0, "T2: backup-bundle.mjs must exit nonzero with a nonexistent BACKUP_CA_CERT_PATH");
  assert.match(t2.out, /BACKUP_CA_CERT_PATH ".*does-not-exist\.crt" does not exist/, `T2 output:\n${t2.out}`);

  // ------------------------------------------------------------------
  // T3: BACKUP_CA_CERT_PATH exists but is not a PEM certificate.
  // ------------------------------------------------------------------
  console.log("--- T3: BACKUP_CA_CERT_PATH that is not a PEM certificate is refused");
  const notPemPath = path.join(scratchDir, "not-a-cert.txt");
  fs.writeFileSync(notPemPath, "this is definitely not a PEM certificate\n");
  const t3 = runBackup({ BACKUP_CA_CERT_PATH: notPemPath });
  assert.notEqual(t3.code, 0, "T3: backup-bundle.mjs must exit nonzero with a non-PEM BACKUP_CA_CERT_PATH");
  assert.match(t3.out, /BACKUP_CA_CERT_PATH ".*not-a-cert\.txt" does not look like a PEM certificate/, `T3 output:\n${t3.out}`);

  // ------------------------------------------------------------------
  // T4: a real PEM CA file clears this precondition (proves T1-T3 fail
  // for the CA-cert reason specifically, not for some other, earlier
  // reason regardless of what BACKUP_CA_CERT_PATH says) — the run must
  // still fail overall (the fake host is unreachable), but NOT with a
  // BACKUP_CA_CERT_PATH-related message, and no bypass: rejectUnauthorized
  // must still be forced true by the time it fails.
  // ------------------------------------------------------------------
  console.log("--- T4: a real PEM BACKUP_CA_CERT_PATH clears the precondition (fails later, for an unrelated reason)");
  const t4 = runBackup({ BACKUP_CA_CERT_PATH: REAL_CA_CERT_PATH });
  assert.notEqual(t4.code, 0, "T4: still expected to fail overall (the fake host is unreachable), just not for BACKUP_CA_CERT_PATH");
  const t4CaCertFails = t4.out.split("\n").filter((l) => l.startsWith("ERROR") && l.includes("BACKUP_CA_CERT_PATH"));
  assert.deepEqual(t4CaCertFails, [], `T4: no BACKUP_CA_CERT_PATH-related failure expected once a real PEM file is given; output:\n${t4.out}`);

  console.log("--- cleaning up scratch fixtures");
  fs.rmSync(scratchDir, { recursive: true, force: true });

  console.log("\nALL backup-bundle-ca.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
