// pg_default_acl fingerprinting — shared by BOTH critical sections
// (cutover-core.mjs and rollback-core.mjs), not duplicated between them.
// The default-privilege registrations for FUTURE objects are cluster/
// role state, not schema content — a correct cutover or rollback
// changes TABLES/enums/functions, never these registrations. Any
// difference means something touched privileges it had no business
// touching, and must abort the whole surrounding transaction, not just
// log a warning.
export async function snapshotDefaultAcl(client) {
  const { rows } = await client.query(`
    select defaclrole::regrole::text as role, defaclnamespace::regnamespace::text as schema, defaclobjtype, defaclacl::text as acl
    from pg_default_acl order by role, schema, defaclobjtype;
  `);
  return rows;
}

export async function verifyDefaultAclUnchanged(client, before) {
  const after = await snapshotDefaultAcl(client);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      `pg_default_acl changed — neither a cutover nor a rollback may ever alter default-privilege registrations.\n` +
      `  before: ${JSON.stringify(before)}\n` +
      `  after:  ${JSON.stringify(after)}`
    );
  }
}

// Cutover is NOT held to "zero change" the way rollback is: migration
// 0011_default_privileges_deny_by_default.sql (lib/db/drizzle/) is a
// real, intentional, already-tested part of the 12 migrations every
// Cutover applies — `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE
// EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;` — and, per
// that migration's own extensively-documented empirical testing,
// produces EXACTLY this one new pg_default_acl row (a GLOBAL default,
// not schema-scoped — defaclnamespace=0, hence schema "-" — see that
// migration's comment for why `IN SCHEMA public` silently no-ops here).
// This is the ONLY tolerated addition; confirmed live by direct
// reproduction during this task (a fresh cutover run against a clean
// old-schema fixture produces exactly this row and no other pg_default_acl
// change). Anything else — a removed row, an unexpected extra row, or
// this expected row with a different ACL value — means a migration (or
// anything else running inside this transaction) touched default
// privileges it had no business touching, and aborts the whole cutover.
const EXPECTED_CUTOVER_DEFAULT_ACL_ADDITIONS = [
  { role: "postgres", schema: "-", defaclobjtype: "f", acl: "{postgres=X/postgres}" },
];

// The invariant is "after == before UNION expected-additions", not
// "expected-additions were freshly added THIS run" — a repeated cutover
// cycle against the same database (every test file in this suite reuses
// one persistent Postgres instance across many cutover/rollback cycles,
// and migration 0011's REVOKE is idempotent: reissuing it against a
// database that already has the row from an earlier cycle changes
// nothing) leaves the expected row already present in `before` too, and
// that must still pass — only a row that is neither pre-existing nor
// one of the pinned expected additions, or a pinned expected addition
// that comes out MISSING from the final state, is a failure.
export async function verifyCutoverDefaultAclChange(client, before) {
  const after = await snapshotDefaultAcl(client);
  const key = (r) => JSON.stringify(r);
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  const expectedKeys = new Set(EXPECTED_CUTOVER_DEFAULT_ACL_ADDITIONS.map(key));
  const removed = before.filter((r) => !afterKeys.has(key(r)));
  const unexpectedAdded = after.filter((r) => !beforeKeys.has(key(r)) && !expectedKeys.has(key(r)));
  const missingExpected = EXPECTED_CUTOVER_DEFAULT_ACL_ADDITIONS.filter((r) => !afterKeys.has(key(r)));
  if (removed.length > 0 || unexpectedAdded.length > 0 || missingExpected.length > 0) {
    throw new Error(
      `pg_default_acl changed unexpectedly during cutover — only migration 0011's known addition is tolerated.\n` +
      `  removed (must be empty):           ${JSON.stringify(removed)}\n` +
      `  unexpected addition(s) (must be empty): ${JSON.stringify(unexpectedAdded)}\n` +
      `  expected addition(s) missing from the final state (must be empty): ${JSON.stringify(missingExpected)}`
    );
  }
}
