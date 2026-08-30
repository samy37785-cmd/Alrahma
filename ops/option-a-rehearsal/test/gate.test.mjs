// Automated test for scripts/production-preflight-gate.mjs — Round 2
// Section 5 hardening. Runs the REAL gate script as a child process
// (not a reimplementation of its logic) against a dedicated, disposable
// database, plus a handful of on-the-fly fixture files, covering:
//   - the full positive matrix (every check except worktree-cleanliness,
//     which depends on this real repo's live git state and is exercised
//     separately below via the exact command the gate itself runs)
//   - every new --mode production static-check failure this round added
//     (legacy checksum format, backup bundle sourceMode, backup bundle
//     projectRef, approvedBy LOCAL-FIXTURE literal)
//   - two live-DB tamper cases: a function body-hash mismatch, and an
//     event-trigger tag mismatch
//
// Requires: TEST_DATABASE_URL pointing at a local Docker Postgres.
// Usage: TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
//        node test/gate.test.mjs
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";
import assert from "node:assert/strict";
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions, assertLocalHost } from "../../../lib/db/test/local-harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const repoRoot = path.resolve(opsDir, "..", "..");
const fixturePath = path.join(opsDir, "fixtures", "old_public_schema.sql");
const gateScript = path.join(opsDir, "scripts", "production-preflight-gate.mjs");
const scratchDir = path.join(opsDir, "out", "gate-test-automated");

const baseConnectionString = process.env.TEST_DATABASE_URL;
if (!baseConnectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
assertLocalHost(baseConnectionString, "TEST_DATABASE_URL");

const dbName = "alrahma_gate_test";
const maintenanceUrl = new URL(baseConnectionString);
maintenanceUrl.pathname = "/postgres";
const testUrl = new URL(baseConnectionString);
testUrl.pathname = `/${dbName}`;

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function runGate(env, extraArgs = []) {
  const args = [
    gateScript,
    "--project-ref", "difzynyphojgisrfvrkd",
    "--confirm-token", "I-UNDERSTAND-THIS-WILL-DROP-PRODUCTION-difzynyphojgisrfvrkd",
    ...extraArgs,
  ];
  try {
    const out = execFileSync(process.execPath, args, {
      env: { ...process.env, ...env },
      encoding: "utf8",
      cwd: repoRoot,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

function buildFixtures() {
  fs.rmSync(scratchDir, { recursive: true, force: true });
  fs.mkdirSync(scratchDir, { recursive: true });

  fs.writeFileSync(path.join(scratchDir, "dump.bin"), "fake dump content for automated gate test\n");
  const dumpSha = sha256(path.join(scratchDir, "dump.bin"));
  const bundle = (sourceMode, projectRef) => ({
    generatedAt: new Date().toISOString(),
    sourceMode,
    projectRef,
    files: [{ name: "dump.bin", size: fs.statSync(path.join(scratchDir, "dump.bin")).size, sha256: dumpSha }],
  });
  fs.writeFileSync(path.join(scratchDir, "manifest-local.json"), JSON.stringify(bundle("local", "difzynyphojgisrfvrkd"), null, 2));
  fs.writeFileSync(path.join(scratchDir, "manifest-production.json"), JSON.stringify(bundle("production", "difzynyphojgisrfvrkd"), null, 2));
  fs.writeFileSync(path.join(scratchDir, "manifest-wrongref.json"), JSON.stringify(bundle("production", "someotherref"), null, 2));
  fs.writeFileSync(path.join(scratchDir, "checksum-legacy.sha256"), `${dumpSha}  dump.bin\n`);

  // A real, correct approval manifest — fingerprint hash, migration
  // checksums, and tool checksums all freshly computed from what's
  // actually on disk right now, exactly as an operator would regenerate
  // it before use (see fixtures/approval-manifest.example.json's own
  // _comment for the same discipline).
  const fingerprintHash = execFileSync(process.execPath, [gateScript, "--print-fingerprint-hash"], { encoding: "utf8" }).trim();
  const drizzleDir = path.join(repoRoot, "lib", "db", "drizzle");
  const migrationChecksums = fs.readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => ({ file: f, sha256: sha256(path.join(drizzleDir, f)) }));
  const toolFiles = [
    "sql/surgical-reset.sql",
    "scripts/production-preflight-gate.mjs",
    "scripts/backup-bundle.mjs",
    "scripts/restore-bundle.mjs",
    "scripts/03-surgical-reset.mjs",
  ];
  const toolChecksums = toolFiles.map((f) => ({ file: f, sha256: sha256(path.join(opsDir, f)) }));
  const branch = execSync("git branch --show-current", { encoding: "utf8", cwd: repoRoot }).trim();
  const sha = execSync("git rev-parse HEAD", { encoding: "utf8", cwd: repoRoot }).trim();

  const approvalManifestGood = {
    projectRef: "difzynyphojgisrfvrkd",
    approvedBranch: branch,
    approvedCommitSha: sha,
    expectedRemoteFingerprintSha256: fingerprintHash,
    migrationChecksums,
    toolChecksums,
    backupBundleManifestSha256: sha256(path.join(scratchDir, "manifest-local.json")),
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    approvedBy: "a real reviewer, for this test only — not LOCAL-FIXTURE",
  };
  fs.writeFileSync(path.join(scratchDir, "approval-manifest-good.json"), JSON.stringify(approvalManifestGood, null, 2));

  const approvalManifestLocalFixture = { ...approvalManifestGood, approvedBy: "LOCAL-FIXTURE — not a real approver" };
  fs.writeFileSync(path.join(scratchDir, "approval-manifest-local-fixture-approver.json"), JSON.stringify(approvalManifestLocalFixture, null, 2));

  return { dumpSha };
}

async function loadOldFixtureWithSupabaseShapedAcl(client) {
  await createLocalAuthUsersStub(client);
  await client.query(`alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;`);
  await client.query(`alter table auth.users add column if not exists aud text;`);
  await client.query(`alter table auth.users add column if not exists role text;`);
  await client.query(`alter table auth.users add column if not exists created_at timestamptz not null default now();`);
  await createLocalAuthRolesAndFunctions(client);
  // Match the real Supabase-provisioned public schema owner/ACL shape
  // exactly (EXPECTED_SCHEMA_OWNER/ACL in the gate script) — a fresh
  // plain-Postgres 17 database owns `public` as `pg_database_owner` by
  // default (Postgres 15+'s own default), which does NOT match what
  // Supabase actually provisions (owner=postgres, an explicit ACL).
  await client.query(`
    alter schema public owner to postgres;
    revoke all on schema public from public;
    grant usage, create on schema public to postgres;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await client.query(fs.readFileSync(fixturePath, "utf8"));
  // The fixture seeds a handful of synthetic rows (blogs/subscribers/
  // the trigger-derived profiles row, plus its own auth.users row) —
  // the gate's live checks require every old table AND auth.users to
  // be empty (a real precondition: Surgical Reset must never run
  // against a database that still has live data in it). Clear them for
  // the gate test; surgical-reset.test.mjs is what actually verifies
  // the fixture's seed data made it into the tables/trigger correctly.
  await client.query(`truncate public.blogs, public.subscribers, public.profiles cascade;`);
  await client.query(`delete from auth.users;`);
  // A real Supabase project always has a storage schema with buckets/
  // objects tables — the gate queries them unconditionally. A plain
  // throwaway Postgres container has neither; stub the minimal shape
  // needed for the gate's own `select count(*)` to succeed.
  await client.query(`
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text);
  `);
}

async function main() {
  console.log("--- building on-the-fly gate test fixtures");
  buildFixtures();

  console.log(`--- (re)creating dedicated test database ${dbName}`);
  const admin = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force);`);
  await admin.query(`create database ${dbName};`);
  await admin.end();

  const client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  await loadOldFixtureWithSupabaseShapedAcl(client);
  await client.end();

  const goodManifest = path.join(scratchDir, "approval-manifest-good.json");

  // ------------------------------------------------------------------
  // T1: positive matrix — everything except worktree-cleanliness (that
  // check runs the exact same `git status --porcelain` this repo's own
  // live state answers; asserted separately in T1b below rather than
  // faked here).
  // ------------------------------------------------------------------
  console.log("--- T1: full positive matrix (mode=local)");
  const t1 = runGate(
    { GATE_DATABASE_URL: testUrl.toString() },
    ["--mode", "local", "--approval-manifest", goodManifest, "--dump-file", path.join(scratchDir, "dump.bin"), "--checksum-file", path.join(scratchDir, "manifest-local.json")]
  );
  console.log(t1.out);
  const t1FailLines = t1.out.split("\n").filter((l) => l.startsWith("FAIL"));
  const t1NonWorktreeFails = t1FailLines.filter((l) => !l.includes("worktree is not clean"));
  assert.deepEqual(t1NonWorktreeFails, [], `T1: every check except worktree-cleanliness must pass; got:\n${t1NonWorktreeFails.join("\n")}`);
  assert.match(t1.out, /PASS {2}function handle_new_user: security_definer \+ search_path \+ args \+ return type \+ body hash all match/);
  assert.match(t1.out, /PASS {2}function rls_auto_enable: security_definer \+ search_path \+ args \+ return type \+ body hash all match/);
  assert.match(t1.out, /PASS {2}trigger on_auth_user_created matches the approved old inventory exactly, including its target function/);
  assert.match(t1.out, /PASS {2}event trigger rls_auto_enable_trigger is present, enabled, and its event\/tags\/handler match/);
  assert.match(t1.out, /PASS {2}public schema owner \(postgres\) and ACL match the pinned expectation exactly/);
  assert.match(t1.out, /PASS {2}all \d+ tool file\(s\) match the approval manifest exactly/);

  console.log("--- T1b: the worktree-cleanliness check runs the exact command this repo's own git state answers");
  const realPorcelain = execSync("git status --porcelain", { encoding: "utf8", cwd: repoRoot }).trim();
  if (realPorcelain.length > 0) {
    assert.ok(t1.out.includes("FAIL  worktree is not clean"), "T1b: dirty real worktree must produce the FAIL line");
  } else {
    assert.ok(t1.out.includes("PASS  worktree is clean"), "T1b: clean real worktree must produce the PASS line");
  }

  // ------------------------------------------------------------------
  // T2: legacy checksum format refused outright in production
  // ------------------------------------------------------------------
  console.log("--- T2: --mode production refuses the legacy single-file checksum format");
  const t2 = runGate(
    { GATE_DATABASE_URL: "postgresql://postgres:x@db.difzynyphojgisrfvrkd.supabase.co:5432/postgres?sslmode=require" },
    ["--mode", "production", "--approval-manifest", goodManifest, "--dump-file", path.join(scratchDir, "dump.bin"), "--checksum-file", path.join(scratchDir, "checksum-legacy.sha256")]
  );
  assert.notEqual(t2.code, 0);
  assert.match(t2.out, /refuses the legacy single-file checksum format/);

  // ------------------------------------------------------------------
  // T3: backup bundle sourceMode="local" refused under --mode production
  // ------------------------------------------------------------------
  console.log("--- T3: --mode production refuses a local-sourced backup bundle");
  const t3 = runGate(
    { GATE_DATABASE_URL: "postgresql://postgres:x@db.difzynyphojgisrfvrkd.supabase.co:5432/postgres?sslmode=require" },
    ["--mode", "production", "--approval-manifest", goodManifest, "--dump-file", path.join(scratchDir, "dump.bin"), "--checksum-file", path.join(scratchDir, "manifest-local.json")]
  );
  assert.notEqual(t3.code, 0);
  assert.match(t3.out, /requires the backup bundle's own sourceMode to be "production"/);

  // ------------------------------------------------------------------
  // T4: backup bundle projectRef mismatch refused under --mode production
  // ------------------------------------------------------------------
  console.log("--- T4: --mode production refuses a backup bundle stamped with the wrong projectRef");
  const t4 = runGate(
    { GATE_DATABASE_URL: "postgresql://postgres:x@db.difzynyphojgisrfvrkd.supabase.co:5432/postgres?sslmode=require" },
    ["--mode", "production", "--approval-manifest", goodManifest, "--dump-file", path.join(scratchDir, "dump.bin"), "--checksum-file", path.join(scratchDir, "manifest-wrongref.json")]
  );
  assert.notEqual(t4.code, 0);
  assert.match(t4.out, /requires the backup bundle's own projectRef \("someotherref"\) to equal --project-ref/);

  // ------------------------------------------------------------------
  // T5: approvedBy LOCAL-FIXTURE literal refused under --mode production
  // ------------------------------------------------------------------
  console.log("--- T5: --mode production refuses an approval manifest whose approvedBy is the LOCAL-FIXTURE literal");
  const localFixtureManifest = path.join(scratchDir, "approval-manifest-local-fixture-approver.json");
  const t5 = runGate(
    { GATE_DATABASE_URL: "postgresql://postgres:x@db.difzynyphojgisrfvrkd.supabase.co:5432/postgres?sslmode=require" },
    ["--mode", "production", "--approval-manifest", localFixtureManifest, "--dump-file", path.join(scratchDir, "dump.bin"), "--checksum-file", path.join(scratchDir, "manifest-production.json")]
  );
  assert.notEqual(t5.code, 0);
  assert.match(t5.out, /refuses an approval manifest whose approvedBy is the known LOCAL-FIXTURE literal/);

  // ------------------------------------------------------------------
  // T6: function body-hash mismatch detected (live DB tamper)
  // ------------------------------------------------------------------
  console.log("--- T6: function body-hash mismatch is detected");
  const c6 = new pg.Client({ connectionString: testUrl.toString() });
  await c6.connect();
  await c6.query(`
    create or replace function public.handle_new_user()
    returns trigger language plpgsql security definer set search_path to 'public' as $f$
    begin insert into public.profiles (id, email, name, role) values (new.id, new.email, 'TAMPERED', 'student'::role); return new; end;
    $f$;
  `);
  await c6.end();
  const t6 = runGate({ GATE_DATABASE_URL: testUrl.toString() }, ["--mode", "local", "--approval-manifest", goodManifest, "--dump-file", path.join(scratchDir, "dump.bin"), "--checksum-file", path.join(scratchDir, "manifest-local.json")]);
  assert.notEqual(t6.code, 0);
  assert.match(t6.out, /function handle_new_user: body hash is .*, expected .*\(pg_get_functiondef\(\) text differs/);

  // Restore the EXACT original body before the next case. pg_get_functiondef()
  // preserves body text byte-for-byte as submitted (only the signature/
  // header lines get reformatted) — this must match
  // EXPECTED_FUNCTIONS.handle_new_user.bodySha256's source text in
  // scripts/production-preflight-gate.mjs exactly, indentation included,
  // or this "restore" produces a different hash than the original.
  const c6b = new pg.Client({ connectionString: testUrl.toString() });
  await c6b.connect();
  await c6b.query(`create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' = 'parent' then 'parent'::role
      else 'student'::role
    end
  );
  return new;
end;
$function$;`);
  await c6b.end();

  // ------------------------------------------------------------------
  // T7: event trigger tag mismatch detected (live DB tamper)
  // ------------------------------------------------------------------
  console.log("--- T7: event trigger tag mismatch is detected");
  const c7 = new pg.Client({ connectionString: testUrl.toString() });
  await c7.connect();
  await c7.query(`drop event trigger if exists rls_auto_enable_trigger;`);
  await c7.query(`create event trigger rls_auto_enable_trigger on ddl_command_end when tag in ('CREATE TABLE') execute function public.rls_auto_enable();`);
  await c7.end();
  const t7 = runGate({ GATE_DATABASE_URL: testUrl.toString() }, ["--mode", "local", "--approval-manifest", goodManifest, "--dump-file", path.join(scratchDir, "dump.bin"), "--checksum-file", path.join(scratchDir, "manifest-local.json")]);
  assert.notEqual(t7.code, 0);
  assert.match(t7.out, /event trigger "rls_auto_enable_trigger": evttags are \["CREATE TABLE"\]/);

  // restore, verified back to a clean positive pass (minus worktree)
  const c7b = new pg.Client({ connectionString: testUrl.toString() });
  await c7b.connect();
  await c7b.query(`drop event trigger if exists rls_auto_enable_trigger;`);
  await c7b.query(`create event trigger rls_auto_enable_trigger on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();`);
  await c7b.end();
  const t7c = runGate({ GATE_DATABASE_URL: testUrl.toString() }, ["--mode", "local", "--approval-manifest", goodManifest, "--dump-file", path.join(scratchDir, "dump.bin"), "--checksum-file", path.join(scratchDir, "manifest-local.json")]);
  const t7cNonWorktreeFails = t7c.out.split("\n").filter((l) => l.startsWith("FAIL") && !l.includes("worktree is not clean"));
  assert.deepEqual(t7cNonWorktreeFails, [], `T7 restore-check: every check except worktree-cleanliness must pass again after restoring; got:\n${t7cNonWorktreeFails.join("\n")}`);

  console.log("--- cleaning up dedicated test database and scratch fixtures");
  const admin2 = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin2.connect();
  await admin2.query(`drop database if exists ${dbName} with (force);`);
  await admin2.end();
  fs.rmSync(scratchDir, { recursive: true, force: true });

  console.log("\nALL gate.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
