import mongoose from 'mongoose';

// Singleton-per-user record: last reading position (for "continue reading"),
// the student's daily reading goal, and a rolling streak/history calendar.
// One document per user — not a log table like QuranBookmark.
const quranReadingProgressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    lastPosition: {
      navMode:        { type: String, enum: ['surah', 'page', 'juz', 'hizb'], default: 'surah' },
      chapterId:      { type: Number },
      pageNum:        { type: Number },
      juzNum:         { type: Number },
      hizbNum:        { type: Number },
      verseKey:       { type: String },   // exact resume point, e.g. "2:255"
      verseTimestamp: { type: Number, default: 0 }, // in-verse audio position (seconds)
    },

    dailyGoal: {
      type:   { type: String, enum: ['verses', 'minutes', 'pages'], default: 'verses' },
      target: { type: Number, default: 10 },
    },

    streak: {
      current:      { type: Number, default: 0 },
      longest:      { type: Number, default: 0 },
      lastReadDate: { type: String, default: '' }, // 'YYYY-MM-DD'
    },

    // Rolling calendar of daily activity, trimmed to the most recent ~90
    // entries by the controller so this stays a bounded reading-history
    // view rather than an unbounded log.
    history: {
      type: [
        {
          date:        { type: String, required: true }, // 'YYYY-MM-DD'
          versesRead:  { type: Number, default: 0 },
          minutesRead: { type: Number, default: 0 },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model('QuranReadingProgress', quranReadingProgressSchema);
