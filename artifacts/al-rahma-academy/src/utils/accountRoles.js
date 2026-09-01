// Central, single source of truth for the account-role contract (Stage 2A,
// see docs/user-admin-auth-contract.md). Every component that used to
// branch on the legacy student/teacher/parent/admin value must go through
// this module instead of re-implementing the same normalization.
//
// The product has exactly two account concepts:
//   - a single self-service account type: 'user'
//   - one out-of-band elevated type: 'admin' — but admin status is NEVER
//     derived from the regular account's own `role` field (that field is
//     legacy, client-influenced at signup time historically, and — per
//     the Stage 2 Batch 2 audit — its live server-side enforcement is
//     unverifiable). Admin is only ever proven by a real, separately-
//     authenticated AdminUser + MFA session (see AdminAuthContext.jsx).
//
// This is why normalizeAccountRole() below always returns 'user': there is
// no other regular-account value left to distinguish. A legacy `student`/
// `teacher`/`parent` response, a spoofed `admin` string, a missing role, or
// any unrecognized value all normalize to the same safe result. This is
// intentional, not an oversight — the whole point of the contract is that
// this field can no longer grant anything beyond `user`.

export const ACCOUNT_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

/**
 * Normalizes whatever a regular-account API response's `role` field
 * contains into the single supported self-service account type.
 *
 * Deliberately ALWAYS returns ACCOUNT_ROLES.USER — including for a
 * spoofed or legitimately-returned `role: 'admin'` value. Admin status
 * must never be derived from this field; see isVerifiedAdminSession().
 *
 * @param {unknown} _rawRole - ignored; kept as a parameter for call-site
 *   clarity and so a future, real multi-tier regular-role model (if one
 *   is ever reintroduced deliberately) has an obvious single place to
 *   change.
 * @returns {'user'}
 */
export function normalizeAccountRole(_rawRole) {
  return ACCOUNT_ROLES.USER;
}

/**
 * True for any regular, non-admin account — which, per the contract, is
 * every account, since normalizeAccountRole() never returns anything else.
 * Kept as a named predicate (rather than inlining `=== ACCOUNT_ROLES.USER`
 * everywhere) so call sites read as intent, not as a value comparison.
 */
export function isRegularUser(rawRole) {
  return normalizeAccountRole(rawRole) === ACCOUNT_ROLES.USER;
}

/**
 * The set of states AdminAuthContext's own session-verification state
 * machine can be in. 'checking' and 'unauthenticated' both mean "not
 * proven yet" - only 'verified' does.
 */
export const ADMIN_SESSION_STATUS = Object.freeze({
  CHECKING: 'checking',
  VERIFIED: 'verified',
  UNAUTHENTICATED: 'unauthenticated',
});

/**
 * The ONLY function in the app allowed to answer "is this an admin?".
 *
 * Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): this
 * function's contract changed. It used to take the cached `adminUser`
 * object and return `Boolean(adminUser)` - which meant a forged or merely
 * stale `localStorage.adminUser` value was, by itself, sufficient "proof".
 * That was fail-OPEN: presence of a client-controlled object was treated
 * as verification.
 *
 * It now takes AdminAuthContext's own `sessionStatus` state - which is
 * ONLY ever set to 'verified' after a real server round trip (a fresh
 * login+MFA response, or a real `adminRefresh()` call succeeding against
 * the httpOnly admin_rt cookie the browser controls, not JS). A cached
 * `adminUser` object is presentation data only (which email to show while
 * checking) and can no longer make this return true by itself. This is
 * fail-CLOSED: anything short of a proven server round trip is treated as
 * not-admin, including the entire 'checking' window.
 *
 * @param {'checking'|'verified'|'unauthenticated'} sessionStatus -
 *   AdminAuthContext's own session-verification state.
 * @returns {boolean}
 */
export function isVerifiedAdminSession(sessionStatus) {
  return sessionStatus === ADMIN_SESSION_STATUS.VERIFIED;
}
