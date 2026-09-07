// Admin-router (DATA_BACKEND=supabase) controller for /api/v1/admin/system.
//
// getSystemStatus/toggleMaintenanceMode/toggleFinancialFreeze are backed by
// the real system_config table + system_config_set() RPC (both already
// existed — lib/db/drizzle/0015_new_domains_rls.sql). getAuditLog reads
// admin_audit_log directly (admin_audit_log_select_admin_aal2, 0002_rls.sql).
// listAdmins/createAdmin manage real Supabase Auth accounts, mirroring
// controllers/systemController.js's own super-admin-only route gating.
//
// purgeOldAuditLogs is a REAL, DELIBERATE architecture conflict, not a
// missing adapter: admin_audit_log has a BEFORE UPDATE OR DELETE trigger
// (forbid_audit_log_mutation(), 0001_functions_triggers.sql) that makes
// every row append-only, "regardless of who is connecting" (that trigger's
// own comment) — a deliberate tamper-evidence guarantee built across
// several migrations (0002's RLS comment: "the real forbid_audit_log_
// mutation() trigger already blocks both [UPDATE/DELETE], regardless of
// role"). Mongo's GDPR-purge semantics (hard-delete rows older than N days)
// cannot be reproduced without either dropping/altering that trigger (which
// this task's own rules forbid doing casually — it would silently weaken a
// deliberately-designed security control for every OTHER admin action, not
// just this one) or building a whole separate export/archive-then-delete
// pipeline (a real product decision, out of scope to invent unilaterally
// here). Returns 409 with the reasoning below instead of either a silent
// no-op or a bare "not implemented" — a genuine architecture decision this
// endpoint reports honestly, not a missing implementation.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';
import { getAdminClient } from '../authClients.js';
import { auditAdminAction } from '../adminAuditLog.js';

function parsePagination(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

// @route GET /api/v1/admin/system/status
export const getSystemStatus = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query(`SELECT key, value FROM system_config WHERE key IN ('maintenance_mode', 'financials_frozen')`);
    return r.rows;
  }, { aal: req.adminAal });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  res.json({
    maintenanceMode: byKey.maintenance_mode === 'true',
    financialsFrozen: byKey.financials_frozen === 'true',
    timestamp: new Date().toISOString(),
  });
});

// @route POST /api/v1/admin/system/maintenance
export const toggleMaintenanceMode = asyncHandler(async (req, res) => {
  const { enable } = req.body;
  if (typeof enable !== 'boolean') return res.status(400).json({ message: 'enable must be a boolean' });

  try {
    await withUserContext(req.adminUser.id, (client) => client.query(
      'SELECT system_config_set($1, $2, $3)', ['maintenance_mode', String(enable), 'System maintenance mode flag']
    ), { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
      return res.status(403).json({ message: 'Only a super-admin may toggle maintenance mode' });
    }
    throw err;
  }

  res.json({ message: `Maintenance mode ${enable ? 'enabled' : 'disabled'}`, maintenanceMode: enable });
});

// @route POST /api/v1/admin/system/financial-freeze
export const toggleFinancialFreeze = asyncHandler(async (req, res) => {
  const { enable } = req.body;
  if (typeof enable !== 'boolean') return res.status(400).json({ message: 'enable must be a boolean' });

  try {
    await withUserContext(req.adminUser.id, (client) => client.query(
      'SELECT system_config_set($1, $2, $3)', ['financials_frozen', String(enable), 'Financial operations freeze flag']
    ), { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
      return res.status(403).json({ message: 'Only a super-admin may toggle the financial freeze' });
    }
    throw err;
  }

  res.json({ message: `Financial operations ${enable ? 'frozen' : 'unfrozen'}`, financialsFrozen: enable });
});

// @route GET /api/v1/admin/system/audit-log
export const getAuditLog = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { severity, resource, adminId, from, to } = req.query;

  const conditions = [];
  const params = [];
  if (severity) { params.push(severity); conditions.push(`severity = $${params.length}`); }
  if (resource) { params.push(resource); conditions.push(`resource_type = $${params.length}`); }
  if (adminId)  { params.push(adminId);  conditions.push(`actor_admin_id = $${params.length}`); }
  if (from)     { params.push(new Date(from)); conditions.push(`created_at >= $${params.length}`); }
  if (to)       { params.push(new Date(to));   conditions.push(`created_at <= $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows, total } = await withUserContext(req.adminUser.id, async (client) => {
    const dataRes = await client.query(
      `SELECT * FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM admin_audit_log ${where}`, params);
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  }, { aal: req.adminAal });

  const data = rows.map((r) => ({
    _id: r.id, adminId: r.actor_admin_id, action: r.action, resource: r.resource_type,
    resourceId: r.resource_id, before: r.before, after: r.after, severity: r.severity, createdAt: r.created_at,
  }));

  res.json({ data, total, page, pages: Math.ceil(total / limit), limit });
});

// @route DELETE /api/v1/admin/system/audit-log
export const purgeOldAuditLogs = asyncHandler(async (req, res) => {
  res.status(409).json({
    message: 'admin_audit_log is append-only by design under DATA_BACKEND=supabase (forbid_audit_log_mutation trigger — see lib/db/drizzle/0001_functions_triggers.sql). ' +
      'GDPR-purge-by-delete is not available; export the rows you need to retain and file a product decision before any schema change to this guarantee.',
  });
});

// @route GET /api/v1/admin/system/admins
export const listAdmins = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query(
      `SELECT p.id, p.name, p.email, ara.role, ara.assigned_at
         FROM admin_role_assignments ara
         JOIN profiles p ON p.id = ara.user_id
        ORDER BY ara.assigned_at DESC`
    );
    return r.rows;
  }, { aal: req.adminAal });

  const data = rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.assigned_at }));
  res.json({ data, total: data.length });
});

// @route POST /api/v1/admin/system/admins
export const createAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body;

  const { data, error } = await getAdminClient().auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      return res.status(409).json({ message: 'An admin with this email already exists' });
    }
    throw error;
  }
  const newId = data.user.id;

  try {
    await withUserContext(req.adminUser.id, (client) => client.query('SELECT admin_set_admin_role($1, $2::admin_role)', [newId, role]), { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /insufficient_privilege/i.test(err.message)) {
      return res.status(403).json({ message: 'Only a super-admin may create admin accounts' });
    }
    throw err;
  }

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'system.admin_created', resourceType: 'admin_role_assignments',
    resourceId: newId, after: { name, email, role }, severity: 'critical',
  });

  res.status(201).json({ id: newId, name, email, role });
});
