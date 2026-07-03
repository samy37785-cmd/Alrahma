import QuranReadingProgress from '../models/QuranReadingProgress.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyStreak, todayStr } from '../utils/streak.js';

const HISTORY_LIMIT = 90;

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
  const versesRead  = Number(req.body.versesRead)  || 0;
  const minutesRead = Number(req.body.minutesRead) || 0;
  const doc = await getOrCreate(req.user._id);
  const today = todayStr();

  const entry = doc.history.find((h) => h.date === today);
  if (entry) {
    entry.versesRead  += versesRead;
    entry.minutesRead += minutesRead;
  } else {
    doc.history.push({ date: today, versesRead, minutesRead });
  }
  if (doc.history.length > HISTORY_LIMIT) {
    doc.history = doc.history.slice(-HISTORY_LIMIT);
  }

  doc.streak = applyStreak(doc.streak, today);
  await doc.save();
  res.json(doc);
});
