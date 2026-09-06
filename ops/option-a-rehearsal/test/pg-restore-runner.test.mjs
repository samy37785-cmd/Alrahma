// Fast, no-database unit tests for scripts/lib/pg-restore-runner.mjs's
// pure/near-pure helpers — the things the Stage 2D "Rollback Privilege +
// Strict TLS Final Corrective" and "Final Three-Gate Closure" tasks
// specifically asked to be provable without a live restore:
//   1. TOC filtering: the bundle's three supabase_admin-owned
//      DEFAULT ACL entries (the ones a non-member connecting role can't
//      replay) are excluded, everything else survives untouched.
//   2. Credentials never become process arguments: pgEnvFromUrl parses a
//      connection URL into libpq's own PG* names (never a connection-
//      string shape), and runClientTool's actual child-process argv
//      contains neither the password nor a connection URL — proven by
//      spawning a REAL disposable child process and inspecting its OWN
//      process.argv, not by inspecting the args array we built.
//   3. Credential redaction (kept as defense-in-depth, not the primary
//      control): an execFile-shaped failure whose command line embeds a
//      connection-string password must never leak that password through
//      message/cmd/stack once redactSecretsFromError has run on it.
//
// Usage: cd ops/option-a-rehearsal && node test/pg-restore-runner.test.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { filterRestoreToc, pgEnvFromUrl, runClientTool, redactSecretsFromError } from "../scripts/lib/pg-restore-runner.mjs";

const execFileAsync = promisify(execFile);

// A synthetic TOC modeled directly on the REAL production bundle's own
// `pg_restore --list` output (captured locally, read-only, from the
// bundle already sitting in out/production-backup-bundle/ — see the
// final report for the exact real lines this was copied from).
const SAMPLE_TOC = `;
; Archive created at 2026-09-05 19:34:36 UTC
;     dbname: postgres
;     TOC Entries: 242
;
21; 2615 2200 SCHEMA - public pg_database_owner
4140; 0 0 COMMENT - SCHEMA public pg_database_owner
4141; 0 0 ACL - SCHEMA public pg_database_owner
1145; 1247 17488 TYPE public role postgres
420; 1255 17485 FUNCTION public rls_auto_enable() postgres
4143; 0 0 ACL public FUNCTION rls_auto_enable() postgres
421; 1255 18067 FUNCTION public handle_new_user() postgres
4142; 0 0 ACL public FUNCTION handle_new_user() postgres
287; 1259 17636 TABLE public admin_lockouts postgres
4144; 0 0 ACL public TABLE admin_lockouts postgres
2450; 826 16492 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES postgres
2454; 826 16496 DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES supabase_admin
2451; 826 16493 DEFAULT ACL public DEFAULT PRIVILEGES FOR FUNCTIONS postgres
2455; 826 16497 DEFAULT ACL public DEFAULT PRIVILEGES FOR FUNCTIONS supabase_admin
2452; 826 16494 DEFAULT ACL public DEFAULT PRIVILEGES FOR SEQUENCES postgres
2453; 826 16495 DEFAULT ACL public DEFAULT PRIVILEGES FOR SEQUENCES supabase_admin
`;

async function main() {
  console.log("--- filterRestoreToc: excludes exactly the 3 supabase_admin DEFAULT ACL entries, nothing else");
  const filtered = filterRestoreToc(SAMPLE_TOC);
  assert.ok(!/DEFAULT ACL.*supabase_admin/.test(filtered), "no supabase_admin DEFAULT ACL line must survive");
  assert.equal((filtered.match(/DEFAULT ACL/g) || []).length, 3, "the 3 `FOR ROLE postgres` DEFAULT ACL entries must survive untouched");
  assert.ok(/DEFAULT PRIVILEGES FOR TABLES postgres/.test(filtered));
  assert.ok(/DEFAULT PRIVILEGES FOR FUNCTIONS postgres/.test(filtered));
  assert.ok(/DEFAULT PRIVILEGES FOR SEQUENCES postgres/.test(filtered));
  console.log("OK    exactly the 3 supabase_admin-owned entries removed, all 3 postgres-owned ones kept");

  console.log("--- filterRestoreToc: still excludes the pre-existing SCHEMA public / rls_auto_enable entries");
  assert.ok(!/^21;.*SCHEMA - public/m.test(filtered), "CREATE SCHEMA public entry must still be excluded");
  assert.ok(!/COMMENT - SCHEMA public/.test(filtered), "schema comment entry must still be excluded");
  assert.ok(!/ACL - SCHEMA public/.test(filtered), "schema ACL entry must still be excluded");
  assert.ok(!/^\d+;.*FUNCTION public rls_auto_enable\(\)/m.test(filtered), "rls_auto_enable() CREATE entry must still be excluded");
  console.log("OK    the two pre-existing exclusions are unaffected by the new one");

  console.log("--- filterRestoreToc: real object entries (tables, other functions, types) are never touched");
  assert.ok(/TABLE public admin_lockouts postgres/.test(filtered));
  assert.ok(/FUNCTION public handle_new_user\(\)/.test(filtered));
  assert.ok(/ACL public FUNCTION handle_new_user\(\)/.test(filtered));
  assert.ok(/TYPE public role postgres/.test(filtered));
  console.log("OK    ordinary schema-content entries all survive");

  console.log("--- filterRestoreToc: OLD behavior (no supabase_admin exclusion) would have kept the dangerous lines — proving this is a real fix, not a no-op");
  const oldFilter = (tocText) =>
    tocText
      .split("\n")
      .filter((line) => !/\bSCHEMA\s*-?\s*public\b/.test(line))
      .filter((line) => !/\bFUNCTION\s+public\s+rls_auto_enable\(/.test(line))
      .join("\n");
  const oldFiltered = oldFilter(SAMPLE_TOC);
  assert.ok(/DEFAULT ACL.*supabase_admin/.test(oldFiltered), "sanity check: the OLD filter really did let supabase_admin DEFAULT ACL lines through");
  console.log("OK    confirmed the old filter pattern would have shipped the exact lines that fail under a non-member actor");

  const secretPassword = "SUPERSECRETPASSWORD";
  const secretUrl = `postgresql://postgres.abc:${secretPassword}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`;

  console.log("--- pgEnvFromUrl: parses a connection URL into libpq's PG* names, never a connection-string shape");
  const pgEnv = pgEnvFromUrl(secretUrl);
  assert.deepEqual(pgEnv, {
    PGHOST: "aws-1-eu-west-1.pooler.supabase.com",
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: "postgres.abc",
    PGPASSWORD: secretPassword,
  });
  for (const value of Object.values(pgEnv)) {
    assert.ok(!String(value).includes("://"), `no pgEnv value should be a connection-string fragment: ${value}`);
  }
  console.log("OK    parsed into PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD, none shaped like a URL");

  console.log("--- runClientTool ('path' kind): the CHILD PROCESS's own argv never contains the password or a connection URL, env carries it correctly");
  {
    const scriptPath = path.join(os.tmpdir(), `pg-restore-runner-test-argv-${process.pid}.mjs`);
    fs.writeFileSync(
      scriptPath,
      `console.log(JSON.stringify({ argv: process.argv.slice(2), PGPASSWORD: process.env.PGPASSWORD, PGHOST: process.env.PGHOST }));`
    );
    try {
      const { stdout } = await runClientTool(
        { kind: "path", bin: process.execPath },
        [scriptPath, "--dbname", pgEnv.PGDATABASE, "--exit-on-error", "--single-transaction"],
        os.tmpdir(),
        pgEnv
      );
      const seen = JSON.parse(stdout);
      assert.deepEqual(seen.argv, ["--dbname", "postgres", "--exit-on-error", "--single-transaction"], "the child's own argv must be exactly the non-secret flags — no URL, no password, anywhere in it");
      for (const arg of seen.argv) {
        assert.ok(!arg.includes(secretPassword), `argv entry must not contain the password: ${arg}`);
        assert.ok(!arg.includes("://"), `argv entry must not be connection-string shaped: ${arg}`);
      }
      assert.equal(seen.PGPASSWORD, secretPassword, "the password must still reach the child — via env, not argv");
      assert.equal(seen.PGHOST, pgEnv.PGHOST);
      console.log("OK    child argv is credential-free; PGPASSWORD/PGHOST correctly delivered via environment instead");
    } finally {
      fs.rmSync(scriptPath, { force: true });
    }
  }

  console.log("--- runClientTool ('path' kind): on a REAL failure, error.message/.cmd/.stack contain neither the password nor a connection URL");
  {
    const scriptPath = path.join(os.tmpdir(), `pg-restore-runner-test-fail-${process.pid}.mjs`);
    fs.writeFileSync(scriptPath, `process.exit(1);`);
    let caught = null;
    try {
      await runClientTool({ kind: "path", bin: process.execPath }, [scriptPath, "--dbname", pgEnv.PGDATABASE], os.tmpdir(), pgEnv);
    } catch (e) {
      caught = e;
    } finally {
      fs.rmSync(scriptPath, { force: true });
    }
    assert.ok(caught, "expected the disposable script to fail");
    for (const field of ["message", "cmd", "stack"]) {
      const value = caught[field] || "";
      assert.ok(!value.includes(secretPassword), `error.${field} must not contain the password (it was never an argument): ${value}`);
      assert.ok(!value.includes("://"), `error.${field} must not contain a connection-string fragment: ${value}`);
    }
    console.log("OK    a real runClientTool failure carries no credential anywhere — argv never had one, and redaction (defense-in-depth) still ran");
  }

  console.log("--- redactSecretsFromError: strips a connection-string password from message/cmd/stack/stdout/stderr");
  const secret = "SUPERSECRETPASSWORD";
  const fakeError = new Error(`Command failed: pg_restore --dbname postgresql://postgres:${secret}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres --single-transaction\nsome stderr text with postgresql://postgres:${secret}@host/db in it too`);
  fakeError.cmd = `pg_restore --dbname postgresql://postgres:${secret}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;
  fakeError.stdout = "";
  fakeError.stderr = `pg_restore: error: connection to server failed: postgresql://postgres:${secret}@host/db`;
  fakeError.stack = `Error: Command failed\n    at somewhere (postgresql://postgres:${secret}@host/db)`;
  const redacted = redactSecretsFromError(fakeError);
  for (const field of ["message", "cmd", "stack", "stderr"]) {
    assert.ok(!redacted[field].includes(secret), `redacted.${field} must not contain the password:\n${redacted[field]}`);
    assert.ok(redacted[field].includes("REDACTED"), `redacted.${field} should show a REDACTED marker in place of the password`);
  }
  console.log("OK    password scrubbed from every field, replaced with a REDACTED marker");

  console.log("--- redactSecretsFromError: reproduces Node's real execFile leak, then proves the scrub closes it");
  {
    let caught = null;
    try {
      await execFileAsync(process.execPath, ["-e", "process.exit(1)", "--dbname", `postgresql://postgres:${secret}@example.com/postgres`]);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, "expected the disposable child process to fail");
    assert.ok(caught.message.includes(secret), "sanity check: Node's raw error really does leak the password (confirms the bug this fix closes)");
    const scrubbed = redactSecretsFromError(caught);
    assert.ok(!scrubbed.message.includes(secret), "after redactSecretsFromError, the raw Node error must no longer contain the password");
    console.log("OK    Node's real execFile leak reproduced, then closed by redactSecretsFromError");
  }

  console.log("\nALL pg-restore-runner.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
