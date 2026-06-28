import mongoose from 'mongoose';
import SystemAuditLog from '../models/SystemAuditLog.js';
import { anonymizeIp } from '../config/encryption.js';

// Fields that must never appear in before/after audit snapshots
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

async function audit(req, action, resource, resourceId, before, after, severity = 'info') {
  await SystemAuditLog.create({
    adminId:    req.adminId,
    adminEmail: req.adminUser.email,
    action,
    resource,
    resourceId: resourceId ? String(resourceId) : null,
    before:     before ? stripSensitive(toPlain(before)) : null,
    after:      after  ? stripSensitive(toPlain(after))  : null,
    severity,
    userAgent:  req.headers['user-agent'] ?? null,
    ipAnon:     anonymizeIp(req.ip ?? ''),
  });
}

/**
 * createCRUDController(Model, options)
 *
 * Returns { list, getOne, create, update, remove }.
 *
 * Options:
 *   resourceName  {string}   — used in audit logs (default: model name)
 *   defaultLimit  {number}   — default page size (default: 50)
 *   maxLimit      {number}   — maximum page size (default: 500)
 *   searchFields  {string[]} — fields to include in regex search on ?q=
 *   allowedFilters{string[]} — query params that are forwarded as Mongoose filter keys
 *   populateFields{string[]} — fields to populate in list/getOne
 *   sortable      {string[]} — fields the client is allowed to sort by
 *   createMiddleware  — optional transform of req.body before Model.create
 *   updateMiddleware  — optional transform of req.body before doc.save
 *   sensitiveSelect   — additional fields to .select('+field') when needed
 */
export function createCRUDController(Model, options = {}) {
  const {
    resourceName   = Model.modelName,
    defaultLimit   = 50,
    maxLimit       = 500,
    searchFields   = [],
    allowedFilters = [],
    populateFields = [],
    sortable       = ['createdAt', 'updatedAt'],
    createMiddleware = null,
    updateMiddleware = null,
  } = options;

  // ── LIST ──────────────────────────────────────────────────────────────────
  async function list(req, res) {
    const page  = Math.max(1, parseInt(req.query.page  ?? 1,  10));
    const limit = Math.min(
      maxLimit,
      Math.max(1, parseInt(req.query.limit ?? defaultLimit, 10))
    );
    const skip  = (page - 1) * limit;

    const filter = {};

    // Full-text search across searchFields via case-insensitive regex
    if (req.query.q && searchFields.length > 0) {
      const escaped = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      filter.$or = searchFields.map((f) => ({ [f]: re }));
    }

    // Allowed direct-match filters forwarded from query params
    for (const f of allowedFilters) {
      if (req.query[f] !== undefined) {
        filter[f] = req.query[f];
      }
    }

    // Sort: validate against allowed fields to prevent injection
    let sortKey   = req.query.sort   ?? 'createdAt';
    let sortOrder = req.query.order  ?? 'desc';
    if (!sortable.includes(sortKey))           sortKey   = 'createdAt';
    if (!['asc', 'desc'].includes(sortOrder))  sortOrder = 'desc';

    let query = Model.find(filter)
      .sort({ [sortKey]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limit);

    for (const f of populateFields) query = query.populate(f);

    const [data, total] = await Promise.all([query.exec(), Model.countDocuments(filter)]);

    return res.json({ data, total, page, pages: Math.ceil(total / limit) });
  }

  // ── GET ONE ───────────────────────────────────────────────────────────────
  async function getOne(req, res) {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    let query = Model.findById(req.params.id);
    for (const f of populateFields) query = query.populate(f);
    const doc = await query.exec();

    if (!doc) return res.status(404).json({ message: `${resourceName} not found` });
    return res.json(doc);
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  async function create(req, res) {
    let body = req.body;
    if (createMiddleware) body = await createMiddleware(body, req);

    const doc = await Model.create(body);

    await audit(req, `${resourceName.toLowerCase()}.create`, resourceName, doc._id, null, doc, 'info');

    return res.status(201).json(doc);
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  async function update(req, res) {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: `${resourceName} not found` });

    const before = toPlain(doc);
    let   body   = req.body;
    if (updateMiddleware) body = await updateMiddleware(body, doc, req);

    Object.assign(doc, body);
    await doc.save();

    await audit(req, `${resourceName.toLowerCase()}.update`, resourceName, doc._id, before, doc);

    return res.json(doc);
  }

  // ── REMOVE ────────────────────────────────────────────────────────────────
  async function remove(req, res) {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: `${resourceName} not found` });

    await audit(req, `${resourceName.toLowerCase()}.delete`, resourceName, doc._id, doc, null, 'warning');

    return res.json({ message: `${resourceName} deleted successfully` });
  }

  return { list, getOne, create, update, remove };
}
