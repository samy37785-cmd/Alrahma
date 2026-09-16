// DATA_BACKEND=supabase admin adapter for the two admin-only lookups that
// used to live at GET /api/hifz/user/:userId and GET /api/progress/user/:userId
// (data/supabase/routes/hifzRoutes.js, progressRoutes.js), gated by the
// legacy protect+adminOnly stack — reachable with nothing but a regular
// customer session whose role claim said 'admin'. Mirrors the Mongo-mode
// fix already applied at routes/v1/admin/usersRoutes.js's own /:id/hifz and
// /:id/progress sub-routes.
//
// The existing customer-facing getUserHifz/getUserProgress
// (data/supabase/hifzController.js, courseProgressController.js) call
// withUserContext(req.user._id, ...) — req.user is never set on this admin
// router (only req.adminUser/req.adminId are, see middleware/adminAuth.js),
// so those functions cannot be reused as-is here; withUserContext(actorId,
// ...) sets the Postgres session's auth.uid() context that RLS evaluates
// (hifz_progress_select_admin / course_progress_select_admin both check
// public.is_admin() — see lib/db/drizzle/0015_new_domains_rls.sql), so the
// actor passed in must be the acting admin's own id, not the target user's.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { withUserContext } from '../client.js';

function toHifzJson(row) {
  return {
    _id: `${row.user_id}:${row.chapter_id}`,
    user: row.user_id,
    chapterId: row.chapter_id,
    chapterName: row.chapter_name,
    totalVerses: row.total_verses,
    memorizedVerses: row.memorized_verses,
    lastRevised: row.last_revised,
  };
}

// @route GET /api/v1/admin/users/:id/hifz
// @access Admin (users:read)
export const getUserHifz = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query(
      'SELECT * FROM hifz_progress WHERE user_id = $1 ORDER BY chapter_id',
      [req.params.userId]
    );
    return r.rows;
  });
  res.json(rows.map(toHifzJson));
});

// @route GET /api/v1/admin/users/:id/progress
// @access Admin (users:read)
export const getUserProgress = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.adminUser.id, async (client) => {
    const r = await client.query(
      `SELECT cp.completed, cp.last_activity, c.id AS course_id, c.title, c.icon, c.resources, c.modules
         FROM course_progress cp
         JOIN courses c ON c.id = cp.course_id
        WHERE cp.user_id = $1
        ORDER BY cp.last_activity DESC`,
      [req.params.userId]
    );
    return r.rows;
  });

  const report = rows.map((r) => {
    const lessonCount = (r.modules || []).reduce((n, m) => n + (m.lessons?.length || 0), 0);
    const total = (r.resources?.length || 0) + lessonCount;
    const done = (r.completed || []).length;
    return {
      courseId: r.course_id,
      title: r.title,
      icon: r.icon,
      total,
      done,
      percent: total ? Math.round((done / total) * 100) : 0,
      lastActivity: r.last_activity,
    };
  });
  res.json(report);
});
