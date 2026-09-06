// Writes to admin_audit_log directly (service-role) for the admin AUTH flow
// specifically (login/mfa/logout events happen before req.adminAal exists,
// so there's no user-impersonated context to run these inserts under).
//
// Business-action audit writes that go through a SECURITY DEFINER RPC
// (issue_certificate, revoke_certificate, delete_course_cascade, ...) already
// insert their own admin_audit_log row internally (see lib/db/drizzle/0015)
// and must NOT also call auditAdminAction() below — that would double-log.
// auditAdminAction() exists for the OTHER kind of admin mutation: a direct
// table INSERT/UPDATE/DELETE gated purely by an RLS policy (courses_insert_
// admin_aal2, reviews_moderate_admin_aal2, live_classes_*_admin, ...), which
// has no RPC of its own to log itself.
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

export async function auditAdminAction({
  adminId,
  action,
  resourceType,
  resourceId,
  before = null,
  after = null,
  severity = 'info',
}) {
  await withServiceRole((client) =>
    client.query(
      `INSERT INTO admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId,
        action,
        resourceType,
        String(resourceId),
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        severity,
      ]
    )
  );
}
