// PR #70 review round 11 -- a single, shared verify-then-reconcile
// abstraction, replacing the previous pattern of each call site doing its
// own "verifyReadBack(...); if (!ok) throw/return; markReconciled(...)"
// sequence inline.
//
// Why this exists: round 10's own regression guard (lib/markreconciled-
// coverage.test.mjs) only ever proved a `verifyReadBack(` call TEXTUALLY
// appeared somewhere in the preceding 80 lines before a `markReconciled(`
// call -- a real gap the reviewer correctly flagged: nothing actually
// proved that read-back was on the SAME control-flow path, checking the
// SAME target, as the reconciliation it precedes. A read-back for an
// entirely unrelated check placed nearby in the same function would have
// satisfied the old test just as well as a real one.
//
// Fixed structurally, not by tightening the heuristic: `markReconciled()`
// is no longer called directly anywhere in mongo-to-supabase.mjs or
// migrate-users-to-supabase-auth.mjs at all -- the ONLY way either file
// can mark a ledger row reconciled is through this one function, which
// itself only ever reaches its own internal `markReconciled()` call after
// every one of the caller-supplied `checks` has actually returned
// `{ok: true}`, in order, synchronously, in the same function call. This
// makes the invariant "reconciled implies verified" a property of the
// code's actual structure, not of two lines happening to be textually
// close together -- lib/markreconciled-coverage.test.mjs now proves this
// by asserting `markReconciled(` appears NOWHERE in either production
// file (every real call is inside this file instead).
import { verifyReadBack } from './read-back-verify.mjs';
import { markReconciled } from './source-ledger.mjs';

/**
 * @param {import('pg').ClientBase} pgClient
 * @param {number|string} ledgerId - the migration_source_ledger row id to
 *   reconcile once every check passes.
 * @param {Array<{spec: object, targetId: string, expectedFields: object, options?: object} | (() => Promise<{ok: boolean, reason?: string}>)>} checks
 *   Each entry is either a plain object describing a verifyReadBack() call
 *   (spec/targetId/expectedFields/options, forwarded verbatim), or a plain
 *   async function returning `{ok, reason}` directly -- for the two
 *   relationship workers (applyTeacherLink/applyParentChildLink), whose
 *   own bespoke identity-complete SELECT is already a real, sufficient
 *   read-back for their specific table shape (see those functions' own
 *   header comments) but is not itself a verifyReadBack() call. Checks
 *   run in order and short-circuit on the first failure -- nothing after
 *   a failed check is ever attempted.
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>} Never
 *   calls markFailed() itself -- callers keep their own existing
 *   markFailed()-on-failure handling exactly as before; this function's
 *   only side effect on success is the one markReconciled() call.
 *
 * PR #70 review round 12, item 2 -- two closed gaps in this function's own
 * contract, found while closing the three unprotected reconciled-fast-
 * paths in migrate-users-to-supabase-auth.mjs (round 12, item 1):
 *
 *   1. `checks=[]` (an empty array) previously reconciled a ledger row
 *      having verified NOTHING at all -- a caller passing no checks (a
 *      bug, or a refactor accidentally dropping every check) silently
 *      behaved exactly like a caller that verified everything. Now a hard,
 *      explicit failure: this function refuses to reconcile without at
 *      least one real check having actually run.
 *   2. A check function returning `{}`, `null`, `undefined`, or anything
 *      without an explicit `ok: true` was previously treated as falsy-ish
 *      only by accident of how the old code happened to read `.ok` off of
 *      it (`undefined` is falsy, so this specific shape happened to fail
 *      closed before too) -- but nothing ever asserted the result was a
 *      well-formed `{ok, reason}` object, so a check with a typo'd field
 *      name (`{success: true}` instead of `{ok: true}`) would ALSO have
 *      been silently treated as a failure with no reason, or worse, a
 *      check returning a truthy non-boolean in some other field could
 *      slip through unnoticed. Now explicit: only a result whose `ok`
 *      property is exactly `=== true` counts as passing; anything else
 *      (including a malformed/non-object result) is a failure with a
 *      clear, diagnosable reason.
 *   3. `markReconciled()` (lib/source-ledger.mjs) now throws if its own
 *      UPDATE affects anything other than exactly 1 row (round 12, item
 *      2) -- e.g. the ledger row was deleted between the last check
 *      passing and this call, or an invalid ledgerId was passed in. That
 *      throw is caught HERE, not left to propagate: every caller in this
 *      codebase already treats this function's return value as the sole
 *      source of truth (`if (!reconcileResult.ok) ...`), and several call
 *      sites (migrateOneUser/migrateOneAdmin's own per-document loops in
 *      migrate-users-to-supabase-auth.mjs) are NOT wrapped in their own
 *      try/catch -- letting this propagate as an uncaught exception would
 *      crash the entire batch over one document, the exact failure class
 *      this file's own review history has repeatedly closed elsewhere.
 *      The net effect either way is identical to the contract this
 *      function has always promised: it is now structurally impossible
 *      for this function to return `{ok: true}` when markReconciled()
 *      affected zero rows.
 */
export async function verifyThenReconcile(pgClient, ledgerId, checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return {
      ok: false,
      reason: 'verifyThenReconcile() called with zero checks -- refusing to reconcile a ledger row without at least one real verification',
    };
  }
  for (const check of checks) {
    const result = typeof check === 'function'
      ? await check()
      : await verifyReadBack(pgClient, check.spec, check.targetId, check.expectedFields, check.options);
    if (!result || typeof result !== 'object' || result.ok !== true) {
      const reason =
        result && typeof result === 'object' && typeof result.reason === 'string'
          ? result.reason
          : `verifyThenReconcile() check returned a malformed result (expected {ok: true} or {ok: false, reason}): ${JSON.stringify(result)}`;
      return { ok: false, reason };
    }
  }
  try {
    await markReconciled(pgClient, ledgerId);
  } catch (err) {
    return { ok: false, reason: `every check passed but the final ledger reconciliation update itself failed: ${err.message}` };
  }
  return { ok: true };
}
