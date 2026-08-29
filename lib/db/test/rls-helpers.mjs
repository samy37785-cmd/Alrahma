// Shared test scaffolding for role-switching RLS tests against the LOCAL
// Docker Postgres this baseline is migrated into (0002_rls.sql) — factored
// out of rls.local.test.mjs (RLS Remediation Round 2) so
// rls-full-matrix.local.test.mjs can reuse the exact same session-switching
// mechanics rather than re-implementing them slightly differently.
//
// IMPORTANT: Postgres does not enforce RLS for a table's owner or a
// superuser, by design — our migrations were applied as `postgres`
// (superuser), so simply connecting as `postgres` would never exercise any
// policy at all. Every assertion built on `createRlsHarness()` runs under
// `SET ROLE` to `anon`/`authenticated`/`service_role` specifically because
// those are NOT the table owner and NOT superuser, so RLS actually applies.
//
// A single dedicated `pg.Client` (not a Pool) is required by the caller,
// since `SET ROLE` / `SET request.jwt.claims` are session state — they must
// stick across statements on the SAME connection.

/**
 * @param {import('pg').Client} client an already-connected pg.Client
 */
export function createRlsHarness(client) {
  const results = [];

  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, pass: true });
      console.log(`PASS  ${name}`);
    } catch (err) {
      results.push({ name, pass: false, err });
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg ?? "assertion failed");
  }

  // RLS Remediation Round 3 (Section G.1): "an error happened" is not
  // proof the RIGHT layer stopped it — 42501 alone covers both a plain
  // GRANT-layer "permission denied" AND a failed RLS WITH CHECK ("row-
  // level security policy"), which share the same SQLSTATE class; only
  // the message text tells them apart. Optional `matcher` lets a caller
  // assert the SPECIFIC denial mechanism: `{ sqlState }` checks the real
  // Postgres SQLSTATE node-pg exposes as `err.code` (42501 permission-
  // denied/RLS-WITH-CHECK, 23514 check_violation, 23505 unique_
  // violation, 23503 foreign_key_violation, P0001 a hand-authored
  // trigger's bare RAISE EXCEPTION); `{ messageIncludes }` checks
  // `err.message` contains a specific fragment (the only way to
  // distinguish a GRANT-layer denial from an RLS WITH CHECK failure,
  // since both are 42501). Both may be given together. Omitting
  // `matcher` (or passing a plain string, the old calling convention)
  // keeps every existing call site working unchanged — this is
  // backward-compatible, not a breaking change to the ~100 existing
  // calls across this suite.
  async function expectReject(queryFn, matcherOrMsg, msgIfNotRejected) {
    const matcher = typeof matcherOrMsg === "string" || matcherOrMsg == null ? undefined : matcherOrMsg;
    const notRejectedMsg = matcher ? msgIfNotRejected : matcherOrMsg;

    let err;
    try {
      await queryFn();
    } catch (caught) {
      err = caught;
    }
    if (!err) {
      throw new Error(notRejectedMsg ?? "expected query to be rejected, but it succeeded");
    }

    if (matcher?.sqlState && err.code !== matcher.sqlState) {
      throw new Error(
        `expected rejection with SQLSTATE ${matcher.sqlState}, got ${err.code ?? "(none)"}: ${err.message}`,
      );
    }
    if (matcher?.messageIncludes && !err.message.includes(matcher.messageIncludes)) {
      throw new Error(
        `expected rejection message to include "${matcher.messageIncludes}", got: ${err.message}`,
      );
    }
    return err;
  }

  // `SET var = ...` is a utility statement, not ordinary SQL — it doesn't
  // accept a `$1` query parameter. `set_config()` is the parameterizable
  // equivalent (`is_local = false` means session-scoped, not just for the
  // current transaction), which is what actually lets these helpers pass a
  // real userId/aal value safely instead of string-concatenating SQL.

  /** Resets to the superuser session state (used for seeding fixtures). */
  async function asSuperuser() {
    await client.query(`reset role;`);
    await client.query(`select set_config('request.jwt.claims', '', false);`);
  }

  async function asAnon() {
    await client.query(`reset role;`);
    await client.query(`select set_config('request.jwt.claims', '', false);`);
    await client.query(`set role anon;`);
  }

  async function asUser(userId, aal = "aal1") {
    await client.query(`reset role;`);
    await client.query(`select set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: userId, aal })]);
    await client.query(`set role authenticated;`);
  }

  async function asService() {
    await client.query(`reset role;`);
    await client.query(`select set_config('request.jwt.claims', '', false);`);
    await client.query(`set role service_role;`);
  }

  function report() {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed.`);
    return failed.length === 0;
  }

  return { test, assert, expectReject, asSuperuser, asAnon, asUser, asService, results, report };
}

/** Throws unless TEST_DATABASE_URL is set and points at localhost/127.0.0.1 — the same hard guard every script in this directory uses. */
export function requireLocalTestDatabaseUrl() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
  }
  const host = new URL(connectionString).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to run: TEST_DATABASE_URL host "${host}" is not localhost/127.0.0.1.`);
  }
  return connectionString;
}
