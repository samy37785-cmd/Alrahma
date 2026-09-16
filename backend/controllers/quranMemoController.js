import QuranMemorizationStats from '../models/QuranMemorizationStats.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyStreak, todayStr } from '../utils/streak.js';
import { clampNonNegative } from '../utils/clampNumeric.js';

// A single log call can plausibly cover at most one day's worth of practice
// and a generous number of recordings — bounds chosen to reject obviously
// bogus/attacker-supplied values, not to constrain real usage.
const MAX_PRACTICE_SECONDS = 86400; // 24h
const MAX_RECORDINGS_COUNT = 1000;

async function getOrCreate(userId) {
  return (
    (await QuranMemorizationStats.findOne({ user: userId })) ||
    new QuranMemorizationStats({ user: userId })
  );
}

// @desc  Get the logged-in student's memorization/recording-studio goal + stats.
// @route GET /api/quran-memo
// @access Private
export const getMyMemoStats = asyncHandler(async (req, res) => {
  const doc = await getOrCreate(req.user._id);
  if (doc.isNew) await doc.save();
  res.json(doc);
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
  const doc = await getOrCreate(req.user._id);
  doc.dailyGoal = { type, target };
  await doc.save();
  res.json(doc);
});

// @desc  Log a completed practice/recording session — updates stats + streak.
// @route POST /api/quran-memo/log
// @body  { practiceSeconds, recordingsCount }
// @access Private
export const logPractice = asyncHandler(async (req, res) => {
  const practiceSeconds = clampNonNegative(req.body.practiceSeconds, MAX_PRACTICE_SECONDS);
  const recordingsCount = clampNonNegative(req.body.recordingsCount, MAX_RECORDINGS_COUNT);
  const today = todayStr();

  // Auth hardening security batch (item 6d): the counters are incremented
  // atomically via findOneAndUpdate's $inc — a real DB-level operation, not
  // read-modify-write — so concurrent log calls can no longer lose an
  // update. The streak recomputation below still needs the document's
  // current lastReadDate to decide same-day/gap/reset, so it stays a
  // follow-up .save(); only the streak branch (not the counters) remains a
  // theoretical residual race under heavy concurrency.
  const doc = await QuranMemorizationStats.findOneAndUpdate(
    { user: req.user._id },
    {
      $inc: {
        'stats.totalRecordings': recordingsCount,
        'stats.totalPracticeTime': practiceSeconds,
      },
      $set: { 'stats.lastPracticeDate': today },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  doc.streak = applyStreak(doc.streak, today);
  await doc.save();
  res.json(doc);
});
