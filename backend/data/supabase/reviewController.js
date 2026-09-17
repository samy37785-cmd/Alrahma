// DATA_BACKEND=supabase controller for reviews. Mirrors
// controllers/reviewController.js's routes/response shapes for
// createReview/getTeacherReviews/getCourseReviews. moderateReview is an
// admin mutation gated by is_admin_aal2() + authorize('reviews:write'),
// wired up via data/supabase/admin/reviewsAdminController.js (mounted
// through data/supabase/admin/adminRoutes.js -> routes/v1/admin/index.js).
// Production-readiness audit follow-up (2026-09-17): corrected a stale
// comment that used to claim no admin-router adapter existed yet; it does.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { handleValidationErrors } from '../../utils/validationHelper.js';
import { parsePagination } from '../../utils/pagination.js';
import { withUserContext, withAnonContext } from './client.js';

export { reviewValidation } from '../../controllers/reviewController.js';

// Public listings (getTeacherReviews/getCourseReviews) query the
// reviews_public VIEW (lib/db/drizzle/0016_parent_linking_and_review_safe_
// view.sql), not the `reviews` table directly — `anon` has no GRANT on
// `profiles` at all (a hard permission error, not just an RLS filter), so
// a real reviewer name can only reach an anonymous visitor through that
// view's own (view-owner-privilege) exposure of exactly (id, name), never
// email/phone/PII, never a blanket profiles GRANT. createReview (which
// runs authenticated, under the caller's own identity) still returns the
// real name directly from req.user for its own immediate response.
function toJson(row) {
  return {
    _id: row.id,
    student: { _id: row.student_id, name: row.student_name ?? null },
    teacher: row.teacher_id,
    course: row.course_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    helpful: row.helpful,
    createdAt: row.created_at,
  };
}

// @route POST /api/reviews
// @access Private
export const createReview = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { rating, title, body, teacherId, courseId } = req.body;
  // XOR: exactly one of teacherId/courseId, never both, never neither — same
  // guard as the Mongo controller (controllers/reviewController.js). Without
  // this, a request setting BOTH could smuggle an owned relationship (e.g. a
  // real course_progress row) alongside an unowned one past whichever
  // ownership branch happened to run.
  if (teacherId && courseId) {
    return res.status(400).json({ message: 'Provide exactly one of teacherId or courseId, not both' });
  }
  if (!teacherId && !courseId) {
    return res.status(400).json({ message: 'Provide either teacherId or courseId' });
  }

  // Auth hardening security batch: same relationship check as the Mongo
  // controller (controllers/reviewController.js) — previously any
  // authenticated student could review any course/teacher id. req.user.teacher
  // (loaded by data/supabase/loadUser.js's loadUserById from profiles.teacher_id)
  // is checked directly, no extra query needed; course_progress is the only
  // relational signal linking a student to a specific course (Enrollment has
  // no course reference under the booking-first schema, on either backend).
  if (teacherId && String(req.user.teacher ?? '') !== String(teacherId)) {
    return res.status(403).json({ message: 'You can only review your assigned teacher' });
  }

  try {
    const row = await withUserContext(req.user._id, async (client) => {
      if (courseId) {
        const cp = await client.query('SELECT 1 FROM course_progress WHERE user_id = $1 AND course_id = $2', [req.user._id, courseId]);
        if (!cp.rows[0]) {
          const err = new Error('You can only review a course you have engaged with');
          err.status = 403;
          throw err;
        }
      }

      const existing = await client.query(
        teacherId
          ? 'SELECT id FROM reviews WHERE student_id = $1 AND teacher_id = $2'
          : 'SELECT id FROM reviews WHERE student_id = $1 AND course_id = $2',
        [req.user._id, teacherId ?? courseId]
      );
      if (existing.rows[0]) {
        const err = new Error('You have already submitted a review');
        err.status = 409;
        throw err;
      }

      const r = await client.query(
        `INSERT INTO reviews (student_id, teacher_id, course_id, rating, title, body)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user._id, teacherId ?? null, teacherId ? null : courseId, rating, title ?? null, body]
      );
      return r.rows[0];
    });
    res.status(201).json({ review: { ...toJson(row), student: { _id: req.user._id, name: req.user.name } } });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ message: err.message });
    if (err.status === 403) return res.status(403).json({ message: err.message });
    throw err;
  }
});

// @route GET /api/reviews/teacher/:teacherId
// @access Public
export const getTeacherReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 20 });

  const { rows, total, stats } = await withAnonContext(async (client) => {
    // Sequential, not Promise.all — a single pg client can only run one
    // query at a time; firing several concurrently on it is deprecated,
    // undefined behavior, not real parallelism (found via the Al-Rahma
    // Final Corrections Part A rehearsal, same bug class fixed in
    // parentController.js).
    const listRes = await client.query(
      `SELECT * FROM reviews_public
        WHERE teacher_id = $1
        ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.teacherId, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM reviews_public WHERE teacher_id = $1`, [
      req.params.teacherId,
    ]);
    const statsRes = await client.query(
      `SELECT avg(rating)::float AS avg, count(*)::int AS count FROM reviews_public
        WHERE teacher_id = $1`,
      [req.params.teacherId]
    );
    return { rows: listRes.rows, total: countRes.rows[0].n, stats: statsRes.rows[0] };
  });

  res.json({
    reviews: rows.map(toJson),
    total,
    page,
    pages: Math.ceil(total / limit),
    avg: stats.avg ?? 0,
    count: stats.count ?? 0,
  });
});

// @route GET /api/reviews/course/:courseId
// @access Public
export const getCourseReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 20 });

  const { rows, total } = await withAnonContext(async (client) => {
    const listRes = await client.query(
      `SELECT * FROM reviews_public
        WHERE course_id = $1
        ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.courseId, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM reviews_public WHERE course_id = $1`, [
      req.params.courseId,
    ]);
    return { rows: listRes.rows, total: countRes.rows[0].n };
  });

  res.json({ reviews: rows.map(toJson), total, page, pages: Math.ceil(total / limit) });
});
