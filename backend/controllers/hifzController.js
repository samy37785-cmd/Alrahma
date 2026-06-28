import HifzProgress from '../models/HifzProgress.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// @desc  Get the logged-in student's full memorization progress (all surahs)
// @route GET /api/hifz
// @access Private
export const getMyHifz = asyncHandler(async (req, res) => {
  const progress = await HifzProgress.find({ user: req.user._id }).sort({ chapterId: 1 });
  const totalMemorized = progress.reduce((sum, p) => sum + p.memorizedVerses.length, 0);
  const surahsCompleted = progress.filter(
    (p) => p.totalVerses > 0 && p.memorizedVerses.length >= p.totalVerses
  ).length;
  res.json({ progress, totalMemorized, surahsCompleted });
});

// @desc  Mark (or unmark) a verse range as memorized for a surah.
// @route PUT /api/hifz/:chapterId
// @body  { chapterName, totalVerses, from, to, memorized: true|false }
// @access Private
export const markMemorized = asyncHandler(async (req, res) => {
  const chapterId = Number(req.params.chapterId);
  if (!chapterId || chapterId < 1 || chapterId > 114) {
    res.status(400);
    throw new Error('Invalid surah number');
  }
  const { chapterName = '', totalVerses = 0, from, to, memorized = true } = req.body;
  const start = Number(from);
  const end   = Number(to);
  if (!start || !end || start > end) {
    res.status(400);
    throw new Error('Invalid verse range');
  }

  const range = [];
  for (let v = start; v <= end; v++) range.push(v);

  const doc =
    (await HifzProgress.findOne({ user: req.user._id, chapterId })) ||
    new HifzProgress({ user: req.user._id, chapterId });

  const current = new Set(doc.memorizedVerses);
  if (memorized) range.forEach((v) => current.add(v));
  else           range.forEach((v) => current.delete(v));

  doc.memorizedVerses = [...current].sort((a, b) => a - b);
  doc.chapterName     = chapterName || doc.chapterName;
  if (totalVerses) doc.totalVerses = totalVerses;
  doc.lastRevised     = new Date();
  await doc.save();

  res.json(doc);
});

// @desc  Admin/teacher: view a specific student's memorization progress.
// @route GET /api/hifz/user/:userId
// @access Admin
export const getUserHifz = asyncHandler(async (req, res) => {
  const progress = await HifzProgress.find({ user: req.params.userId }).sort({ chapterId: 1 });
  res.json(progress);
});
