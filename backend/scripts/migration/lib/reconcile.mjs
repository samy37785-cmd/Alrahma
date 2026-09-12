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
 */
export async function verifyThenReconcile(pgClient, ledgerId, checks) {
  for (const check of checks) {
    const result = typeof check === 'function'
      ? await check()
      : await verifyReadBack(pgClient, check.spec, check.targetId, check.expectedFields, check.options);
    if (!result.ok) return result;
  }
  await markReconciled(pgClient, ledgerId);
  return { ok: true };
}
