// DATA_BACKEND=supabase Quran-bookmark controller. Mirrors
// controllers/quranBookmarkController.js's routes/validation/response shapes.
// No AAL2 involved anywhere here: quran_bookmarks_owner_all (FOR ALL,
// authenticated, user_id = auth.uid()) gives the owner full CRUD, so every
// handler runs inside withUserContext(req.user._id, ...).
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

// Postgres has no updatedAt column for this table (only created_at), unlike
// the Mongo document's timestamps:true — that field is simply absent from
// the response here rather than faked.
function toJson(row) {
  return {
    _id: row.id,
    user: row.user_id,
    verseKey: row.verse_key,
    chapterId: row.chapter_id,
    verseNum: row.verse_num,
    note: row.note ?? '',
    color: row.color ?? '',
    createdAt: row.created_at,
  };
}

// @desc  Get the logged-in student's Quran bookmarks (optionally filtered by surah)
// @route GET /api/quran-bookmarks?chapterId=2
// @access Private
export const getMyBookmarks = asyncHandler(async (req, res) => {
  const chapterId = Number(req.query.chapterId);

  const rows = await withUserContext(req.user._id, async (client) => {
    const r = chapterId
      ? await client.query(
          `SELECT * FROM quran_bookmarks WHERE user_id = $1 AND chapter_id = $2 ORDER BY created_at DESC`,
          [req.user._id, chapterId]
        )
      : await client.query(
          `SELECT * FROM quran_bookmarks WHERE user_id = $1 ORDER BY created_at DESC`,
          [req.user._id]
        );
    return r.rows;
  });

  res.json(rows.map(toJson));
});

// @desc  Bookmark a verse (or update its note/highlight color if already bookmarked).
// @route POST /api/quran-bookmarks
// @body  { verseKey, chapterId, verseNum, note, color }
// @access Private
export const addBookmark = asyncHandler(async (req, res) => {
  const { verseKey, chapterId, verseNum, note = '', color = '' } = req.body;
  if (!verseKey || !chapterId || !verseNum) {
    res.status(400);
    throw new Error('verseKey, chapterId and verseNum are required');
  }

  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `INSERT INTO quran_bookmarks (user_id, verse_key, chapter_id, verse_num, note, color)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, verse_key)
       DO UPDATE SET chapter_id = EXCLUDED.chapter_id,
                     verse_num = EXCLUDED.verse_num,
                     note = EXCLUDED.note,
                     color = EXCLUDED.color
       RETURNING *`,
      [req.user._id, verseKey, chapterId, verseNum, note, color]
    );
    return r.rows[0];
  });

  res.status(201).json(toJson(row));
});

// @desc  Remove a bookmark.
// @route DELETE /api/quran-bookmarks/:verseKey
// @access Private
export const removeBookmark = asyncHandler(async (req, res) => {
  const row = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `DELETE FROM quran_bookmarks WHERE user_id = $1 AND verse_key = $2 RETURNING id`,
      [req.user._id, req.params.verseKey]
    );
    return r.rows[0];
  });

  if (!row) {
    res.status(404);
    throw new Error('Bookmark not found');
  }
  res.json({ message: 'Bookmark removed' });
});
