// DATA_BACKEND=supabase controller for live_classes. Mirrors
// controllers/liveClassController.js's routes/response shapes, adapted for
// a real role-model difference (see module comment in data/supabase/
// loadUser.js): Postgres has no 'teacher'/'parent' account role — "being
// someone's teacher" is the profiles.teacher_id relationship instead (see
// is_teacher_of() in lib/db/drizzle/0015_new_domains_rls.sql). This
// controller therefore does not branch on req.user.role the way the Mongo
// version does; it queries "classes where I'm the teacher or the student"
// and lets RLS (live_classes_select_participant_or_admin, _insert_teacher_
// or_admin, etc.) be the real authorization boundary. Parent-child linking
// has no Postgres representation yet (see loadUser.js's own gap note), so
// the Mongo "parent sees children's classes" branch has no equivalent here.
//
// Also a real, unavoidable gap: creating/editing/deleting a class as an
// ADMIN requires AAL2 (live_classes_insert_teacher_or_admin's `OR public.
// is_admin_aal2()` branch) — but this route runs under the customer-facing
// `protect` middleware (JWT from /api/auth), which never carries an AAL2
// claim (only the separate /api/v1/admin/* auth flow can). An admin account
// can therefore only manage classes via a not-yet-built admin-router
// adapter, not through this endpoint — unlike the Mongo path, where a
// logged-in admin's own session (role:'admin') was sufficient. Left
// undone rather than papered over with a false AAL2 claim.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

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

// @route GET /api/classes
// @access Private
export const listClasses = asyncHandler(async (req, res) => {
  const conditions = ['(teacher_id = $1 OR student_id = $1 OR $2)'];
  const params = [req.user._id, req.user.role === 'admin'];
  if (req.query.upcoming) {
    conditions.push(`starts_at >= now() AND status != 'cancelled'`);
  }

  const rows = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `SELECT * FROM live_classes WHERE ${conditions.join(' AND ')} ORDER BY starts_at`,
      params
    );
    return r.rows;
  });
  res.json(rows.map(toJson));
});

// @route POST /api/classes
// @access Private (must be the target student's assigned teacher)
export const createClass = asyncHandler(async (req, res) => {
  const { student, title, startsAt, durationMin, meetingUrl, notes } = req.body;
  if (!student || !title || !startsAt) {
    res.status(400);
    throw new Error('student, title and startsAt are required');
  }
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) {
    res.status(400);
    throw new Error('startsAt is not a valid date');
  }

  try {
    const row = await withUserContext(req.user._id, async (client) => {
      const r = await client.query(
        `INSERT INTO live_classes (teacher_id, student_id, title, starts_at, duration_min, meeting_url, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.user._id, student, title, when, durationMin || 30, meetingUrl || null, notes || null]
      );
      return r.rows[0];
    });
    res.status(201).json(toJson(row));
  } catch (err) {
    if (err.code === '42501' || /permission denied|new row violates row-level security/i.test(err.message)) {
      res.status(404);
      throw new Error('Student not found among your students');
    }
    throw err;
  }
});

// @route PATCH /api/classes/:id
// @access Private (owning teacher)
export const updateClass = asyncHandler(async (req, res) => {
  const { title, startsAt, durationMin, meetingUrl, notes, status } = req.body;
  let when;
  if (startsAt != null) {
    when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) {
      res.status(400);
      throw new Error('startsAt is not a valid date');
    }
  }

  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `UPDATE live_classes SET
         title = COALESCE($3, title),
         starts_at = COALESCE($4, starts_at),
         duration_min = COALESCE($5, duration_min),
         meeting_url = COALESCE($6, meeting_url),
         notes = COALESCE($7, notes),
         status = COALESCE($8, status)
       WHERE id = $1 AND (teacher_id = $2 OR $9)
       RETURNING *`,
      [
        req.params.id, req.user._id, title ?? null, when ?? null,
        durationMin ?? null, meetingUrl ?? null, notes ?? null, status ?? null,
        req.user.role === 'admin',
      ]
    );
    return r.rows[0];
  });

  if (!row) {
    res.status(404);
    throw new Error('Class not found');
  }
  res.json(toJson(row));
});

// @route DELETE /api/classes/:id
// @access Private (owning teacher)
export const deleteClass = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      'DELETE FROM live_classes WHERE id = $1 AND (teacher_id = $2 OR $3) RETURNING id',
      [req.params.id, req.user._id, req.user.role === 'admin']
    );
    return r.rows[0];
  });
  if (!row) {
    res.status(404);
    throw new Error('Class not found');
  }
  res.json({ message: 'Class deleted', id: req.params.id });
});
