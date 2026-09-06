// DATA_BACKEND=supabase controller for wishlists. Mirrors
// controllers/wishlistController.js's routes/response shapes.
//
// Schema difference: Mongo stores one Wishlist document per user with an
// embedded `courses` array; Postgres normalizes this into one row per
// (user_id, course_id) (lib/db/drizzle/0012_new_domains_baseline.sql). The
// response shape below reconstructs the same `{ courses: [{ course, addedAt
// }] }` array the Mongo controller returns, so callers can't tell the
// difference.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

function toEntry(row) {
  return {
    course: {
      _id: row.course_id,
      title: row.title,
      description: row.description,
      level: row.level,
    },
    addedAt: row.added_at,
  };
}

const SELECT = `
  SELECT w.course_id, w.added_at, c.title, c.description, c.level
    FROM wishlists w
    JOIN courses c ON c.id = w.course_id
   WHERE w.user_id = $1
   ORDER BY w.added_at DESC`;

// @route GET /api/wishlist
// @access Private
export const getWishlist = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(SELECT, [req.user._id]);
    return r.rows;
  });
  res.json({ courses: rows.map(toEntry) });
});

// @route POST /api/wishlist
// @access Private
export const addToWishlist = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ message: 'courseId is required' });

  const rows = await withUserContext(req.user._id, async (client) => {
    await client.query(
      `INSERT INTO wishlists (user_id, course_id) VALUES ($1, $2)
       ON CONFLICT (user_id, course_id) DO NOTHING`,
      [req.user._id, courseId]
    );
    const r = await client.query(SELECT, [req.user._id]);
    return r.rows;
  });
  res.json({ courses: rows.map(toEntry) });
});

// @route DELETE /api/wishlist/:courseId
// @access Private
export const removeFromWishlist = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
    await client.query('DELETE FROM wishlists WHERE user_id = $1 AND course_id = $2', [
      req.user._id,
      req.params.courseId,
    ]);
    const r = await client.query(SELECT, [req.user._id]);
    return r.rows;
  });
  res.json({ courses: rows.map(toEntry) });
});

// @route DELETE /api/wishlist/clear
// @access Private
export const clearWishlist = asyncHandler(async (req, res) => {
  await withUserContext(req.user._id, (client) =>
    client.query('DELETE FROM wishlists WHERE user_id = $1', [req.user._id])
  );
  res.json({ message: 'Wishlist cleared' });
});
