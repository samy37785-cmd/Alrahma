// Stage 2J-B — the real, DB-side idempotency/provenance guarantee for
// every migration domain in this directory. Backed by
// migration_source_ledger (lib/db/drizzle/0022_lossless_migration_
// support.sql) — NOT a local .checkpoints/*.json file (which is lost the
// moment someone runs the import from a different machine, or the file
// is deleted). The unique index on (source_system, source_database,
// source_collection, source_document_id, target_table) is the actual
// duplicate-import guard; this module is a thin, typed wrapper around it.
import { stableContentHash } from './canonical-hash.mjs';

// PR #70 review round 11, item 3: delegates to the one shared, canonical
// hash representation (lib/canonical-hash.mjs) -- object-key-order
// independent, and excludes a row's own `__generatedFields`-listed values
// (never present on the raw Mongo source documents this function is most
// commonly called with, so this is a pure strengthening for those callers:
// still every genuine field, just no longer sensitive to accidental key
// reordering).
export function contentHashOf(row) {
  return stableContentHash(row);
}

/**
 * Returns the existing ledger row for this exact source document ->
 * target table pair, or null if none exists yet (first time this
 * document is being considered for this target).
 */
export async function findLedgerEntry(pgClient, { sourceDatabase, sourceCollection, sourceDocumentId, targetTable }) {
  const r = await pgClient.query(
    `SELECT id, source_content_hash, target_id, status, error_reason
       FROM migration_source_ledger
      WHERE source_system = 'mongodb' AND source_database = $1 AND source_collection = $2
        AND source_document_id = $3 AND target_table = $4`,
    [sourceDatabase, sourceCollection, String(sourceDocumentId), targetTable]
  );
  return r.rows[0] ?? null;
}

/** Records a 'planned' row before any target-table write is attempted — the Saga's first state. */
export async function markPlanned(pgClient, { sourceDatabase, sourceCollection, sourceDocumentId, targetTable, contentHash }) {
  const r = await pgClient.query(
    `INSERT INTO migration_source_ledger
       (source_system, source_database, source_collection, source_document_id, source_content_hash, target_table, status)
     VALUES ('mongodb', $1, $2, $3, $4, $5, 'planned')
     ON CONFLICT (source_system, source_database, source_collection, source_document_id, target_table)
     DO UPDATE SET source_content_hash = EXCLUDED.source_content_hash, status = 'planned', error_reason = NULL
     RETURNING id`,
    [sourceDatabase, sourceCollection, String(sourceDocumentId), contentHash, targetTable]
  );
  return r.rows[0].id;
}

// PR #70 review round 12, item 2 -- these three functions are the ONLY
// way any ledger row's status ever legitimately changes. Before this
// round, none of them checked how many rows their own UPDATE actually
// affected: a stale/wrong ledgerId (a bug elsewhere, a row deleted
// concurrently/out-of-band, a caller accidentally passing an id from a
// different ledger row entirely) produced a silent 0-row UPDATE that
// looked exactly like success -- the caller had no way to tell "the
// transition genuinely happened" from "nothing happened at all". Fixed:
// each now asserts rowCount === 1 and throws a clear, specific error
// otherwise. This is what makes lib/reconcile.mjs's verifyThenReconcile()
// able to prove "every check passed AND the ledger row was actually
// reconciled" instead of just the former -- see that module's own
// handling of this throw.
function assertExactlyOneRowAffected(fnName, ledgerId, rowCount) {
  if (rowCount !== 1) {
    throw new Error(
      `${fnName}(): UPDATE affected ${rowCount} row(s) for ledgerId=${ledgerId}, expected exactly 1 -- the ledger row ` +
      'does not exist (deleted concurrently, never existed, or an invalid id was passed); refusing to treat this as a ' +
      'successful ledger transition'
    );
  }
}

/** Records successful creation of the target row(s) — 'created', not yet independently reconciled. */
export async function markCreated(pgClient, ledgerId, targetId) {
  const r = await pgClient.query(
    `UPDATE migration_source_ledger SET status = 'created', target_id = $2, migrated_at = now() WHERE id = $1`,
    [ledgerId, targetId === null || targetId === undefined ? null : String(targetId)]
  );
  assertExactlyOneRowAffected('markCreated', ledgerId, r.rowCount);
}

/** Records that a target row was independently re-verified to exist and match — the final, trusted state. */
export async function markReconciled(pgClient, ledgerId) {
  const r = await pgClient.query(`UPDATE migration_source_ledger SET status = 'reconciled' WHERE id = $1`, [ledgerId]);
  assertExactlyOneRowAffected('markReconciled', ledgerId, r.rowCount);
}

/** Records a genuine, surfaced failure — never a silent skip. */
export async function markFailed(pgClient, ledgerId, reason) {
  const r = await pgClient.query(
    `UPDATE migration_source_ledger SET status = 'failed', error_reason = $2 WHERE id = $1`,
    [ledgerId, String(reason).slice(0, 2000)]
  );
  assertExactlyOneRowAffected('markFailed', ledgerId, r.rowCount);
}
