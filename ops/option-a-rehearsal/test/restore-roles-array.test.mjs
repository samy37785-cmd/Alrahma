// Regression test for a real bug found while building
// fixtures/new-schema-rls-policies.json (Stage 2D corrective review):
// node-postgres has no type parser registered for `name[]` — the type
// of `pg_policies.roles` — so it comes back as the raw Postgres text
// literal ("{authenticated,anon}"), not a parsed JS array.
// restore-bundle.mjs's own policy-comparison code used to do
// `[...(r.roles || [])].sort()`, which spreads a STRING into individual
// CHARACTERS, not role names — this test proves that pattern is wrong
// against a REAL live query (not a synthetic string), and proves
// scripts/lib/pg-array.mjs's parsePgTextArray() fixes it.
//
// Requires: TEST_DATABASE_URL pointing at a local Docker Postgres.
// Usage: TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
//        node test/restore-roles-array.test.mjs
import pg from "pg";
import assert from "node:assert/strict";
import { assertLocalHost } from "../../../lib/db/test/local-harness.mjs";
import { parsePgTextArray } from "../scripts/lib/pg-array.mjs";

const baseConnectionString = process.env.TEST_DATABASE_URL;
if (!baseConnectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
assertLocalHost(baseConnectionString, "TEST_DATABASE_URL");

// The exact pattern restore-bundle.mjs used before this fix — kept here,
// inline, specifically so this test still demonstrates the bug even
// after the real fix has replaced it everywhere else in the codebase.
function oldBuggyNormalize(rawRoles) {
  return [...(rawRoles || [])].sort();
}

async function main() {
  const client = new pg.Client({ connectionString: baseConnectionString });
  await client.connect();

  console.log("--- creating a disposable table + multi-role RLS policy");
  await client.query(`drop table if exists public._roles_array_regression_test;`);
  await client.query(`create table public._roles_array_regression_test (id int);`);
  await client.query(`alter table public._roles_array_regression_test enable row level security;`);
  await client.query(`
    create policy multi_role_select on public._roles_array_regression_test
    for select to anon, authenticated
    using (true);
  `);

  console.log("--- querying pg_policies.roles exactly as restore-bundle.mjs does");
  const { rows } = await client.query(`
    select roles from pg_policies where schemaname='public' and tablename='_roles_array_regression_test';
  `);
  const rawRoles = rows[0].roles;
  const expectedRoles = ["anon", "authenticated"].sort();

  console.log(`--- raw driver value: ${JSON.stringify(rawRoles)} (typeof ${typeof rawRoles})`);
  assert.equal(typeof rawRoles, "string", "this test documents a real node-postgres behavior: name[] columns come back as a string, not a parsed array — if this ever changes (a pg upgrade registering a type parser), the rest of this test becomes moot but should still pass harmlessly");

  console.log("--- proving the OLD buggy pattern does NOT recover the real role list");
  const oldResult = oldBuggyNormalize(rawRoles);
  assert.notDeepEqual(oldResult, expectedRoles, "the old `[...(r.roles || [])].sort()` pattern must NOT equal the real role list — if it does, the bug this test exists to catch is no longer present, but not through this fix");

  console.log("--- proving parsePgTextArray correctly recovers the real role list");
  const newResult = parsePgTextArray(rawRoles).sort();
  assert.deepEqual(newResult, expectedRoles, "parsePgTextArray(rawRoles).sort() must equal the real, semantic role list");

  console.log("--- also correct on the pass-through (already-array) case, for forward-compatibility with a future pg driver upgrade");
  assert.deepEqual(parsePgTextArray(["authenticated", "anon"]).sort(), expectedRoles);

  console.log("--- also correct on an empty role list");
  assert.deepEqual(parsePgTextArray("{}"), []);

  await client.query(`drop table public._roles_array_regression_test;`);
  await client.end();

  console.log("\nALL restore-roles-array.test.mjs CHECKS PASSED.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
