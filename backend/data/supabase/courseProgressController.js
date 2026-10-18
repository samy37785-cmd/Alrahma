// DATA_BACKEND=supabase controller for course_progress. Mirrors
// controllers/progressController.js's routes/response shapes for
// getCourseProgress/toggleProgress/getUserProgress.
//
// GAP: awardXP()'s gamification side-effect (profiles.xp/level/streak/badges
// update + threshold/badge logic) is NOT reproduced here. profiles has no
// direct UPDATE grant to `authenticated` at all (see lib/db/drizzle/
// 0002_rls.sql — writes to profiles only ever go through a handful of
// narrowly-scoped SECURITY DEFINER RPCs, e.g. update_own_profile_name()) and
// no award-xp RPC exists in the migrations. toggleProgress's completion
// tracking itself (the actual CourseProgress domain) is fully implemented
// below; `gamification` is always returned as `null` rather than faked.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';
import { hasActiveSubscription } from './loadUser.js';

// @route GET /api/progress/user/:userId
// @access Admin
export const getUserProgress = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
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

// @route GET /api/progress/:courseId
// @access Private
export const getCourseProgress = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      'SELECT completed, last_activity FROM course_progress WHERE user_id = $1 AND course_id = $2',
      [req.user._id, req.params.courseId]
    );
    return r.rows[0];
  });
  res.json({ completed: row?.completed || [], lastActivity: row?.last_activity || null });
});

// @route PUT /api/progress/:courseId
// @access Private (active subscription required)
export const toggleProgress = asyncHandler(async (req, res) => {
  if (!hasActiveSubscription(req.user)) {
    res.status(403);
    throw new Error('An active subscription is required');
  }

  const { url, lessonId, done = true } = req.body;
  if (!url && !lessonId) {
    res.status(400);
    throw new Error('A resource url or lessonId is required');
  }

  const completed = await withUserContext(req.user._id, async (client) => {
    const courseRes = await client.query(
      'SELECT resources, modules FROM courses WHERE id = $1',
      [req.params.courseId]
    );
    const course = courseRes.rows[0];
    if (!course) {
      const err = new Error('Course not found');
      err.status = 404;
      throw err;
    }

    let key;
    if (lessonId) {
      const exists = (course.modules || []).some((m) =>
        (m.lessons || []).some((l) => String(l.id ?? l._id) === String(lessonId))
      );
      if (!exists) {
        const err = new Error('Unknown lesson for this course');
        err.status = 400;
        throw err;
      }
      key = `lesson:${lessonId}`;
    } else {
      const valid = (course.resources || []).some((r) => r.url === url);
      if (!valid) {
        const err = new Error('Unknown resource for this course');
        err.status = 400;
        throw err;
      }
      key = url;
    }

    const existingRes = await client.query(
      'SELECT completed FROM course_progress WHERE user_id = $1 AND course_id = $2',
      [req.user._id, req.params.courseId]
    );
    const set = new Set(existingRes.rows[0]?.completed || []);
    if (done) set.add(key);
    else set.delete(key);
    const nextCompleted = [...set];

    await client.query(
      `INSERT INTO course_progress (user_id, course_id, completed, last_activity)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, course_id)
       DO UPDATE SET completed = EXCLUDED.completed, last_activity = now()`,
      [req.user._id, req.params.courseId, JSON.stringify(nextCompleted)]
    );

    return nextCompleted;
  });

  res.json({ completed, gamification: null });
});
