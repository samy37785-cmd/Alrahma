// Admin-router (DATA_BACKEND=supabase) controller for /api/v1/admin/courses.
// Mirrors routes/v1/admin/coursesRoutes.js's contract (createCRUDController
// response shapes + deleteCourseCascade behavior), backed by the Stage 2F
// schema's courses_insert_admin_aal2/courses_update_admin_aal2 RLS policies
// and delete_course_cascade() RPC (lib/db/drizzle/0015_new_domains_rls.sql) —
// all already require is_admin_aal2() + authorize('courses:*') at the DB
// layer; req.adminAal (verified fresh per-request — see middleware/
// adminAuth.js) is what makes that check pass for a genuinely-MFA'd admin.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';

function toJson(row) {
  return {
    _id: row.id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    level: row.level,
    price: row.price_minor / 100,
    tags: row.tags,
    resources: row.resources,
    modules: row.modules,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

// @route GET /api/v1/admin/courses
// Auth hardening security batch: this used to ignore every query filter
// (level/published) unconditionally — the Mongo-mode equivalent
// (routes/v1/admin/coursesRoutes.js's allowedFilters) supports both; this
// now matches it for backend parity.
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const conditions = [];
  const params = [];
  if (req.query.level) {
    params.push(req.query.level);
    conditions.push(`level = $${params.length}::course_level`);
  }
  if (req.query.published !== undefined) {
    params.push(req.query.published === 'true');
    conditions.push(`published = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows, total } = await withUserContext(req.adminUser.id, async (client) => {
    const dataRes = await client.query(
      `SELECT * FROM courses ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM courses ${where}`, params);
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  }, { aal: req.adminAal });

  res.json({ data: rows.map(toJson), total, page, pages: Math.ceil(total / limit) });
});

// @route GET /api/v1/admin/courses/:id
export const getOne = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query(`SELECT * FROM courses WHERE id = $1`, [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });

  if (!row) return res.status(404).json({ message: 'Course not found' });
  res.json(toJson(row));
});

// @route POST /api/v1/admin/courses
export const create = asyncHandler(async (req, res) => {
  const {
    title, description, icon, level, price, tags = [], resources = [], modules = [], published = true,
  } = req.body;

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `INSERT INTO courses (title, description, icon, level, price_minor, tags, resources, modules, published)
         VALUES ($1, $2, COALESCE($3, '📘'), COALESCE($4::course_level, 'All levels'), $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          title, description, icon, level, Math.round((price ?? 0) * 100),
          JSON.stringify(tags), JSON.stringify(resources), JSON.stringify(modules), published,
        ]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'course.create', resourceType: 'courses',
    resourceId: row.id, after: row,
  });

  res.status(201).json(toJson(row));
});

// @route PUT /api/v1/admin/courses/:id
export const update = asyncHandler(async (req, res) => {
  const {
    title, description, icon, level, price, tags, resources, modules, published,
  } = req.body;

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `UPDATE courses SET
           title = COALESCE($2, title),
           description = COALESCE($3, description),
           icon = COALESCE($4, icon),
           level = COALESCE($5::course_level, level),
           price_minor = COALESCE($6, price_minor),
           tags = COALESCE($7, tags),
           resources = COALESCE($8, resources),
           modules = COALESCE($9, modules),
           published = COALESCE($10, published)
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id, title ?? null, description ?? null, icon ?? null, level ?? null,
          price != null ? Math.round(price * 100) : null,
          tags ? JSON.stringify(tags) : null,
          resources ? JSON.stringify(resources) : null,
          modules ? JSON.stringify(modules) : null,
          published ?? null,
        ]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Course not found' });

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'course.update', resourceType: 'courses',
    resourceId: row.id, after: row,
  });

  res.json(toJson(row));
});

// @route DELETE /api/v1/admin/courses/:id
// delete_course_cascade() itself writes the admin_audit_log row (see
// lib/db/drizzle/0015_new_domains_rls.sql) — no separate auditAdminAction()
// call here, to avoid double-logging.
export const remove = asyncHandler(async (req, res) => {
  let existed;
  try {
    existed = await withUserContext(req.adminUser.id, async (client) => {
      const check = await client.query(`SELECT id FROM courses WHERE id = $1`, [req.params.id]);
      if (!check.rows[0]) return false;
      await client.query(`SELECT delete_course_cascade($1)`, [req.params.id]);
      return true;
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /insufficient_privilege|permission denied/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }
  if (!existed) return res.status(404).json({ message: 'Course not found' });
  res.json({ message: 'Course deleted successfully' });
});
