// PR #70 review round 9, item 5 -- a real, shared post-commit read-back
// verification, used before EVERY markReconciled() call this round
// touches (mongo-to-supabase.mjs's generic per-domain loop,
// migrate-users-to-supabase-auth.mjs's migrateSubscription()).
//
// Bug being fixed (round 9): markReconciled() was called immediately
// after COMMIT with NO independent re-read of the row at all in most
// call sites. verifyReadBack() re-reads the real row by its real
// identity (plain id, pkColumn, or composite) and compares every field
// named in `expectedFields` against the column Postgres actually
// persisted -- not just "a row with this id exists".
//
// PR #70 review round 10 -- two further real gaps, both found by actually
// exercising this code against real Postgres, not by inspection:
//
// item 1: round 9's own comparator treated ANY two non-null
// Date/timestamp values as a match ("presence only"), reasoning some
// domains derive a bookkeeping timestamp with a client-side
// `?? new Date()` fallback that legitimately differs run-to-run on a
// no-write resume. That reasoning was correct for THAT narrow case but
// the fix was far too broad: it silently exempted EVERY timestamp field
// on EVERY call from ever being checked for real content at all -- a
// trigger changing a genuine, source-carried timestamp from 2020 to 2035
// would have passed completely unnoticed. Fixed: Date/timestamp values
// are now normalized to a UTC epoch and compared EXACTLY (to the
// precision Postgres's own `timestamp`/`timestamptz` columns actually
// round-trip through node-postgres's Date objects at -- millisecond
// precision; Postgres itself stores microseconds, but neither this
// driver nor the JS `Date` type can represent finer than milliseconds, so
// millisecond-epoch equality IS exact-to-representable-precision, not an
// arbitrary tolerance). The narrow "generated, no real source value"
// case is now handled per-field, per-call, via the caller-supplied
// `exemptFields` option -- see mongo-to-supabase.mjs's per-domain
// `__generatedFields` (only ever populated when this exact document's
// source truly had no original value for that field) -- never a blanket
// exemption for the field's TYPE.
//
// item 2: `if (!(key in dbRow)) continue` silently ignored any expected
// field that did not turn out to be a real column on the target table --
// e.g. a typo'd column name in a caller's `expectedFields` would simply
// never be checked, with no error anywhere, defeating the entire point
// of an exact read-back. Fixed: any key in `expectedFields` that is not
// a real column in the re-read row is now a hard failure UNLESS it is
// named in `spec.nonColumnFields` -- an explicit, per-table allowlist for
// genuine non-column helper fields a caller's `row` object legitimately
// carries (e.g. payments' `_raw`, or this same round's own
// `__generatedFields` marker) that were never meant to be compared
// against a Postgres column at all.
import { decodeCompositeTargetId } from './composite-target-id.mjs';

function toEpochMillis(value) {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function normalizeForCompare(value) {
  if (value === undefined || value === null) return null;
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
 * @param {unknown} expected
 * @param {unknown} actual
 */
function fieldsMatch(expected, actual) {
  // A `timestamp`/`timestamptz` column (pg always returns these as a real
  // JS Date) is identified by either side being a Date instance, OR a
  // string that itself parses as a real timestamp on one side while the
  // other is a Date -- the common shape this codebase's own domains
  // produce (an ISO string as `expected`, a Date as `actual`). Compared
  // EXACTLY at millisecond-epoch precision -- see this file's own header
  // comment (round 10, item 1) for why "both non-null" alone is wrong.
  const eitherIsDate = expected instanceof Date || actual instanceof Date;
  if (eitherIsDate) {
    if ((expected === null || expected === undefined) !== (actual === null || actual === undefined)) return false;
    if (expected === null || expected === undefined) return true; // both null
    const expectedMs = toEpochMillis(expected);
    const actualMs = toEpochMillis(actual);
    if (expectedMs === null || actualMs === null) return false; // one side didn't even parse as a real timestamp -- a genuine mismatch
    return expectedMs === actualMs;
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
 * @param {{table: string, pkColumn?: string, composite?: string[], nonColumnFields?: string[]}} spec
 *   `nonColumnFields` (round 10, item 2): an explicit, per-table allowlist
 *   of `expectedFields` keys that are NOT real Postgres columns on this
 *   table -- e.g. a caller-side helper/marker field. Any OTHER expected
 *   key that isn't a real column on the re-read row is a hard failure.
 * @param {string} targetId - plain id/pkColumn value, or an
 *   encodeCompositeTargetId()-encoded composite identity.
 * @param {Record<string, unknown>} expectedFields - column name -> the
 *   value this migration itself intended to persist there.
 * @param {{exemptFields?: string[]}} [options] - `exemptFields` (round 10,
 *   item 1): field names to skip the VALUE comparison for on THIS call
 *   only -- the column must still exist on the row (still subject to the
 *   nonColumnFields check above). Populate this ONLY when the source
 *   document genuinely carried no original value for that specific field
 *   this specific time (a real generated-fallback, not a blanket
 *   "it's a timestamp" exemption).
 */
export async function verifyReadBack(pgClient, spec, targetId, expectedFields, { exemptFields = [] } = {}) {
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
  const nonColumnFields = new Set(spec.nonColumnFields ?? []);
  const exempt = new Set(exemptFields);
  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expectedFields)) {
    if (nonColumnFields.has(key)) continue; // explicitly declared non-column helper field -- never a real column, never compared
    if (!(key in dbRow)) {
      mismatches.push(`${key} (expected field is not a real column on ${spec.table}, and is not declared in spec.nonColumnFields -- likely a typo)`);
      continue;
    }
    if (exempt.has(key)) continue; // this exact call declared this field a genuine generated-fallback with no source value -- column presence already implied by the row existing at all
    if (!fieldsMatch(expectedValue, dbRow[key])) {
      mismatches.push(`${key} (expected ${JSON.stringify(expectedValue)}, found ${JSON.stringify(dbRow[key])})`);
    }
  }
  if (mismatches.length > 0) {
    return { ok: false, reason: `read-back: ${spec.table} row (target_id=${targetId}) does not match what this migration just wrote -- ${mismatches.join('; ')}` };
  }
  return { ok: true };
}
