// DATA_BACKEND=supabase Quran reading-progress controller. Mirrors
// controllers/quranProgressController.js's routes/validation/response
// shapes as closely as the quran_reading_progress schema allows.
//
// Schema shape differs from the Mongo document in two documented ways (see
// lib/db/drizzle/0000_init_20_table_baseline.sql):
//   1. `resume jsonb` is one blob for the whole lastPosition sub-document —
//      packed/unpacked here rather than split across columns.
//   2. `goal integer` and `streak integer` are bare scalars, not the Mongo
//      sub-documents { type, target } / { current, longest, lastReadDate }.
//      dailyGoal.type has no column at all and cannot be recovered on read
//      (reported as null in GET responses — see toJson below). streak only
//      persists a single "current" count; "longest" isn't tracked across
//      requests and is reported equal to "current". lastReadDate is derived
//      from the most recent entry in `history` rather than stored directly.
// No AAL2 involved: quran_reading_progress_owner_all (FOR ALL, authenticated,
// user_id = auth.uid()) gives the owner full CRUD via withUserContext.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { applyStreak, todayStr } from '../../utils/streak.js';
import { withUserContext } from './client.js';

const HISTORY_LIMIT = 90;

function toJson(row, userId) {
  const resume = row?.resume || {};
  const history = Array.isArray(row?.history) ? row.history : [];
  const lastReadDate = history.length ? [...history].map((h) => h.date).sort().slice(-1)[0] : '';

  return {
    user: row?.user_id || userId,
    lastPosition: {
      navMode: resume.navMode || 'surah',
      chapterId: resume.chapterId,
      pageNum: resume.pageNum,
      juzNum: resume.juzNum,
      hizbNum: resume.hizbNum,
      verseKey: resume.verseKey,
      verseTimestamp: resume.verseTimestamp || 0,
    },
    dailyGoal: { type: null, target: row?.goal ?? 10 },
    streak: { current: row?.streak || 0, longest: row?.streak || 0, lastReadDate },
    history,
  };
}

// @desc  Get the logged-in student's reading progress (last position, goal, streak, history).
// @route GET /api/quran-progress
// @access Private
export const getMyProgress = asyncHandler(async (req, res) => {
  const doc = await withUserContext(req.user._id, async (client) => {
    const existing = await client.query(
      'SELECT * FROM quran_reading_progress WHERE user_id = $1',
      [req.user._id]
    );
    if (existing.rows[0]) return existing.rows[0];

    const inserted = await client.query(
      `INSERT INTO quran_reading_progress (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [req.user._id]
    );
    if (inserted.rows[0]) return inserted.rows[0];

    // Lost a create race to a concurrent request — re-read.
    const reread = await client.query(
      'SELECT * FROM quran_reading_progress WHERE user_id = $1',
      [req.user._id]
    );
    return reread.rows[0];
  });

  res.json(toJson(doc, req.user._id));
});

// @desc  Persist the last-read position (for "continue reading" / audio resume).
// @route PUT /api/quran-progress/position
// @body  { navMode, chapterId, pageNum, juzNum, hizbNum, verseKey, verseTimestamp }
// @access Private
export const updatePosition = asyncHandler(async (req, res) => {
  const { navMode, chapterId, pageNum, juzNum, hizbNum, verseKey, verseTimestamp } = req.body;

  const doc = await withUserContext(req.user._id, async (client) => {
    const existing = await client.query(
      'SELECT resume FROM quran_reading_progress WHERE user_id = $1',
      [req.user._id]
    );
    const prevResume = existing.rows[0]?.resume || {};
    const resume = {
      navMode: navMode || prevResume.navMode || 'surah',
      chapterId, pageNum, juzNum, hizbNum, verseKey,
      verseTimestamp: verseTimestamp || 0,
    };

    const r = await client.query(
      `INSERT INTO quran_reading_progress (user_id, resume)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET resume = EXCLUDED.resume
       RETURNING *`,
      [req.user._id, JSON.stringify(resume)]
    );
    return r.rows[0];
  });

  res.json(toJson(doc, req.user._id));
});

// @desc  Update the student's daily reading goal.
// @route PUT /api/quran-progress/goal
// @body  { type, target }
// @access Private
export const updateGoal = asyncHandler(async (req, res) => {
  const { type, target } = req.body;
  if (!['verses', 'minutes', 'pages'].includes(type) || !(target > 0)) {
    res.status(400);
    throw new Error('Invalid goal: type must be verses/minutes/pages and target must be > 0');
  }

  const doc = await withUserContext(req.user._id, async (client) => {
    const r = await client.query(
      `INSERT INTO quran_reading_progress (user_id, goal)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET goal = EXCLUDED.goal
       RETURNING *`,
      [req.user._id, target]
    );
    return r.rows[0];
  });

  const json = toJson(doc, req.user._id);
  // `type` isn't persisted (no column — see module comment): echoed back here
  // from the request itself so this response still reflects what the caller
  // just asked for, even though a later GET will report dailyGoal.type: null.
  json.dailyGoal.type = type;
  res.json(json);
});

// @desc  Log reading activity for today — updates streak + history calendar.
// @route POST /api/quran-progress/log
// @body  { versesRead, minutesRead }
// @access Private
export const logReading = asyncHandler(async (req, res) => {
  const versesRead = Number(req.body.versesRead) || 0;
  const minutesRead = Number(req.body.minutesRead) || 0;
  const today = todayStr();

  const doc = await withUserContext(req.user._id, async (client) => {
    const existing = await client.query(
      'SELECT streak, history FROM quran_reading_progress WHERE user_id = $1',
      [req.user._id]
    );
    const prevStreak = existing.rows[0]?.streak || 0;
    const history = Array.isArray(existing.rows[0]?.history) ? [...existing.rows[0].history] : [];

    const idx = history.findIndex((h) => h.date === today);
    if (idx >= 0) {
      history[idx] = {
        ...history[idx],
        versesRead: (history[idx].versesRead || 0) + versesRead,
        minutesRead: (history[idx].minutesRead || 0) + minutesRead,
      };
    } else {
      history.push({ date: today, versesRead, minutesRead });
    }
    const trimmed = history.length > HISTORY_LIMIT ? history.slice(-HISTORY_LIMIT) : history;

    // Derive lastReadDate from the most recent *prior* entry (excluding the
    // one we just added/updated for `today`) so applyStreak()'s day-gap
    // comparison behaves the same way the Mongo controller's does, despite
    // this schema not persisting lastReadDate directly (see module comment).
    const priorDates = history
      .filter((h) => h.date !== today)
      .map((h) => h.date)
      .sort();
    const lastReadDate = priorDates[priorDates.length - 1] || '';
    const streakState = applyStreak({ current: prevStreak, longest: prevStreak, lastReadDate }, today);

    const r = await client.query(
      `INSERT INTO quran_reading_progress (user_id, streak, history)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET streak = EXCLUDED.streak, history = EXCLUDED.history
       RETURNING *`,
      [req.user._id, streakState.current, JSON.stringify(trimmed)]
    );
    return r.rows[0];
  });

  res.json(toJson(doc, req.user._id));
});
