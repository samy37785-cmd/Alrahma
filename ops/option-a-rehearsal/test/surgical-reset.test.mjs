// Automated test for scripts/03-surgical-reset.mjs — Round 2 Section 4
// (single-transaction refactor + broadened dependency check). Runs the
// REAL script as a child process (not a reimplementation of its logic)
// against a dedicated, disposable, localhost-only Postgres database —
// same discipline as lib/db/test/upgrade-scenario.local.test.mjs: owns
// its own database so it never collides with a concurrently-run suite,
// and refuses anything but 127.0.0.1/localhost.
//
// Requires: TEST_DATABASE_URL pointing at a local Docker Postgres (NOT
// the full Supabase CLI stack — this test only needs plain Postgres +
// the auth-schema stub from lib/db/test/local-harness.mjs, which is
// enough to exercise Surgical Reset's own logic in isolation). For the
// full rollback proof against the real Supabase stack, see
// rollback-roundtrip.test.mjs instead.
//
// Usage: TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
//        node test/surgical-reset.test.mjs
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions, assertLocalHost } from "../../../lib/db/test/local-harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsDir = path.join(__dirname, "..");
const fixturePath = path.join(opsDir, "fixtures", "old_public_schema.sql");
const resetScript = path.join(opsDir, "scripts", "03-surgical-reset.mjs");

const baseConnectionString = process.env.TEST_DATABASE_URL;
if (!baseConnectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
assertLocalHost(baseConnectionString, "TEST_DATABASE_URL");

const dbName = "alrahma_surgical_reset_test";
const baseUrl = new URL(baseConnectionString);
const maintenanceUrl = new URL(baseConnectionString);
maintenanceUrl.pathname = "/postgres";
const testUrl = new URL(baseConnectionString);
testUrl.pathname = `/${dbName}`;

async function loadOldFixture(client) {
  await createLocalAuthUsersStub(client);
  // fixtures/old_public_schema.sql's own seed INSERT into auth.users
  // (see its final lines) needs a few columns beyond the minimal stub
  // createLocalAuthUsersStub provides — same extra columns
  // setup-rehearsal-db.mjs adds for the same reason.
  await client.query(`alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;`);
  await client.query(`alter table auth.users add column if not exists aud text;`);
  await client.query(`alter table auth.users add column if not exists role text;`);
  await client.query(`alter table auth.users add column if not exists created_at timestamptz not null default now();`);
  await createLocalAuthRolesAndFunctions(client);
  await client.query(fs.readFileSync(fixturePath, "utf8"));
}

function runResetScript(url) {
  try {
    const out = execFileSync(process.execPath, [resetScript], {
      env: { ...process.env, RESET_DATABASE_URL: url },
      encoding: "utf8",
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

async function main() {
  console.log(`--- (re)creating dedicated test database ${dbName}`);
  const admin = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force);`);
  await admin.query(`create database ${dbName};`);
  await admin.end();

  // ------------------------------------------------------------------
  // Positive case: clean old-schema state, no dependent objects outside
  // the named 34-table/3-enum list. The script must commit and leave
  // exactly 0 of the 34 named tables/3 named enums behind, while
  // preserving public's schema oid/owner/ACL, pg_default_acl content,
  // rls_auto_enable()'s oid+definition, its event trigger's oid+shape,
  // and auth.users's row count.
  // ------------------------------------------------------------------
  console.log("--- loading old-schema fixture");
  let client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  await loadOldFixture(client);
  const { rows: beforeFp } = await client.query(`
    select n.oid as schema_oid, n.nspowner::regrole::text as schema_owner
    from pg_namespace n where n.nspname = 'public';
  `);
  await client.end();

  console.log("--- POSITIVE CASE: running 03-surgical-reset.mjs against a clean old-schema state");
  const positiveResult = runResetScript(testUrl.toString());
  console.log(positiveResult.out);
  assert.equal(positiveResult.code, 0, "positive case: script must exit 0");
  assert.match(positiveResult.out, /SURGICAL RESET COMPLETE, VERIFIED, AND COMMITTED/, "positive case: must report success");
  assert.match(positiveResult.out, /PASS {2}public schema oid unchanged/);
  assert.match(positiveResult.out, /PASS {2}pg_default_acl content for public .* unchanged/);
  assert.match(positiveResult.out, /OK {4}all 34 named old tables are gone/);
  assert.match(positiveResult.out, /OK {4}all 3 named old enums are gone/);

  client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  const { rows: afterFp } = await client.query(`
    select n.oid as schema_oid, n.nspowner::regrole::text as schema_owner
    from pg_namespace n where n.nspname = 'public';
  `);
  assert.equal(afterFp[0].schema_oid, beforeFp[0].schema_oid, "public schema oid must be unchanged (never dropped/recreated)");
  assert.equal(afterFp[0].schema_owner, beforeFp[0].schema_owner, "public schema owner must be unchanged");
  const { rows: remainingTables } = await client.query(`select count(*) as c from pg_tables where schemaname = 'public';`);
  assert.equal(Number(remainingTables[0].c), 0, "positive case: all 34 named old tables must be gone (nothing else was in this db)");
  await client.end();

  // ------------------------------------------------------------------
  // Negative case: reload the old fixture, then plant a table OUTSIDE
  // the named 34-list with a foreign key INTO one of the named tables.
  // The wrapper must refuse (nonzero exit), and — critically — must
  // drop NOTHING (all 34 tables still present) because the whole
  // sequence runs in one transaction that only commits if every check
  // passes.
  // ------------------------------------------------------------------
  console.log("--- reloading old-schema fixture for the negative case");
  client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  await loadOldFixture(client);
  await client.query(`
    create table public.external_planted_dependency (
      id uuid primary key default gen_random_uuid(),
      blog_id uuid not null references public.blogs(id)
    );
  `);
  await client.end();

  console.log("--- NEGATIVE CASE: running 03-surgical-reset.mjs with an external FK planted into public.blogs");
  const negativeResult = runResetScript(testUrl.toString());
  console.log(negativeResult.out);
  assert.notEqual(negativeResult.code, 0, "negative case: script must exit nonzero");
  assert.match(negativeResult.out, /external_planted_dependency/, "negative case: the planted dependency must be named in the failure");

  client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  const { rows: stillThere } = await client.query(`select count(*) as c from pg_tables where schemaname = 'public' and tablename = 'blogs';`);
  assert.equal(Number(stillThere[0].c), 1, "negative case: public.blogs must still exist — the transaction must have rolled back, nothing dropped");
  const { rows: allTables } = await client.query(`select count(*) as c from pg_tables where schemaname = 'public';`);
  assert.equal(Number(allTables[0].c), 35, "negative case: all 34 old tables + the 1 planted dependency table must still be present (35 total)");
  await client.query(`drop table public.external_planted_dependency;`);
  await client.end();

  console.log("--- cleaning up dedicated test database");
  const admin2 = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await admin2.connect();
  await admin2.query(`drop database if exists ${dbName} with (force);`);
  await admin2.end();

  console.log("\nALL surgical-reset.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
