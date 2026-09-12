// Composite target_id codec -- PR #70 review round 9, item 1.
//
// A composite target_id is used whenever a target table's real primary
// key is more than one column: wishlists, hifz_progress, course_progress,
// quran_bookmarks, coupon_redemptions, document_counters (see
// mongo-to-supabase.mjs's own ROLLBACK_SPEC and
// production-import-orchestrator.mjs's LEDGER_BACKED_TARGET_SPECS).
//
// Previously this was a plain `${a}:${b}` string, decoded with
// `String(targetId).split(':')`. That is NOT reversible whenever a
// component's own value can itself contain the delimiter --
// quran_bookmarks.verse_key is exactly that: real values look like
// "2:255" (surah:ayah). `"<uuid>:2:255".split(':')` yields THREE parts,
// silently dropping data and producing the wrong pair on decode -- this
// broke resume, rollback, and both directions of the bidirectional
// ledger-integrity check identically, since each independently
// re-derived a (user_id, verse_key) pair from the same corrupted split.
//
// Fixed with a single, centralized, unambiguous, reversible codec: a
// JSON array of the component strings. JSON.stringify/JSON.parse already
// correctly escape/unescape any character -- including the delimiter
// itself -- inside a JSON string, so no component value can ever corrupt
// the encoding, regardless of what it contains. migration_source_ledger
// .target_id is a plain `text` column (0022_lossless_migration_support.sql),
// so this is a drop-in replacement -- no schema change needed.
//
// This PR has never been merged and has never run against a real
// target (Local Rehearsal only) -- there is no legacy ":"-encoded
// target_id anywhere to migrate. This is a clean switch, not a
// dual-format transition.
//
// Deliberately NOT applied to profiles_teacher_link's
// `<studentProfileId>:<teacherProfileId>` or parent_student_links'
// `<parentProfileId>:<childProfileId>` composite target_ids
// (migrate-users-to-supabase-auth.mjs's applyTeacherLink()/
// applyParentChildLink()) -- both components are always real Postgres
// `profiles.id` UUIDs, which structurally cannot contain a ":"
// character (RFC 4122 hex-and-hyphen only), so that specific ":"-join
// is provably safe -- reviewed and deliberately left alone, not
// overlooked.

// PR #70 review round 10, item 4: arity used to be "at least two parts",
// not "exactly two parts". Every real composite domain today (wishlists,
// hifz_progress, course_progress, quran_bookmarks, coupon_redemptions,
// document_counters) has EXACTLY two key columns -- ROLLBACK_SPEC/
// LEDGER_BACKED_TARGET_SPECS destructure a decoded target_id as
// `const [a, b] = decodeCompositeTargetId(pgId)`. With the old ">=2"
// check, a 3-part (or longer) JSON array decoded SUCCESSFULLY -- the
// destructure silently kept only the first two elements and dropped the
// rest, with NO error anywhere. rollbackDomain()'s composite branch then
// issued `DELETE FROM <table> WHERE <col0>=a AND <col1>=b` using only
// those two (of N) real values -- for a table whose actual primary key is
// exactly those two columns this happens to still be correct today only
// by coincidence (no current table has a 3rd composite key column), but
// it is not a real guarantee: a malformed/tampered/future 3-part
// target_id would silently ignore its own 3rd component and could delete
// a row sharing only 2 of 3 true key values with the intended target --
// closed by making both encode and decode fail on anything but exactly the
// arity this codec is actually built and used for. A future domain that
// genuinely needs 3+ composite columns must extend this codec (and every
// call site that assumes 2) deliberately, not fall through an accidentally
// permissive check.
const COMPOSITE_ARITY = 2;

/**
 * Encodes a composite target identity (e.g. [userId, verseKey]) into the
 * single string stored as migration_source_ledger.target_id. Reversible
 * for ANY component value, including one containing the delimiter this
 * encoding used to use. Requires EXACTLY COMPOSITE_ARITY (2) parts --
 * see the module-level comment above for why "at least 2" was unsafe.
 * @param {(string|number)[]} parts
 */
export function encodeCompositeTargetId(parts) {
  if (!Array.isArray(parts) || parts.length !== COMPOSITE_ARITY) {
    throw new Error(`encodeCompositeTargetId requires an array of exactly ${COMPOSITE_ARITY} component values, got ${Array.isArray(parts) ? parts.length : typeof parts}`);
  }
  return JSON.stringify(parts.map((p) => String(p)));
}

/**
 * Decodes a target_id produced by encodeCompositeTargetId() back into its
 * component parts, in the same order. Throws on anything that is not
 * exactly that shape -- including an array with fewer or MORE than
 * COMPOSITE_ARITY (2) elements -- callers that need fail-closed (not
 * throw) behavior on an unrecognized/legacy value should catch this
 * themselves.
 * @param {string} targetId
 * @returns {string[]}
 */
export function decodeCompositeTargetId(targetId) {
  let parts;
  try {
    parts = JSON.parse(targetId);
  } catch {
    throw new Error(`composite target_id is not valid JSON: ${JSON.stringify(targetId)}`);
  }
  if (!Array.isArray(parts) || parts.length !== COMPOSITE_ARITY || !parts.every((p) => typeof p === 'string')) {
    throw new Error(
      `composite target_id did not decode to an array of exactly ${COMPOSITE_ARITY} strings ` +
      `(got ${Array.isArray(parts) ? `${parts.length} element(s)` : typeof parts}): ${JSON.stringify(targetId)}`
    );
  }
  return parts;
}
