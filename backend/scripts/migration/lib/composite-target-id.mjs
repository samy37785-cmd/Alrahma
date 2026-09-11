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

/**
 * Encodes a composite target identity (e.g. [userId, verseKey]) into the
 * single string stored as migration_source_ledger.target_id. Reversible
 * for ANY component value, including one containing the delimiter this
 * encoding used to use.
 * @param {(string|number)[]} parts
 */
export function encodeCompositeTargetId(parts) {
  if (!Array.isArray(parts) || parts.length < 2) {
    throw new Error('encodeCompositeTargetId requires an array of at least two component values');
  }
  return JSON.stringify(parts.map((p) => String(p)));
}

/**
 * Decodes a target_id produced by encodeCompositeTargetId() back into its
 * component parts, in the same order. Throws on anything that is not
 * exactly that shape -- callers that need fail-closed (not throw)
 * behavior on an unrecognized/legacy value should catch this themselves.
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
  if (!Array.isArray(parts) || parts.length < 2 || !parts.every((p) => typeof p === 'string')) {
    throw new Error(`composite target_id did not decode to an array of at least two strings: ${JSON.stringify(targetId)}`);
  }
  return parts;
}
