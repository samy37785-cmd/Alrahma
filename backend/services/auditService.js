import SystemAuditLog from '../models/SystemAuditLog.js';
import { anonymizeIp } from '../config/encryption.js';

const SENSITIVE_FIELDS = new Set([
  'password', '_mfaSecret', '_mfaPendingSecret', 'token', 'tokenHash',
]);

function stripSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function toPlain(doc) {
  if (!doc) return null;
  return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

/**
 * Writes an immutable audit log entry.
 *
 * @param {object} params
 * @param {*}      params.adminId
 * @param {string} params.adminEmail
 * @param {string} params.action
 * @param {string} params.resource
 * @param {*}      [params.resourceId]
 * @param {*}      [params.before]
 * @param {*}      [params.after]
 * @param {string} [params.severity='info']   'info' | 'warning' | 'critical'
 * @param {string} [params.userAgent]
 * @param {string} [params.ip]
 * @param {*}      [params.metadata]
 */
export async function createAuditLog({
  adminId,
  adminEmail,
  action,
  resource,
  resourceId = null,
  before = null,
  after  = null,
  severity  = 'info',
  userAgent = null,
  ip        = null,
  metadata  = null,
}) {
  await SystemAuditLog.create({
    adminId,
    adminEmail,
    action,
    resource,
    resourceId: resourceId ? String(resourceId) : null,
    before:     before ? stripSensitive(toPlain(before)) : null,
    after:      after  ? stripSensitive(toPlain(after))  : null,
    severity,
    userAgent,
    ipAnon: ip ? anonymizeIp(ip) : null,
    metadata,
  });
}

/**
 * Convenience wrapper that extracts the common fields from an Express request
 * and an admin user document, then delegates to createAuditLog.
 *
 * Supports two calling patterns:
 *
 *   auditFromReq(req, action, resource, resourceId, before, after, severity)
 *   auditFromReq(req, action, resource, resourceId, before, after, severity, metadata)
 */
export async function auditFromReq(
  req,
  action,
  resource,
  resourceId = null,
  before     = null,
  after      = null,
  severity   = 'info',
  metadata   = null,
) {
  return createAuditLog({
    adminId:    req.adminId,
    adminEmail: req.adminUser?.email,
    action,
    resource,
    resourceId,
    before,
    after,
    severity,
    userAgent: req.headers?.['user-agent'] ?? null,
    ip:        req.ip ?? '',
    metadata,
  });
}

/**
 * Convenience wrapper for the adminAuthController pattern where the admin
 * document is passed directly (before req.adminUser is populated by middleware).
 */
export async function auditFromAdmin(adminUser, action, req, extra = {}) {
  return createAuditLog({
    adminId:    adminUser._id,
    adminEmail: adminUser.email,
    action,
    resource:   extra.resource ?? 'AdminAuth',
    resourceId: extra.resourceId ?? String(adminUser._id),
    before:     extra.before ?? null,
    after:      extra.after  ?? null,
    severity:   extra.severity ?? 'info',
    userAgent:  req.headers?.['user-agent'] ?? null,
    ip:         req.ip ?? '',
    metadata:   extra.metadata ?? null,
  });
}

export { stripSensitive, toPlain };
