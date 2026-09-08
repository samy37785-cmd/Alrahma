// Regression tests for restore-bundle.mjs's Stage 2I-D hardening —
// proves both gaps found in Stage 2I-C (rehearsing this script against a
// REAL production bundle for the first time) are closed, with NO manual
// workaround of any kind:
//   1. rls_auto_enable() does NOT need to be pre-created on the target
//      before running this script — a stack fresh out of
//      `supabase db reset` genuinely doesn't have it (confirmed below,
//      not assumed), unlike the real hosted Supabase platform.
//   2. this script does NOT need to be run as `supabase_admin` to avoid
//      "permission denied to change default privileges" — the SAME
//      plain `postgres` actor a real production connection uses
//      restores cleanly, because the shared TOC filter
//      (scripts/lib/pg-restore-runner.mjs) now excludes the bundle's
//      supabase_admin DEFAULT ACL entries.
//
// Requires the REAL local Supabase CLI stack (real Postgres 17 + GoTrue +
// PostgREST), not bare Docker Postgres — same reasoning as every other
// rollback-*.test.mjs file here: RLS/policies/grants and a real Auth
// endpoint are all part of what this proof exercises against.
//
// This test calls `npx supabase db reset` itself (twice) — it is fully
// self-contained, no manual pre-reset step required beyond
// `npx supabase start` already running in this directory.
//
// Usage: cd ops/option-a-rehearsal && node test/restore-bundle-fresh-target.test.mjs
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const scratchBundleDir = path.join(opsDir, "out", "restore-bundle-fresh-target-test-bundle");
const scratchDefectiveBundleDir = path.join(opsDir, "out", "restore-bundle-fresh-target-test-defective-bundle");

// Plain `postgres` throughout — NOT `supabase_admin`. This is the whole
// point of the test: the real production connecting role is `postgres`,
// not a member of `supabase_admin`, and this script must work as that
// actor without any external workaround.
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function run(scriptRelPath, env, args = []) {
  const scriptPath = path.join(opsDir, scriptRelPath);
  return execFileSync(process.execPath, [scriptPath, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    cwd: opsDir,
  });
}

function supabaseDbReset() {
  execFileSync("npx", ["--yes", "supabase", "db", "reset"], {
    cwd: opsDir,
    encoding: "utf8",
    shell: process.platform === "win32", // npx resolves to npx.cmd on Windows; execFileSync cannot spawn that directly without shell:true
  });
}

async function assertStackIsUp() {
  const client = new pg.Client({ connectionString: DB_URL });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(
      `Could not connect to the local Supabase stack at ${DB_URL} (${e.message}). ` +
      `This test requires \`npx supabase start\` already running in ${opsDir} — it does not start the stack itself.`
    );
  }
  const { rows } = await client.query(`select to_regclass('storage.buckets') as t;`);
  await client.end();
  if (!rows[0].t) {
    throw new Error("storage.buckets does not exist — this does not look like a real Supabase-provisioned database. Run `npx supabase start`, don't point this at a plain Postgres container.");
  }
}

async function assertRlsAutoEnableAbsent(client, label) {
  const { rows } = await client.query(`select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace;`);
  assert.equal(rows.length, 0, `${label}: expected rls_auto_enable() to be genuinely absent (this test proves the FRESH-target case, not one where it happens to already exist)`);
}

async function countPublicForeignKeys(client) {
  const { rows } = await client.query(`
    select count(*)::int as c from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and n.nspname = 'public';
  `);
  return rows[0].c;
}

async function snapshotDefaultAclRaw(client) {
  const { rows } = await client.query(`
    select defaclrole::regrole::text as role, defaclnamespace::regnamespace::text as schema, defaclobjtype, defaclacl::text as acl
    from pg_default_acl order by role, schema, defaclobjtype;
  `);
  return rows;
}

async function main() {
  console.log("--- verifying the real local Supabase stack is up");
  await assertStackIsUp();

  // ==================================================================
  // PART 1: build a fresh local bundle to restore later, as `postgres`
  // throughout (not supabase_admin) — the fixture's own
  // rls_auto_enable()/event trigger end up owned by `postgres`, matching
  // the real production shape this test is reproducing.
  // ==================================================================
  console.log("--- supabase db reset (clean slate for building the source bundle)");
  supabaseDbReset();

  let client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await assertRlsAutoEnableAbsent(client, "after first db reset");
  console.log("--- loading the OLD 34-table fixture (as plain postgres)");
  await client.query(fs.readFileSync(path.join(opsDir, "fixtures", "old_public_schema.sql"), "utf8").replace(/\r\n/g, "\n"));
  const { rows: fixtureTableRows } = await client.query(`select count(*) as c from pg_tables where schemaname='public';`);
  assert.equal(Number(fixtureTableRows[0].c), 34, "fixture load: expected exactly 34 old tables");
  const fkCountAtSource = await countPublicForeignKeys(client);
  assert.equal(fkCountAtSource, 42, `fixture load: expected exactly 42 public foreign keys, got ${fkCountAtSource}`);
  // The fixture's own synthetic auth.users row (inserted to prove
  // handle_new_user()'s role-branching at fixture-load time — see
  // old_public_schema.sql's own comment) lives in a DIFFERENT database
  // than the one this bundle gets restored onto below (this test's whole
  // point is a genuinely separate, freshly-`db reset` target, unlike
  // rollback-roundtrip.test.mjs, where Surgical Reset never touches
  // auth.users so the same row survives in place). A public_schema.dump
  // only ever captures the `public` schema, never auth.users row data —
  // true of this bundle and of every real production bundle alike (real
  // production is always auth.users=0 at backup time per the Preflight
  // gate) — so restoring this row's profiles FK onto a target that never
  // had that specific auth.users row is not a real scenario; strip it
  // from the source before backing up so the bundled profiles table is
  // genuinely empty, matching real production's own empty state. The
  // trigger itself is proven live and firing correctly by PART 3's real
  // GoTrue signup below, independent of this fixture row.
  await client.query(`delete from public.profiles where email = 'rehearsal-fixture-parent@example.invalid';`);
  await client.query(`delete from auth.users where email = 'rehearsal-fixture-parent@example.invalid';`);
  await client.end();

  console.log("--- backing up the fixture (real pg_dump, as postgres)");
  fs.rmSync(scratchBundleDir, { recursive: true, force: true });
  run("scripts/backup-bundle.mjs", {
    BACKUP_DATABASE_URL: DB_URL,
    BACKUP_MODE: "local",
    BACKUP_PROJECT_REF: "local-rehearsal-not-real",
    BACKUP_OUT_DIR: scratchBundleDir,
  });
  assert.ok(fs.existsSync(path.join(scratchBundleDir, "manifest.json")), "backup: manifest.json must exist");

  // ==================================================================
  // PART 2: the actual proof. Reset to a GENUINELY fresh, empty target
  // — confirmed to lack rls_auto_enable() entirely, unlike the real
  // hosted Supabase platform — and restore straight onto it as plain
  // `postgres`, with NO pre-create step and NO actor switch.
  // ==================================================================
  console.log("--- supabase db reset (genuinely fresh, empty target for the actual restore)");
  supabaseDbReset();

  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await assertRlsAutoEnableAbsent(client, "after second db reset, immediately before restore");
  const { rows: emptyTableRows } = await client.query(`select count(*) as c from pg_tables where schemaname='public';`);
  assert.equal(Number(emptyTableRows[0].c), 0, "target must be genuinely empty before the restore this test is actually proving");
  const defaultAclBefore = await snapshotDefaultAclRaw(client);
  await client.end();

  console.log("--- THE ACTUAL PROOF: restore-bundle.mjs onto a fresh empty target, as plain postgres, zero manual workarounds");
  const restoreOut = run("scripts/restore-bundle.mjs", {
    RESTORE_DATABASE_URL: DB_URL,
    RESTORE_MODE: "local",
    RESTORE_BUNDLE_DIR: scratchBundleDir,
  });
  console.log(restoreOut);
  assert.match(restoreOut, /RESTORE COMPLETE AND VERIFIED/, "restore must report full success with no pre-create step and no actor switch");
  const restoreFailLines = restoreOut.split("\n").filter((l) => l.startsWith("FAIL"));
  assert.deepEqual(restoreFailLines, [], `no FAIL lines expected; got:\n${restoreFailLines.join("\n")}`);
  assert.match(restoreOut, /PASS {2}all 34 table\(s\) from inventory\.json are present, no extras/);
  assert.match(restoreOut, /PASS {2}pg_default_acl unchanged/);

  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const { rows: restoredTableRows } = await client.query(`select count(*) as c from pg_tables where schemaname='public';`);
  assert.equal(Number(restoredTableRows[0].c), 34, "34/34 tables must be present after restore");
  const fkCountAfterRestore = await countPublicForeignKeys(client);
  assert.equal(fkCountAfterRestore, 42, `42/42 foreign keys must be present after restore, got ${fkCountAfterRestore}`);
  const { rows: authFkRows } = await client.query(`
    select conname from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass and conrelid = 'public.profiles'::regclass;
  `);
  assert.equal(authFkRows.length, 1, "the profiles -> auth.users foreign key must be present and correctly restored");
  const defaultAclAfter = await snapshotDefaultAclRaw(client);
  assert.deepEqual(defaultAclAfter, defaultAclBefore, "pg_default_acl must be byte-for-byte unchanged by this restore");
  await client.end();

  // ==================================================================
  // PART 3: functional proof — a real HTTP signup through the real
  // local GoTrue endpoint, proving the restored trigger actually fires
  // (same discipline as rollback-roundtrip.test.mjs's own proof).
  // ==================================================================
  console.log("--- functional liveness proof: a real HTTP signup through the real GoTrue endpoint");
  const statusJson = JSON.parse(execFileSync("npx", ["--yes", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    cwd: opsDir,
    shell: process.platform === "win32",
  }));
  const email = `restore-bundle-fresh-target-test-${Date.now()}@example.invalid`;
  const signupRes = await fetch(`${statusJson.API_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: statusJson.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "CorrectHorseBatteryStaple9!", data: { role: "parent" } }),
  });
  const signupBodyText = await signupRes.text();
  assert.equal(signupRes.status, 200, `signup must return 200, got ${signupRes.status}: ${signupBodyText}`);
  const signupBody = JSON.parse(signupBodyText);

  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const { rows: profileRows } = await client.query(`select role from public.profiles where id = $1;`, [signupBody.user.id]);
  await client.end();
  assert.equal(profileRows.length, 1, "the restored on_auth_user_created trigger must have inserted exactly one profiles row for the new signup");
  assert.equal(profileRows[0].role, "parent");

  // ==================================================================
  // PART 4: a real prerequisite that genuinely cannot be built fails
  // clearly and safely — no partial restore. A bundle whose own dump
  // has NO rls_auto_enable() FUNCTION entry at all (backed up from a
  // database that had already dropped it) cannot have that precondition
  // satisfied by ensureRlsAutoEnableFunctionExists() (which explicitly
  // refuses to fabricate a definition not sourced from the bundle
  // itself) — the whole restore must fail loudly, before pg_restore
  // ever touches the target, not partially apply.
  // ==================================================================
  console.log("--- NEGATIVE CASE: a bundle missing rls_auto_enable() entirely fails clearly, with no partial restore");
  console.log("--- supabase db reset (clean slate for building the defective bundle's source)");
  supabaseDbReset();
  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query(fs.readFileSync(path.join(opsDir, "fixtures", "old_public_schema.sql"), "utf8").replace(/\r\n/g, "\n"));
  // Remove the function from the SOURCE before dumping it, so the
  // resulting bundle's own dump genuinely has no FUNCTION entry for it
  // at all — a real, not simulated, missing prerequisite.
  await client.query(`drop event trigger if exists rls_auto_enable_trigger;`);
  await client.query(`drop function if exists public.rls_auto_enable();`);
  await client.end();

  fs.rmSync(scratchDefectiveBundleDir, { recursive: true, force: true });
  run("scripts/backup-bundle.mjs", {
    BACKUP_DATABASE_URL: DB_URL,
    BACKUP_MODE: "local",
    BACKUP_PROJECT_REF: "local-rehearsal-not-real",
    BACKUP_OUT_DIR: scratchDefectiveBundleDir,
  });

  console.log("--- supabase db reset (fresh empty target for the negative restore attempt)");
  supabaseDbReset();

  let negativeFailed = false;
  let negativeOut = "";
  try {
    negativeOut = run("scripts/restore-bundle.mjs", {
      RESTORE_DATABASE_URL: DB_URL,
      RESTORE_MODE: "local",
      RESTORE_BUNDLE_DIR: scratchDefectiveBundleDir,
    });
  } catch (e) {
    negativeFailed = true;
    negativeOut = (e.stdout || "") + (e.stderr || "");
  }
  assert.ok(negativeFailed, "restore-bundle.mjs must fail when the bundle has no rls_auto_enable() FUNCTION entry to source a definition from");
  assert.match(negativeOut, /refusing to fabricate a definition that isn't sourced from the bundle itself/, `negative case output:\n${negativeOut}`);
  assert.doesNotMatch(negativeOut, /RESTORE COMPLETE/, "must not report success");

  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const { rows: postFailureTableRows } = await client.query(`select count(*) as c from pg_tables where schemaname='public';`);
  assert.equal(Number(postFailureTableRows[0].c), 0, "no partial restore: the target must still be empty after the refused attempt — pg_restore must never have been reached");
  await client.end();

  console.log("--- cleaning up scratch bundle directories");
  fs.rmSync(scratchBundleDir, { recursive: true, force: true });
  fs.rmSync(scratchDefectiveBundleDir, { recursive: true, force: true });

  console.log("\nALL restore-bundle-fresh-target.test.mjs CHECKS PASSED.");
  console.log("Left the stack in the negative-case (empty) state — run `npx supabase db reset` if you need a clean slate for something else.");
}

main().catch((e) => {
  console.error(e);
  // process.exit(1), not process.exitCode = 1: an early failure before a
  // matching client.end() leaves a dangling pg connection keeping the
  // event loop alive (same fix as rollback-roundtrip.test.mjs's own
  // identical finding).
  process.exit(1);
});
