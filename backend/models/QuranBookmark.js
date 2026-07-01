import mongoose from 'mongoose';

// One row per verse a student bookmarks. Distinct from HifzProgress (which
// tracks memorization state, not reading bookmarks) and from the Khatm
// tracker (which lives client-side in localStorage and is chapter-level).
const quranBookmarkSchema = new mongoose.Schema(
  {
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    verseKey:  { type: String, required: true },   // e.g. "2:255"
    chapterId: { type: Number, required: true, min: 1, max: 114 },
    verseNum:  { type: Number, required: true },
    note:      { type: String, default: '' },
  },
  { timestamps: true }
);

quranBookmarkSchema.index({ user: 1, verseKey: 1 }, { unique: true });
quranBookmarkSchema.index({ user: 1, chapterId: 1 });

export default mongoose.model('QuranBookmark', quranBookmarkSchema);
