// Writes to admin_audit_log directly (service-role) for the admin AUTH flow
// specifically (login/mfa/logout events happen before req.adminAal exists,
// so there's no user-impersonated context to run these inserts under).
// Business-action audit writes (course/coupon/etc. changes) go through the
// SECURITY DEFINER RPCs themselves (see lib/db/drizzle/0013+), not this file.
import { withServiceRole } from './client.js';

export async function auditAdminAuthEvent({
  adminId,
  action,
  severity = 'info',
  after = null,
}) {
  await withServiceRole((client) =>
    client.query(
      `INSERT INTO admin_audit_log (actor_admin_id, action, resource_type, resource_id, after, severity)
       VALUES ($1, $2, 'AdminAuth', $1::text, $3, $4)`,
      [adminId, action, after ? JSON.stringify(after) : null, severity]
    )
  );
}
