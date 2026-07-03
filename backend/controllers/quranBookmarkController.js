import QuranBookmark from '../models/QuranBookmark.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// @desc  Get the logged-in student's Quran bookmarks (optionally filtered by surah)
// @route GET /api/quran-bookmarks?chapterId=2
// @access Private
export const getMyBookmarks = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  const chapterId = Number(req.query.chapterId);
  if (chapterId) filter.chapterId = chapterId;
  const bookmarks = await QuranBookmark.find(filter).sort({ createdAt: -1 });
  res.json(bookmarks);
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

  const doc = await QuranBookmark.findOneAndUpdate(
    { user: req.user._id, verseKey },
    { $set: { chapterId, verseNum, note, color } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.status(201).json(doc);
});

// @desc  Remove a bookmark.
// @route DELETE /api/quran-bookmarks/:verseKey
// @access Private
export const removeBookmark = asyncHandler(async (req, res) => {
  const doc = await QuranBookmark.findOneAndDelete({
    user: req.user._id,
    verseKey: req.params.verseKey,
  });
  if (!doc) {
    res.status(404);
    throw new Error('Bookmark not found');
  }
  res.json({ message: 'Bookmark removed' });
});
