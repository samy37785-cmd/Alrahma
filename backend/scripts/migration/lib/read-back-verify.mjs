// PR #70 review round 9, item 5 -- a real, shared post-commit read-back
// verification, used before EVERY markReconciled() call this round
// touches (mongo-to-supabase.mjs's generic per-domain loop,
// migrate-users-to-supabase-auth.mjs's migrateSubscription()).
//
// Bug being fixed: markReconciled() was called immediately after COMMIT
// with NO independent re-read of the row at all in most call sites
// (mongo-to-supabase.mjs's generic domain loop had a comment claiming
// "the INDEPENDENT re-verification that promotes it to 'reconciled'"
// immediately above a call that did no such thing). The two call sites
// that DID read back (migrateSubscription(), applyTeacherLink()/
// applyParentChildLink() via their own bespoke queries) only ever
// checked bare row EXISTENCE (`SELECT 1 ... WHERE id = $1 AND
// user_id = $2`) -- never compared the actual important field VALUES
// (status, plan_id, provider dates, ...) against what this migration
// itself just wrote. A trigger silently rewriting a value, or any other
// mechanism substituting different content under the same id, passed
// completely unnoticed and was marked 'reconciled' regardless.
//
// verifyReadBack() re-reads the real row by its real identity (plain id,
// pkColumn, or composite -- reusing the exact same shapes ROLLBACK_SPEC/
// LEDGER_BACKED_TARGET_SPECS already define) and compares every field
// named in `expectedFields` against the column Postgres actually
// persisted, tolerant of the couple of JS<->Postgres round-trip shapes
// this codebase's own domains produce (Date objects, jsonb columns whose
// JS-side value was already JSON.stringify()'d before being passed as a
// `::jsonb` parameter) -- not a byte-exact comparison, but a real
// content comparison, not just "a row with this id exists".
import { decodeCompositeTargetId } from './composite-target-id.mjs';

function normalizeForCompare(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksLikeJson) {
      try {
        return JSON.stringify(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * @param {(string|number|boolean|Date|object|null)[2]} pair [expected, actual]
 */
function fieldsMatch([expected, actual]) {
  // A `timestamp`/`timestamptz` column (pg always returns these as a real
  // JS Date) is compared by PRESENCE only (both null, or both non-null),
  // not exact value. Reason, found empirically running this exact check
  // against the real migration suite: several domains derive a bookkeeping
  // timestamp with a client-side `doc.createdAt ?? new Date()` fallback
  // (e.g. system_audit_logs) -- transform() re-runs that fallback fresh on
  // every invocation, including a resumed run whose upsert() ends up
  // reusing an already-existing row with ZERO new writes (admin_audit_log
  // is immutable; reuse-on-resume is a deliberate no-write no-op, see that
  // domain's own upsert() comment). Comparing THIS run's freshly-generated
  // "now" against a PRIOR run's already-persisted "now" is not a real
  // content mismatch -- it is two different, both-legitimate values for a
  // field this exact call never attempted to (over)write. Exact-value
  // equality here produced a false positive on every real domain suite
  // run. A genuinely corrupted timestamp (NULL when one was expected, or
  // vice versa) is still caught; the specific instant is bookkeeping
  // metadata, not migrated source content, and is not what this check
  // exists to protect.
  if (actual instanceof Date || expected instanceof Date) {
    return (expected === null || expected === undefined) === (actual === null || actual === undefined);
  }
  return normalizeForCompare(expected) === normalizeForCompare(actual);
}

/**
 * Re-reads one row by its real identity and compares `expectedFields`
 * against what Postgres actually has. Returns {ok:true} or
 * {ok:false, reason} -- never throws itself, so callers can route a
 * failure through their own existing markFailed()/error-reporting path.
 *
 * @param {import('pg').ClientBase} pgClient
 * @param {{table: string, pkColumn?: string, composite?: string[]}} spec
 * @param {string} targetId - plain id/pkColumn value, or an
 *   encodeCompositeTargetId()-encoded composite identity.
 * @param {Record<string, unknown>} expectedFields - column name -> the
 *   value this migration itself intended to persist there.
 */
export async function verifyReadBack(pgClient, spec, targetId, expectedFields) {
  let whereSql, params;
  if (spec.composite) {
    let parts;
    try {
      parts = decodeCompositeTargetId(targetId);
    } catch (err) {
      return { ok: false, reason: `read-back: target_id "${targetId}" for ${spec.table} does not decode as a composite identity: ${err.message}` };
    }
    whereSql = spec.composite.map((col, i) => `${col} = $${i + 1}`).join(' AND ');
    params = parts;
  } else {
    whereSql = `${spec.pkColumn ?? 'id'} = $1`;
    params = [targetId];
  }

  const { rows } = await pgClient.query(`SELECT * FROM ${spec.table} WHERE ${whereSql}`, params);
  if (rows.length === 0) {
    return { ok: false, reason: `read-back: no row found in ${spec.table} for the just-written target (target_id=${targetId}) -- it is gone, or was never really there` };
  }
  const dbRow = rows[0];
  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expectedFields)) {
    if (!(key in dbRow)) continue; // not a real column on this table -- nothing to compare
    if (!fieldsMatch([expectedValue, dbRow[key]])) {
      mismatches.push(`${key} (expected ${JSON.stringify(expectedValue)}, found ${JSON.stringify(dbRow[key])})`);
    }
  }
  if (mismatches.length > 0) {
    return { ok: false, reason: `read-back: ${spec.table} row (target_id=${targetId}) does not match what this migration just wrote -- ${mismatches.join('; ')}` };
  }
  return { ok: true };
}
