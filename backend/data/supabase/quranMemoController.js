// DATA_BACKEND=supabase Quran memorization-stats controller. Mirrors
// controllers/quranMemoController.js's routes/validation/response shapes as
// closely as the quran_memorization_stats schema allows.
//
// Schema gaps vs. the Mongo document (see lib/db/drizzle/
// 0000_init_20_table_baseline.sql — user_id PK, goal integer,
// total_recordings integer, total_practice_time integer, streak integer;
// no other columns at all):
//   1. dailyGoal.type has no column and cannot be recovered on read (null in
//      GET responses) — same gap as quran_reading_progress.
//   2. There is no lastPracticeDate/history column anywhere on this table
//      (unlike quran_reading_progress, which at least has `history` jsonb
//      to derive a last-activity date from). That means there is NO
//      persisted signal here to evaluate utils/streak.js's calendar-day
//      gap/reset logic faithfully — this is a genuine, undocumented-until-
//      now product gap, not an implementation shortcut. As an explicit,
//      documented approximation, each POST /log call increments `streak`
//      by 1 unconditionally (no same-day dedup, no gap-triggered reset to
//      1). See docs/option-a-mongo-supabase-parity-map.md.
// No AAL2 involved: quran_memorization_stats_owner_all (FOR ALL,
// authenticated, user_id = auth.uid()) gives the owner full CRUD via
// withUserContext.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { withUserContext } from './client.js';

function toJson(row, userId) {
  return {
    user: row?.user_id || userId,
    dailyGoal: { type: null, target: row?.goal ?? 5 },
    stats: {
      totalRecordings: row?.total_recordings || 0,
      totalPracticeTime: row?.total_practice_time || 0,
      // No persisted column — see module comment.
      lastPracticeDate: null,
    },
    // No persisted "longest"/lastReadDate columns — see module comment.
    streak: { current: row?.streak || 0, longest: row?.streak || 0, lastReadDate: null },
  };
}

// @desc  Get the logged-in student's memorization/recording-studio goal + stats.
// @route GET /api/quran-memo
// @access Private
export const getMyMemoStats = asyncHandler(async (req, res) => {
  const doc = await withUserContext(req.user._id, async (client) => {
    const existing = await client.query(
      'SELECT * FROM quran_memorization_stats WHERE user_id = $1',
      [req.user._id]
    );
    if (existing.rows[0]) return existing.rows[0];

    const inserted = await client.query(
      `INSERT INTO quran_memorization_stats (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [req.user._id]
    );
    if (inserted.rows[0]) return inserted.rows[0];

    // Lost a create race to a concurrent request — re-read.
    const reread = await client.query(
      'SELECT * FROM quran_memorization_stats WHERE user_id = $1',
      [req.user._id]
    );
    return reread.rows[0];
  });

  res.json(toJson(doc, req.user._id));
});

// @desc  Update the student's daily memorization practice goal.
// @route PUT /api/quran-memo/goal
// @body  { type, target }
// @access Private
export const updateMemoGoal = asyncHandler(async (req, res) => {
  const { type, target } = req.body;
  if (!['verses', 'minutes'].includes(type) || !(target > 0)) {
    res.status(400);
    throw new Error('Invalid goal: type must be verses/minutes and target must be > 0');
  }

  const doc = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `INSERT INTO quran_memorization_stats (user_id, goal)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET goal = EXCLUDED.goal
       RETURNING *`,
      [req.user._id, target]
    );
    return r.rows[0];
  });

  const json = toJson(doc, req.user._id);
  // `type` isn't persisted (no column — see module comment): echoed back
  // here from the request itself, same convention as quranProgressController.
  json.dailyGoal.type = type;
  res.json(json);
});

// @desc  Log a completed practice/recording session — updates stats + streak.
// @route POST /api/quran-memo/log
// @body  { practiceSeconds, recordingsCount }
// @access Private
export const logPractice = asyncHandler(async (req, res) => {
  const practiceSeconds = Number(req.body.practiceSeconds) || 0;
  const recordingsCount = Number(req.body.recordingsCount) || 0;

  const doc = await withUserContext(req.user._id, async (client) => {
    // See module comment: streak increments unconditionally on each log call
    // — there is no persisted last-practice-date to evaluate a real
    // calendar-day gap/reset against on this table.
    const r = await client.query(
      `INSERT INTO quran_memorization_stats (user_id, total_recordings, total_practice_time, streak)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id) DO UPDATE
         SET total_recordings = quran_memorization_stats.total_recordings + EXCLUDED.total_recordings,
             total_practice_time = quran_memorization_stats.total_practice_time + EXCLUDED.total_practice_time,
             streak = quran_memorization_stats.streak + 1
       RETURNING *`,
      [req.user._id, recordingsCount, practiceSeconds]
    );
    return r.rows[0];
  });

  res.json(toJson(doc, req.user._id));
});
