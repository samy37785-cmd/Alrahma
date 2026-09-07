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
  // NOTE: resource_id is passed as its own bound parameter ($5), not a
  // `$1::text` re-cast of the uuid actor_admin_id parameter — reusing the
  // same placeholder with two different resolved types (uuid at $1's first
  // use, text at the cast) makes Postgres's extended-query-protocol
  // parameter-type inference fail with "inconsistent types deduced for
  // parameter $1" on every call. This was a real, previously-undiscovered
  // bug: every actual admin login (auth.login_stage1) hit this exact query,
  // so the admin audit log write has been silently failing (thrown from
  // asyncHandler, surfaced to the client as a 500) on every real GoTrue
  // login this whole time — masked in every prior rehearsal because those
  // rehearsals hand-signed AAL2 tokens and never exercised login() itself.
  // Found and fixed via the real-GoTrue auth-migration rehearsal
  // (rehearsal-auth-migration-real-gotrue.mjs).
  await withServiceRole((client) =>
    client.query(
      `INSERT INTO admin_audit_log (actor_admin_id, action, resource_type, resource_id, after, severity)
       VALUES ($1, $2, 'AdminAuth', $5, $3, $4)`,
      [adminId, action, after ? JSON.stringify(after) : null, severity, String(adminId)]
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
