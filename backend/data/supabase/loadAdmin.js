// Loads an admin's identity from Supabase Auth + Postgres, in the shape
// backend/middleware/adminAuth.js and data/supabase/adminAuthController.js
// need. Used only when DATA_BACKEND=supabase.
//
// Mapping vs. the Mongo AdminUser document (see lib/db/drizzle/
// 0013_admin_rbac.sql's header comment for the full, authoritative mapping):
//   - identity/isActive        -> auth.users (banned_until)
//   - role (super-admin/admin/
//     editor/viewer)           -> admin_role_assignments.role
//   - permissions              -> role_permissions + user_extra_permissions
//   - mfaEnabled                -> "does this user have >=1 verified TOTP
//                                   factor in auth.mfa_factors" (computed,
//                                   not a stored flag — GoTrue owns this)
// All reads here use the service-role connection because they run BEFORE we
// know the caller's own claims (during login, or inside verifyAccessToken
// before req.adminAal is established) — never a shortcut for admin-facing
// business data, which still goes through withUserContext/authorize().
import { withServiceRole } from './client.js';

// Returns null if the user doesn't exist, is banned/deleted, or has no
// admin_role_assignments row (i.e. is not an admin at all).
export async function loadAdminById(id) {
  return withServiceRole(async (client) => {
    const r = await client.query(
      `SELECT p.id, p.email, p.name, ara.role
         FROM profiles p
         JOIN admin_role_assignments ara ON ara.user_id = p.id
         JOIN auth.users au ON au.id = p.id
        WHERE p.id = $1
          AND (au.banned_until IS NULL OR au.banned_until < now())`,
      [id]
    );
    return r.rows[0] ?? null;
  });
}

// Whether this admin has ever completed TOTP enrollment (a verified factor).
// Mirrors AdminUser.mfaEnabled's role in the login-stage/gating decisions.
export async function hasVerifiedMfaFactor(id) {
  return withServiceRole(async (client) => {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM auth.mfa_factors WHERE user_id = $1 AND status = 'verified'`,
      [id]
    );
    return r.rows[0].n > 0;
  });
}

// Flat list of permission strings this admin currently holds — role-derived
// plus any individual grants — matching the shape of Mongo's
// admin.getPermissions(). super-admin implicitly holds every permission
// (see authorize()'s SQL), represented here as the literal string '*'.
export async function getAdminPermissions(id, role) {
  if (role === 'super-admin') return ['*'];
  return withServiceRole(async (client) => {
    const r = await client.query(
      `SELECT permission FROM role_permissions WHERE role = $1
       UNION
       SELECT permission FROM user_extra_permissions WHERE user_id = $2
       ORDER BY 1`,
      [role, id]
    );
    return r.rows.map((row) => row.permission);
  });
}
