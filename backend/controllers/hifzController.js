import HifzProgress from '../models/HifzProgress.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// @desc  Get the logged-in student's full memorization progress (all surahs)
// @route GET /api/hifz
// @access Private
export const getMyHifz = asyncHandler(async (req, res) => {
  const progress = await HifzProgress.find({ user: req.user._id }).sort({ chapterId: 1 }).lean();
  const totalMemorized = progress.reduce((sum, p) => sum + p.memorizedVerses.length, 0);
  const surahsCompleted = progress.filter(
    (p) => p.totalVerses > 0 && p.memorizedVerses.length >= p.totalVerses
  ).length;
  res.json({ progress, totalMemorized, surahsCompleted });
});

// The write handler (PUT /api/hifz/:chapterId, mark a verse range memorized)
// was removed with its route: no page called it, and it built the whole
// requested range in memory, so one request from any signed-in account
// (from=1, to=1e9) could stall the server.

// @desc  Admin/teacher: view a specific student's memorization progress.
// @route None. Its only route, GET /api/hifz/user/:userId, let a regular
//        account with role 'admin' read any student's record with a password
//        alone, so it was closed (AR-04). No admin route replaces it.
export const getUserHifz = asyncHandler(async (req, res) => {
  const progress = await HifzProgress.find({ user: req.params.userId }).sort({ chapterId: 1 }).lean();
  res.json(progress);
});
