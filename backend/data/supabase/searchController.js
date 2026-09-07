// DATA_BACKEND=supabase controller for /api/search — a fully public,
// unauthenticated route (no `protect` at all) that Stage 2F never gave a
// Supabase adapter (found via a full app.js route-mount audit, not the "28
// domains" list). Mirrors controllers/searchController.js's routes/response
// shapes. Teacher search/lookup goes through the teachers_public VIEW
// (lib/db/drizzle/0019_teachers_public_view.sql) — profiles has no anon/
// public SELECT policy at all, so a public teacher directory needs the same
// narrow, PII-free VIEW pattern reviews_public already established.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { withAnonContext } from './client.js';

// @route GET /api/search?q=...
export const globalSearch = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ message: 'Search query must be at least 2 characters' });
  }
  const like = `%${q}%`;

  const { courses, posts, teachers } = await withAnonContext(async (client) => {
    // Sequential, not Promise.all — a single pg client can only run one
    // query at a time; firing several concurrently on it is deprecated,
    // undefined behavior, not real parallelism (same bug class found and
    // fixed elsewhere in backend/data/supabase during the Al-Rahma Final
    // Corrections Part A rehearsal).
    const coursesRes = await client.query(
      `SELECT title, description, level FROM courses
        WHERE published = true AND (title ILIKE $1 OR description ILIKE $1) LIMIT 5`,
      [like]
    );
    const postsRes = await client.query(
      `SELECT slug, title, excerpt, category FROM blogs
        WHERE published = true AND (title ILIKE $1 OR excerpt ILIKE $1 OR tags ? $2) LIMIT 5`,
      [like, q]
    );
    const teachersRes = await client.query(
      `SELECT name, specialization FROM teachers_public
        WHERE name ILIKE $1 OR specialization ILIKE $1 LIMIT 5`,
      [like]
    );
    return { courses: coursesRes.rows, posts: postsRes.rows, teachers: teachersRes.rows };
  });

  res.json({ q, results: { courses, posts, teachers } });
});

// @route GET /api/search/courses
export const searchCourses = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  const level = req.query.level;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 20 });

  const conditions = ['published = true'];
  const params = [];
  if (q) {
    params.push(`%${q}%`, q);
    conditions.push(`(title ILIKE $${params.length - 1} OR description ILIKE $${params.length - 1} OR tags ? $${params.length})`);
  }
  if (level) {
    params.push(level);
    conditions.push(`level = $${params.length}::course_level`);
  }
  const where = conditions.join(' AND ');

  const { rows, total } = await withAnonContext(async (client) => {
    const dataRes = await client.query(
      `SELECT id, title, description, level FROM courses WHERE ${where} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM courses WHERE ${where}`, params);
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  });

  res.json({
    courses: rows.map((r) => ({ _id: r.id, title: r.title, description: r.description, level: r.level })),
    total, page, pages: Math.ceil(total / limit),
  });
});

// @route GET /api/search/teachers
export const searchTeachers = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  const { subject, gender, language } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 20 });

  const conditions = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(name ILIKE $${params.length} OR specialization ILIKE $${params.length} OR bio ILIKE $${params.length})`);
  }
  if (subject)  { params.push(subject);  conditions.push(`subjects ? $${params.length}`); }
  if (gender)   { params.push(gender);   conditions.push(`gender = $${params.length}`); }
  if (language) { params.push(language); conditions.push(`languages ? $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows, total } = await withAnonContext(async (client) => {
    // KNOWN GAP vs. Mongo: `rating` is not a stored column on the teacher
    // directory here (profiles has none — see docs on the reviews_public
    // design) and is not computed live in this listing either, to keep this
    // public, unauthenticated, potentially-large query cheap (no per-row
    // aggregate join). A per-teacher rating IS available live via
    // GET /api/reviews/teacher/:teacherId's own avg computation.
    const dataRes = await client.query(
      `SELECT id, name, specialization, gender, languages FROM teachers_public ${where} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip]
    );
    const countRes = await client.query(`SELECT count(*)::int AS n FROM teachers_public ${where}`, params);
    return { rows: dataRes.rows, total: countRes.rows[0].n };
  });

  res.json({
    teachers: rows.map((r) => ({ _id: r.id, name: r.name, specialization: r.specialization, gender: r.gender, languages: r.languages })),
    total, page, pages: Math.ceil(total / limit),
  });
});
