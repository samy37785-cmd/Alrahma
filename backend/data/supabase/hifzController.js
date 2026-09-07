// DATA_BACKEND=supabase controller for hifz_progress. Mirrors
// controllers/hifzController.js's routes/response shapes exactly.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

function toJson(row) {
  return {
    _id: `${row.user_id}:${row.chapter_id}`, // composite PK, no surrogate id column
    user: row.user_id,
    chapterId: row.chapter_id,
    chapterName: row.chapter_name,
    totalVerses: row.total_verses,
    memorizedVerses: row.memorized_verses,
    lastRevised: row.last_revised,
  };
}

// @route GET /api/hifz
// @access Private
export const getMyHifz = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      'SELECT * FROM hifz_progress WHERE user_id = $1 ORDER BY chapter_id',
      [req.user._id]
    );
    return r.rows;
  });

  const progress = rows.map(toJson);
  const totalMemorized = rows.reduce((sum, p) => sum + (p.memorized_verses?.length || 0), 0);
  const surahsCompleted = rows.filter(
    (p) => p.total_verses > 0 && (p.memorized_verses?.length || 0) >= p.total_verses
  ).length;
  res.json({ progress, totalMemorized, surahsCompleted });
});

// @route PUT /api/hifz/:chapterId
// @access Private
export const markMemorized = asyncHandler(async (req, res) => {
  const chapterId = Number(req.params.chapterId);
  if (!chapterId || chapterId < 1 || chapterId > 114) {
    res.status(400);
    throw new Error('Invalid surah number');
  }
  const { chapterName = '', totalVerses = 0, from, to, memorized = true } = req.body;
  const start = Number(from);
  const end = Number(to);
  if (!start || !end || start > end) {
    res.status(400);
    throw new Error('Invalid verse range');
  }

  const range = [];
  for (let v = start; v <= end; v++) range.push(v);

  const row = await withUserContext(req.user._id, async (client) => {
    const existing = await client.query(
      'SELECT * FROM hifz_progress WHERE user_id = $1 AND chapter_id = $2',
      [req.user._id, chapterId]
    );
    const current = new Set(existing.rows[0]?.memorized_verses || []);
    if (memorized) range.forEach((v) => current.add(v));
    else range.forEach((v) => current.delete(v));
    const nextVerses = [...current].sort((a, b) => a - b);

    const r = await client.query(
      `INSERT INTO hifz_progress (user_id, chapter_id, chapter_name, total_verses, memorized_verses, last_revised)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, chapter_id)
       DO UPDATE SET
         chapter_name = COALESCE(NULLIF(EXCLUDED.chapter_name, ''), hifz_progress.chapter_name),
         total_verses = CASE WHEN EXCLUDED.total_verses > 0 THEN EXCLUDED.total_verses ELSE hifz_progress.total_verses END,
         memorized_verses = EXCLUDED.memorized_verses,
         last_revised = now()
       RETURNING *`,
      [req.user._id, chapterId, chapterName, totalVerses, JSON.stringify(nextVerses)]
    );
    return r.rows[0];
  });

  res.json(toJson(row));
});

// @route GET /api/hifz/user/:userId
// @access Admin
export const getUserHifz = asyncHandler(async (req, res) => {
  const rows = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      'SELECT * FROM hifz_progress WHERE user_id = $1 ORDER BY chapter_id',
      [req.params.userId]
    );
    return r.rows;
  });
  res.json(rows.map(toJson));
});
