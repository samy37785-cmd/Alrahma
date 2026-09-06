// DATA_BACKEND=supabase controller for courses. Mirrors
// controllers/courseController.js's routes/response shapes for the public/
// student-facing endpoints. Admin mutations (create/update/delete) are out
// of scope here — see routes/v1/admin/coursesRoutes.js — a documented gap
// under DATA_BACKEND=supabase for now (delete_course_cascade() and the
// courses:write-gated RLS policies exist in the schema; no admin adapter
// controller/routes wire them up yet).
//
// courses.modules/resources are stored as single jsonb columns (see
// lib/db/drizzle/0012_new_domains_baseline.sql's design-choice comment) —
// lockCourseContent() below works on that jsonb value directly, mirroring
// the Mongo controller's own lockCourseContent() field-by-field.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withAnonContext } from './client.js';
import { hasActiveSubscription } from './loadUser.js';

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

// Same behavior as courseController.js's exported lockCourseContent(): strips
// paid material for a course object that has already been shaped by toJson().
export function lockCourseContent(course) {
  return {
    ...course,
    resources: [],
    modules: (course.modules || []).map((m) => ({
      ...m,
      lessons: (m.lessons || []).map((l) => ({
        title: l.title, type: l.type, duration: l.duration,
        url: '', content: '', resources: [],
      })),
    })),
    locked: true,
  };
}

// @route  GET /api/courses
// @access Public
export const getCourses = asyncHandler(async (req, res) => {
  const rows = await withAnonContext(async (client) => {
    const r = await client.query(
      `SELECT id, title, description, icon, level, price_minor, tags, published, created_at, updated_at
         FROM courses
        WHERE published = true
        ORDER BY created_at DESC`
    );
    return r.rows;
  });

  // Mirrors the Mongo query's .select('-resources -modules.lessons'): the
  // public catalogue never returns resources or per-module lesson lists.
  const catalogue = rows.map((row) => ({
    ...toJson({ ...row, resources: [], modules: [] }),
  }));

  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json(catalogue);
});

// @route  GET /api/courses/:id
// @access Private
export const getCourse = asyncHandler(async (req, res) => {
  const row = await withAnonContext(async (client) => {
    const r = await client.query(
      `SELECT * FROM courses WHERE id = $1 AND published = true`,
      [req.params.id]
    );
    return r.rows[0];
  });
  if (!row) {
    res.status(404);
    throw new Error('Course not found');
  }

  const unlocked = hasActiveSubscription(req.user);
  const payload = unlocked ? toJson(row) : lockCourseContent(toJson(row));
  res.json(payload);
});
