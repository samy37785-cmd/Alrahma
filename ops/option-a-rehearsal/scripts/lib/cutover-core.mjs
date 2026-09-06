// The atomic Cutover critical section — shared by the production
// orchestrator and by local tests (concurrency + failure-injection),
// so both exercise the SAME code, not a reimplementation of it.
//
// Corrective-review fix (Stage 2D, item 3): the original design ran
// Surgical Reset in its own transaction (committed), then called
// drizzle-orm's migrate() in a SEPARATE connection/transaction
// (committed independently), then verified afterward. A failure between
// those two commits left production with the OLD schema already gone
// and the NEW schema only partially applied — a real half-migrated
// state, not just a hypothetical one.
//
// This version proves the alternative is possible and implements it:
// final-recheck + Surgical Reset + all migrations + the migration
// journal + full post-migration verification now run as PLAIN SQL
// statements on ONE already-connected client, inside ONE
// `BEGIN ... COMMIT`, with COMMIT issued only after verification
// passes. Any thrown error at any step triggers ROLLBACK before
// rethrowing — nothing from a failed run is ever left committed.
//
// Why migrations are re-implemented here rather than calling
// drizzle-orm's own migrate(): migrate() is not reusable for this
// purpose. Reading drizzle-orm's own source
// (node_modules/drizzle-orm/pg-core/dialect.js — PgDialect.migrate())
// shows it opens ITS OWN `session.transaction()` internally and issues
// `COMMIT` (or `ROLLBACK`) itself before migrate() ever returns control
// to the caller — by the time `await migrate(...)` resolves
// successfully, the migrations are ALREADY committed on their own,
// which makes it structurally impossible to run verification
// afterward and still be able to roll the migrations back if
// verification fails. This file instead calls
// `readMigrationFiles()` — drizzle-orm's own file-reading/hash-
// computation helper (exported from the public `drizzle-orm/migrator`
// subpath) — to get the exact same {sql, hash, folderMillis} data
// migrate() would use, then applies each pending migration's
// statements and inserts its journal row with plain `client.query()`
// calls on the SAME client/transaction as everything else in this
// function. The journal table/row shape is identical to what migrate()
// would have produced (same schema/table name, same hash algorithm,
// same created_at value), so a database migrated this way is
// indistinguishable from one migrated by calling migrate() directly.
import { readMigrationFiles } from "drizzle-orm/migrator";
import { verifyNewSchemaFingerprint } from "./new-schema-fingerprint.mjs";

export class InjectedFailure extends Error {}

// injectFailureAt (all optional, undefined = no injection, used only by
// tests — see test/cutover-core.test.mjs):
//   "after-reset"        throw right after Surgical Reset's own
//                         post-condition check passes, before any
//                         migration statement runs.
//   <number> N            throw right after the N'th (0-based) migration
//                         file's statements + journal row are applied.
//   "before-commit"       throw right after verification passes, before
//                         COMMIT — proves a verification-adjacent late
//                         failure still rolls back the reset+migrations
//                         too, not just the verification queries.
export async function runAtomicCutoverOnClient(client, {
  expectedOldTables,
  expectedOldEnums,
  surgicalResetSql,
  drizzleDir,
  policyFixture,
  injectFailureAt,
  log = () => {},
}) {
  await client.query("BEGIN");
  try {
    log("=== final recheck (same connection, same transaction, immediately before the first DROP) ===");
    const { rows: tableRows } = await client.query(`select tablename from pg_tables where schemaname='public' order by tablename;`);
    const actualTables = tableRows.map((r) => r.tablename).sort();
    const expectedSorted = [...expectedOldTables].sort();
    if (JSON.stringify(actualTables) !== JSON.stringify(expectedSorted)) {
      throw new Error(`final recheck failed: public tables do not exactly match the expected old set.\n  expected: ${expectedSorted.join(", ")}\n  actual:   ${actualTables.join(", ")}`);
    }
    for (const table of expectedOldTables) {
      const { rows } = await client.query(`select count(*) as c from public."${table.replace(/"/g, '""')}";`);
      if (Number(rows[0].c) !== 0) throw new Error(`final recheck failed: public.${table} now has ${rows[0].c} row(s) — state changed since the preflight gate ran.`);
    }
    const { rows: authRows } = await client.query(`select count(*) as c from auth.users;`);
    if (Number(authRows[0].c) !== 0) throw new Error(`final recheck failed: auth.users now has ${authRows[0].c} row(s).`);
    log("OK    final recheck: all expected old tables present and empty, auth.users empty");

    log("=== Surgical Reset (same connection, same open transaction) ===");
    await client.query(surgicalResetSql);
    const { rows: remaining } = await client.query(
      `select tablename from pg_tables where schemaname='public' and tablename = any($1::text[]);`,
      [expectedOldTables]
    );
    const { rows: remainingEnums } = await client.query(
      `select typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname = any($1::text[]);`,
      [expectedOldEnums]
    );
    if (remaining.length > 0 || remainingEnums.length > 0) {
      throw new Error(`post-reset check failed: ${remaining.length} old table(s) / ${remainingEnums.length} old enum(s) still present.`);
    }
    log("OK    Surgical Reset applied — old tables/enums gone (not yet committed)");

    if (injectFailureAt === "after-reset") {
      throw new InjectedFailure("TEST: injected failure immediately after Surgical Reset, before any migration runs");
    }

    log("=== migrations (same connection, same open transaction) ===");
    await client.query(`create schema if not exists drizzle;`);
    await client.query(`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint);`);
    const migrations = readMigrationFiles({ migrationsFolder: drizzleDir });
    const { rows: lastMigRows } = await client.query(`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1;`);
    const lastDbMigration = lastMigRows[0];
    let appliedCount = 0;
    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
        for (const stmt of migration.sql) {
          await client.query(stmt);
        }
        await client.query(`insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2);`, [migration.hash, migration.folderMillis]);
        appliedCount++;
      }
      if (injectFailureAt === i) {
        throw new InjectedFailure(`TEST: injected failure right after migration index ${i} (hash ${migration.hash.slice(0, 12)}...)`);
      }
    }
    log(`OK    ${appliedCount} migration file(s) applied, journal rows inserted`);

    log("=== strengthened post-migration verification (same connection, same open transaction) ===");
    const { rows: migrationRows } = await client.query(`select hash, created_at from drizzle.__drizzle_migrations;`);
    await verifyNewSchemaFingerprint(client, { migrationRows, expectedMigrations: migrations, policyFixture });
    log("OK    post-migration fingerprint verified: tables, functions, enums, migrations journal, RLS, policies, grants");

    if (injectFailureAt === "before-commit") {
      throw new InjectedFailure("TEST: injected failure after verification passed, before COMMIT");
    }

    await client.query("COMMIT");
    log("OK    COMMIT — reset + migrations + journal + verification landed together, atomically, in one transaction.");
    return { appliedCount, migrations };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Connection may already be broken (e.g. the error itself was a
      // dropped connection) — ROLLBACK failing there is expected and
      // harmless: an aborted/closed session cannot have committed
      // anything either way.
    }
    throw e;
  }
}
