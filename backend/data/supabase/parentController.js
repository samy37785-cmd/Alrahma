// DATA_BACKEND=supabase controller for the parent-linking domain. Backed by
// lib/db/drizzle/0016_parent_linking_and_review_safe_view.sql's
// parent_student_links table + link_child_by_code()/ensure_parent_link_code()
// RPCs + the parent-visibility RLS policies added there
// (profiles_select_own_children, student_records_select_parent,
// hifz_progress_select_parent, course_progress_select_parent). Mirrors
// controllers/parentController.js's routes/response shapes.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

async function courseReport(client, studentId) {
  const r = await client.query(
    `SELECT cp.completed, cp.last_activity, c.id AS course_id, c.title, c.icon, c.resources
       FROM course_progress cp
       JOIN courses c ON c.id = cp.course_id
      WHERE cp.user_id = $1
      ORDER BY cp.last_activity DESC`,
    [studentId]
  );
  return r.rows.map((row) => {
    const total = (row.resources || []).length;
    const done = (row.completed || []).length;
    return {
      courseId: row.course_id,
      title: row.title,
      icon: row.icon,
      total,
      done,
      percent: total ? Math.round((done / total) * 100) : 0,
      lastActivity: row.last_activity,
    };
  });
}

// @route POST /api/parent/link
// @access Private
export const linkChild = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ message: 'Please enter the link code' });

  try {
    const child = await withUserContext(req.user._id, async (client) => {
      const r = await client.query(`SELECT * FROM link_child_by_code($1)`, [code]);
      return r.rows[0];
    });
    res.status(201).json({ _id: child.id, name: child.name, email: child.email });
  } catch (err) {
    if (err.message?.includes('student_not_found')) {
      return res.status(404).json({ message: 'No student found for that code' });
    }
    if (err.message?.includes('already_linked')) {
      return res.status(409).json({ message: 'This student is already linked to your account' });
    }
    if (err.message?.includes('cannot_link_self')) {
      return res.status(400).json({ message: 'You cannot link to your own account' });
    }
    throw err;
  }
});

// @route GET /api/parent/children
// @access Private
export const getChildren = asyncHandler(async (req, res) => {
  const summaries = await withUserContext(req.user._id, async (client) => {
    const childrenRes = await client.query(
      `SELECT p.id, p.name, p.email
         FROM parent_student_links psl
         JOIN profiles p ON p.id = psl.student_id
        WHERE psl.parent_id = $1`,
      [req.user._id]
    );

    // Sequential, not Promise.all: these all share one pg client (inside a
    // single withUserContext transaction) — a pg Client/PoolClient can only
    // run one query at a time, so firing several concurrently on the same
    // client is undefined/deprecated behavior, not real parallelism.
    const summaries = [];
    for (const c of childrenRes.rows) {
      const recordCountRes = await client.query(`SELECT count(*)::int AS n FROM student_records WHERE student_id = $1`, [c.id]);
      const hifzRes = await client.query(`SELECT memorized_verses FROM hifz_progress WHERE user_id = $1`, [c.id]);
      const memorized = hifzRes.rows.reduce((sum, h) => sum + (h.memorized_verses?.length || 0), 0);
      summaries.push({
        _id: c.id,
        name: c.name,
        email: c.email,
        recordCount: recordCountRes.rows[0].n,
        memorizedVerses: memorized,
      });
    }
    return summaries;
  });

  res.json(summaries);
});

// @route GET /api/parent/children/:id
// @access Private
export const getChildDetail = asyncHandler(async (req, res) => {
  const result = await withUserContext(req.user._id, async (client) => {
    const childRes = await client.query(
      `SELECT p.id, p.name, p.email
         FROM parent_student_links psl
         JOIN profiles p ON p.id = psl.student_id
        WHERE psl.parent_id = $1 AND psl.student_id = $2`,
      [req.user._id, req.params.id]
    );
    const child = childRes.rows[0];
    if (!child) return null;

    // Sequential, not Promise.all — see getChildren's comment above on why
    // concurrent queries against one shared pg client are unsafe.
    const recordsRes = await client.query(
      `SELECT sr.*, c.title AS course_title, c.icon AS course_icon, t.name AS teacher_name
         FROM student_records sr
         LEFT JOIN courses c ON c.id = sr.course_id
         LEFT JOIN profiles t ON t.id = sr.teacher_id
        WHERE sr.student_id = $1
        ORDER BY sr.record_date DESC`,
      [child.id]
    );
    const hifzRes = await client.query(`SELECT * FROM hifz_progress WHERE user_id = $1 ORDER BY chapter_id`, [child.id]);
    const courses = await courseReport(client, child.id);

    return { student: child, records: recordsRes.rows, hifz: hifzRes.rows, courses };
  });

  if (!result) return res.status(404).json({ message: 'Child not linked to your account' });
  res.json(result);
});

// @route DELETE /api/parent/children/:id
// @access Private
export const unlinkChild = asyncHandler(async (req, res) => {
  const deleted = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `DELETE FROM parent_student_links WHERE parent_id = $1 AND student_id = $2 RETURNING student_id`,
      [req.user._id, req.params.id]
    );
    return r.rows[0];
  });
  if (!deleted) return res.status(404).json({ message: 'Child not linked to your account' });
  res.json({ message: 'Child unlinked' });
});
