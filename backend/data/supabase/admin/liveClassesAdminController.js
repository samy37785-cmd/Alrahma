// Admin-router (DATA_BACKEND=supabase) controller for live_classes — a new
// admin surface (no Mongo-mode equivalent exists at routes/v1/admin/, since
// Mongo admins could already manage any class through the customer-facing
// /api/classes route via role==='admin'). Under Supabase, that customer
// route runs through the regular `protect` middleware, which never carries
// AAL2 proof (see data/supabase/liveClassController.js's module comment) —
// so admin management of classes belonging to OTHER teachers can only
// happen here, through the MFA'd admin session, backed by live_classes_
// insert/update/delete_*_admin_aal2's `OR public.is_admin_aal2()` branch
// (lib/db/drizzle/0015_new_domains_rls.sql).
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';

function toJson(row) {
  return {
    _id: row.id,
    teacher: row.teacher_id,
    student: row.student_id,
    title: row.title,
    startsAt: row.starts_at,
    durationMin: row.duration_min,
    meetingUrl: row.meeting_url,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// @route GET /api/v1/admin/live-classes
export const list = asyncHandler(async (req, res) => {
  const { page, limit } = {
    page: Math.max(1, parseInt(req.query.page) || 1),
    limit: Math.min(500, Math.max(1, parseInt(req.query.limit) || 50)),
  };
  const skip = (page - 1) * limit;

  const { rows, total } = await withUserContext(req.adminUser.id, async (client) => {
    const dataRes = await client.query(
      `SELECT * FROM live_classes ORDER BY starts_at DESC LIMIT $1 OFFSET $2`,
      [limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM live_classes`);
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  }, { aal: req.adminAal });

  res.json({ data: rows.map(toJson), total, page, pages: Math.ceil(total / limit) });
});

// @route POST /api/v1/admin/live-classes
export const create = asyncHandler(async (req, res) => {
  const { teacher, student, title, startsAt, durationMin, meetingUrl, notes } = req.body;
  if (!teacher || !student || !title || !startsAt) {
    return res.status(400).json({ message: 'teacher, student, title and startsAt are required' });
  }
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return res.status(400).json({ message: 'startsAt is not a valid date' });

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `INSERT INTO live_classes (teacher_id, student_id, title, starts_at, duration_min, meeting_url, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [teacher, student, title, when, durationMin || 30, meetingUrl || null, notes || null]
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
    adminId: req.adminUser.id, action: 'liveClass.create', resourceType: 'live_classes',
    resourceId: row.id, after: row,
  });

  res.status(201).json(toJson(row));
});

// @route PATCH /api/v1/admin/live-classes/:id
export const update = asyncHandler(async (req, res) => {
  const { title, startsAt, durationMin, meetingUrl, notes, status } = req.body;
  let when;
  if (startsAt != null) {
    when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) return res.status(400).json({ message: 'startsAt is not a valid date' });
  }

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `UPDATE live_classes SET
           title = COALESCE($2, title),
           starts_at = COALESCE($3, starts_at),
           duration_min = COALESCE($4, duration_min),
           meeting_url = COALESCE($5, meeting_url),
           notes = COALESCE($6, notes),
           status = COALESCE($7, status)
         WHERE id = $1
         RETURNING *`,
        [req.params.id, title ?? null, when ?? null, durationMin ?? null, meetingUrl ?? null, notes ?? null, status ?? null]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Class not found' });

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'liveClass.update', resourceType: 'live_classes',
    resourceId: row.id, after: row,
  });

  res.json(toJson(row));
});

// @route DELETE /api/v1/admin/live-classes/:id
export const remove = asyncHandler(async (req, res) => {
  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(`DELETE FROM live_classes WHERE id = $1 RETURNING id`, [req.params.id]);
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Class not found' });

  await auditAdminAction({
    adminId: req.adminUser.id, action: 'liveClass.delete', resourceType: 'live_classes',
    resourceId: req.params.id, severity: 'warning',
  });

  res.json({ message: 'Class deleted', id: req.params.id });
});
