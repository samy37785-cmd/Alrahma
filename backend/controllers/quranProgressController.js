import QuranReadingProgress from '../models/QuranReadingProgress.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyStreak, todayStr } from '../utils/streak.js';
import { clampNonNegative } from '../utils/clampNumeric.js';

const HISTORY_LIMIT = 90;
// The Mushaf has 6236 verses total and a day has 1440 minutes — a single
// log call claiming more than either is obviously bogus/attacker-supplied,
// not real usage.
const MAX_VERSES_READ = 6236;
const MAX_MINUTES_READ = 1440;

async function getOrCreate(userId) {
  return (
    (await QuranReadingProgress.findOne({ user: userId })) ||
    new QuranReadingProgress({ user: userId })
  );
}

// @desc  Get the logged-in student's reading progress (last position, goal, streak, history).
// @route GET /api/quran-progress
// @access Private
export const getMyProgress = asyncHandler(async (req, res) => {
  const doc = await getOrCreate(req.user._id);
  if (doc.isNew) await doc.save();
  res.json(doc);
});

// @desc  Persist the last-read position (for "continue reading" / audio resume).
// @route PUT /api/quran-progress/position
// @body  { navMode, chapterId, pageNum, juzNum, hizbNum, verseKey, verseTimestamp }
// @access Private
export const updatePosition = asyncHandler(async (req, res) => {
  const { navMode, chapterId, pageNum, juzNum, hizbNum, verseKey, verseTimestamp } = req.body;
  const doc = await getOrCreate(req.user._id);
  doc.lastPosition = {
    navMode: navMode || doc.lastPosition?.navMode || 'surah',
    chapterId, pageNum, juzNum, hizbNum, verseKey,
    verseTimestamp: verseTimestamp || 0,
  };
  await doc.save();
  res.json(doc);
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
  const doc = await getOrCreate(req.user._id);
  doc.dailyGoal = { type, target };
  await doc.save();
  res.json(doc);
});

// @desc  Log reading activity for today — updates streak + history calendar.
// @route POST /api/quran-progress/log
// @body  { versesRead, minutesRead }
// @access Private
export const logReading = asyncHandler(async (req, res) => {
  const versesRead  = clampNonNegative(req.body.versesRead, MAX_VERSES_READ);
  const minutesRead = clampNonNegative(req.body.minutesRead, MAX_MINUTES_READ);
  const today = todayStr();

  // Corrective: an earlier two-step approach (try $inc on today's existing
  // entry, fall back to $push if missing) still had a real race — two
  // concurrent "first log of the day" calls could each miss the $inc match
  // and both take the $push branch, producing two same-date history
  // entries. Replaced with a single MongoDB update PIPELINE (the array form
  // of the update argument — an aggregation expression, not a classic
  // update document): the server decides "increment today's entry if it
  // exists, otherwise append one" as ONE atomic per-document operation.
  // MongoDB serializes writes to the same document, and each concurrent
  // call's pipeline is evaluated against whatever the document's state
  // genuinely is at the moment that call executes (including another
  // call's just-committed write) — never a stale client-side read — so no
  // interleaving can produce two entries for the same (user, date).
  //
  // Ensuring the doc/schema-defaults exist first (getOrCreate + conditional
  // save, same pattern as getMyProgress()) keeps this update a plain,
  // non-upsert findOneAndUpdate — MongoDB does not support mixing
  // $setOnInsert-style default application with a pipeline update, so
  // upserting here directly would leave a brand-new document without its
  // schema defaults (dailyGoal/lastPosition/streak).
  //
  // This first-creation step has its own, separate race from the history
  // race above: two concurrent "very first log ever" requests for the same
  // user can both run getOrCreate's findOne before either has saved, so
  // both see isNew===true and both attempt to save a new document. The
  // schema's unique index on `user` (models/QuranReadingProgress.js) lets
  // only one of those inserts succeed — without handling that, the loser
  // would bubble up as an unhandled E11000 duplicate-key error → 500. Since
  // "someone else just created my singleton" is not actually a failure (the
  // document we wanted now exists either way), swallow only that specific
  // error and continue into the atomic pipeline update below.
  const seed = await getOrCreate(req.user._id);
  if (seed.isNew) {
    try {
      await seed.save();
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }

  const doc = await QuranReadingProgress.findOneAndUpdate(
    { user: req.user._id },
    [
      {
        $set: {
          history: {
            $let: {
              vars: { existing: { $ifNull: ['$history', []] } },
              in: {
                $let: {
                  vars: { matchIdx: { $indexOfArray: ['$$existing.date', today] } },
                  in: {
                    $cond: [
                      { $gte: ['$$matchIdx', 0] },
                      {
                        $map: {
                          input: '$$existing',
                          as: 'h',
                          in: {
                            $cond: [
                              { $eq: ['$$h.date', today] },
                              {
                                date: '$$h.date',
                                versesRead: { $add: ['$$h.versesRead', versesRead] },
                                minutesRead: { $add: ['$$h.minutesRead', minutesRead] },
                              },
                              '$$h',
                            ],
                          },
                        },
                      },
                      {
                        $slice: [
                          { $concatArrays: ['$$existing', [{ date: today, versesRead, minutesRead }]] },
                          -HISTORY_LIMIT,
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    ],
    { new: true }
  );

  doc.streak = applyStreak(doc.streak, today);
  await doc.save();
  res.json(doc);
});
