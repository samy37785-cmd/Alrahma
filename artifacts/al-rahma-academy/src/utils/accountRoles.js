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
 * The ONLY function in the app allowed to answer "is this an admin?".
 * Admin is proven exclusively by a real AdminUser + MFA session (the
 * `adminUser` object from AdminAuthContext / useAdminAuth()) — never by
 * a regular account's `role` field, never by localStorage, never by a
 * query parameter, and never by public registration/user_metadata.
 *
 * @param {{ email?: string } | null | undefined} adminUser - the cached
 *   AdminUser profile from useAdminAuth(). A non-null object means a
 *   session was established through the real admin login + MFA flow;
 *   AdminSessionGate/adminHttp are responsible for keeping this in sync
 *   with the actual httpOnly admin_at/admin_rt cookies server-side.
 * @returns {boolean}
 */
export function isVerifiedAdminSession(adminUser) {
  return Boolean(adminUser);
}
