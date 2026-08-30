// Automated test for the Round 2 centerpiece: a genuine NEW-schema
// (20 tables) -> OLD-schema (34 tables) ROLLBACK, verified structurally
// (tables, row counts, RLS, full policy definitions, functions,
// triggers, enums) AND functionally (a real HTTP signup through the
// real GoTrue endpoint, proving the restored trigger actually fires) —
// not just a restore into an empty database. See
// docs/option-a-surgical-reset-rehearsal.md for the narrative writeup
// this test automates.
//
// Unlike surgical-reset.test.mjs / gate.test.mjs, this test needs the
// REAL local Supabase CLI stack (real Postgres 17 + GoTrue + PostgREST),
// not just plain Docker Postgres — RLS/policies/grants/pg_cron/pg_net/
// pg_graphql event triggers and a real Auth endpoint are all part of
// what this proof exists to exercise against.
//
// Prerequisite: `npx supabase start` already running in this directory
// (ops/option-a-rehearsal). This test does NOT start/stop the stack
// itself — same reasoning as every other script here: never assume,
// always verify, and don't hide a slow `supabase start` inside a test
// run someone might re-run repeatedly.
//
// Usage: cd ops/option-a-rehearsal && node test/rollback-roundtrip.test.mjs
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const scratchBundleDir = path.join(opsDir, "out", "rollback-roundtrip-test-bundle");

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function run(scriptRelPath, env, args = []) {
  const scriptPath = path.join(opsDir, scriptRelPath);
  return execFileSync(process.execPath, [scriptPath, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    cwd: opsDir,
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

async function resetToCleanSlate(client) {
  // Deterministic starting point regardless of whatever state the
  // stack's persisted volume came back holding: clear both the NEW
  // schema's named objects and the OLD schema's named objects, using
  // the same two scripts Surgical Reset/rollback already rely on
  // elsewhere (IF EXISTS everywhere, safe to run against a database
  // that already has neither).
  await client.query(fs.readFileSync(path.join(opsDir, "sql", "inverse-reset-new-schema.sql"), "utf8"));
  await client.query(fs.readFileSync(path.join(opsDir, "sql", "surgical-reset.sql"), "utf8"));
  // auth.users is never touched by either reset above (by design — see
  // both scripts' own header comments), so a leftover row from an
  // earlier manual or automated run of this exact fixture (it always
  // inserts the same fixed email) would collide with this run's own
  // fixture load. Clean up only the synthetic *.invalid rows this
  // rehearsal itself creates — never a real address.
  await client.query(`delete from auth.users where email like '%@example.invalid';`);
}

async function main() {
  console.log("--- verifying the real local Supabase stack is up");
  await assertStackIsUp();

  console.log("--- resetting to a clean slate (neither OLD nor NEW schema present)");
  let client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await resetToCleanSlate(client);
  console.log("--- loading the OLD 34-table fixture");
  await client.query(fs.readFileSync(path.join(opsDir, "fixtures", "old_public_schema.sql"), "utf8"));
  const { rows: tableCountRows } = await client.query(`select count(*) as c from pg_tables where schemaname='public';`);
  assert.equal(Number(tableCountRows[0].c), 34, "fixture load: expected exactly 34 old tables");
  await client.end();

  console.log("--- backing up the OLD schema state (real pg_dump)");
  fs.rmSync(scratchBundleDir, { recursive: true, force: true });
  run("scripts/backup-bundle.mjs", {
    BACKUP_DATABASE_URL: DB_URL,
    BACKUP_MODE: "local",
    BACKUP_PROJECT_REF: "local-rehearsal-not-real",
    BACKUP_OUT_DIR: scratchBundleDir,
  });
  assert.ok(fs.existsSync(path.join(scratchBundleDir, "manifest.json")), "backup: manifest.json must exist");
  assert.ok(fs.existsSync(path.join(scratchBundleDir, "public_schema.dump")), "backup: public_schema.dump must exist");

  console.log("--- Surgical Reset (old 34 tables -> gone, public/rls_auto_enable preserved)");
  const resetOut = run("scripts/03-surgical-reset.mjs", { RESET_DATABASE_URL: DB_URL });
  assert.match(resetOut, /SURGICAL RESET COMPLETE, VERIFIED, AND COMMITTED/);

  console.log("--- migrate() (old 34 tables gone -> new 20-table schema)");
  const migrateOut = run("scripts/run-migrate.mjs", { REHEARSAL_DATABASE_URL: DB_URL });
  assert.match(migrateOut, /migrate\(\) completed/);

  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const { rows: newTableCountRows } = await client.query(`select count(*) as c from pg_tables where schemaname='public';`);
  assert.equal(Number(newTableCountRows[0].c), 20, "post-migrate: expected exactly 20 new tables");
  await client.end();

  console.log("--- THE ROLLBACK: restoring the OLD bundle onto the NEW-state database");
  const restoreOut = run("scripts/restore-bundle.mjs", {
    RESTORE_DATABASE_URL: DB_URL,
    RESTORE_MODE: "local",
    RESTORE_BUNDLE_DIR: scratchBundleDir,
    RESTORE_ROLLBACK_FROM_NEW_SCHEMA: "yes",
  });
  console.log(restoreOut);
  assert.match(restoreOut, /RESTORE COMPLETE AND VERIFIED/, "rollback: restore-bundle.mjs must report full success");
  const restoreFailLines = restoreOut.split("\n").filter((l) => l.startsWith("FAIL"));
  assert.deepEqual(restoreFailLines, [], `rollback: no FAIL lines expected; got:\n${restoreFailLines.join("\n")}`);
  assert.match(restoreOut, /PASS {2}all 34 table\(s\) from inventory.json are present, no extras/);
  assert.match(restoreOut, /PASS {2}RLS enabled\/forced state matches inventory.json on all 34 table\(s\)/);
  assert.match(restoreOut, /PASS {2}all 0 policy definition\(s\) match inventory.json exactly/);

  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const { rows: rolledBackTableCount } = await client.query(`select count(*) as c from pg_tables where schemaname='public';`);
  assert.equal(Number(rolledBackTableCount[0].c), 34, "rollback: expected exactly 34 tables after restore");
  await client.end();

  console.log("--- functional liveness proof: a real HTTP signup through the real GoTrue endpoint");
  // Windows resolves "npx" to "npx.cmd", a batch file — execFileSync
  // cannot spawn one directly (naming it "npx.cmd" explicitly still
  // throws EINVAL); it needs shell:true, same class of issue as this
  // project's other Windows/Git-Bash path-handling fixes.
  const statusJson = JSON.parse(execFileSync("npx", ["--yes", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    cwd: opsDir,
    shell: process.platform === "win32",
  }));
  const email = `rollback-roundtrip-test-${Date.now()}@example.invalid`;
  const signupRes = await fetch(`${statusJson.API_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: statusJson.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "CorrectHorseBatteryStaple9!", data: { role: "parent" } }),
  });
  const signupBodyText = await signupRes.text();
  assert.equal(signupRes.status, 200, `signup must return 200, got ${signupRes.status}: ${signupBodyText}`);
  const signupBody = JSON.parse(signupBodyText);
  const newUserId = signupBody.user.id;

  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const { rows: profileRows } = await client.query(`select role from public.profiles where id = $1;`, [newUserId]);
  await client.end();
  assert.equal(profileRows.length, 1, "the restored on_auth_user_created trigger must have inserted exactly one profiles row for the new signup");
  assert.equal(profileRows[0].role, "parent", "the restored OLD handle_new_user()'s metadata-role branching must set role='parent' for a role:'parent' signup claim");

  console.log("--- cleaning up scratch bundle directory");
  fs.rmSync(scratchBundleDir, { recursive: true, force: true });

  console.log("\nALL rollback-roundtrip.test.mjs CHECKS PASSED.");
  console.log("Left the stack in the rolled-back OLD-schema (34-table) state — re-run migrate() manually if you need the NEW schema back.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
