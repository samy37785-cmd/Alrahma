// Admin-router (DATA_BACKEND=supabase) controller for
// /api/v1/admin/enrollments. enrollments_select_admin/_update_admin_aal2/
// _delete_admin_aal2 (0002_rls.sql) already exist; enrollments_insert_
// admin_aal2 (lib/db/drizzle/0018_admin_users_system_and_enrollment_gaps.sql)
// is new — the public path (enrollments_insert_public) forces status='new'
// and its GRANT excludes status/id/created_at/updated_at, so an admin
// authoring a fully-specified record needed a real, separate policy.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

function toJson(row) {
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp,
    country: row.country,
    city: row.city,
    timezone: row.timezone,
    times: row.times,
    subjects: row.subjects,
    lang: row.lang,
    level: row.level,
    ageGroup: row.age_group,
    genderPref: row.gender_pref,
    teacherId: row.preferred_teacher_key,
    teacherName: row.preferred_teacher_name,
    plan: row.requested_plan_slug,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// @route GET /api/v1/admin/enrollments
export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { status, plan, country } = req.query;

  const conditions = [];
  const params = [];
  if (status)  { params.push(status);  conditions.push(`status = $${params.length}`); }
  if (plan)    { params.push(plan);    conditions.push(`requested_plan_slug = $${params.length}`); }
  if (country) { params.push(country); conditions.push(`country = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows, total } = await withUserContext(req.adminUser.id, async (client) => {
    const dataRes = await client.query(
      `SELECT * FROM enrollments ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM enrollments ${where}`, params);
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  }, { aal: req.adminAal });

  res.json({ data: rows.map(toJson), total, page, pages: Math.ceil(total / limit) });
});

// @route GET /api/v1/admin/enrollments/:id
export const getOne = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query('SELECT * FROM enrollments WHERE id = $1', [req.params.id]);
    return r.rows[0];
  }, { aal: req.adminAal });

  if (!row) return res.status(404).json({ message: 'Enrollment not found' });
  res.json(toJson(row));
});

// @route POST /api/v1/admin/enrollments
export const create = asyncHandler(async (req, res) => {
  const d = req.body;
  if (!d.name || !d.email) return res.status(400).json({ message: 'Name and email are required' });

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `INSERT INTO enrollments (
           name, email, whatsapp, country, city, timezone, times, subjects, lang, level,
           age_group, gender_pref, preferred_teacher_key, preferred_teacher_name,
           requested_plan_slug, status, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16,'new'),$17)
         RETURNING *`,
        [
          d.name, d.email, d.whatsapp ?? null, d.country ?? null, d.city ?? null, d.timezone ?? null,
          JSON.stringify(d.times ?? []), JSON.stringify(d.subjects ?? []), d.lang ?? null, d.level ?? null,
          d.ageGroup ?? null, d.genderPref ?? null,
          d.teacherId != null ? String(d.teacherId) : null, d.teacherName ?? null,
          d.plan ?? null, d.status ?? null, d.notes ?? null,
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

  await auditAdminAction({ adminId: req.adminUser.id, action: 'enrollment.create', resourceType: 'enrollments', resourceId: row.id, after: row });
  res.status(201).json(toJson(row));
});

// @route PUT /api/v1/admin/enrollments/:id
export const update = asyncHandler(async (req, res) => {
  const d = req.body;
  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `UPDATE enrollments SET
           name = COALESCE($2, name),
           email = COALESCE($3, email),
           whatsapp = COALESCE($4, whatsapp),
           country = COALESCE($5, country),
           city = COALESCE($6, city),
           status = COALESCE($7, status),
           notes = COALESCE($8, notes)
         WHERE id = $1
         RETURNING *`,
        [req.params.id, d.name ?? null, d.email ?? null, d.whatsapp ?? null, d.country ?? null, d.city ?? null, d.status ?? null, d.notes ?? null]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Enrollment not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'enrollment.update', resourceType: 'enrollments', resourceId: row.id, after: row });
  res.json(toJson(row));
});

// @route DELETE /api/v1/admin/enrollments/:id
export const remove = asyncHandler(async (req, res) => {
  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query('DELETE FROM enrollments WHERE id = $1 RETURNING id', [req.params.id]);
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }
  if (!row) return res.status(404).json({ message: 'Enrollment not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'enrollment.delete', resourceType: 'enrollments', resourceId: row.id, severity: 'warning' });
  res.json({ message: 'Enrollment deleted successfully' });
});
