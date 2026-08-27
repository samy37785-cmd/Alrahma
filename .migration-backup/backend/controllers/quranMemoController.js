import QuranMemorizationStats from '../models/QuranMemorizationStats.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyStreak, todayStr } from '../utils/streak.js';

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
  const practiceSeconds  = Number(req.body.practiceSeconds)  || 0;
  const recordingsCount  = Number(req.body.recordingsCount)  || 0;
  const doc = await getOrCreate(req.user._id);
  const today = todayStr();

  doc.stats.totalRecordings   += recordingsCount;
  doc.stats.totalPracticeTime += practiceSeconds;
  doc.stats.lastPracticeDate  = today;
  doc.streak = applyStreak(doc.streak, today);

  await doc.save();
  res.json(doc);
});
