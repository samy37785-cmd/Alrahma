import mongoose from 'mongoose';

// Singleton-per-user record for the recording-studio practice goal/stats.
// Kept separate from HifzProgress (which tracks per-surah memorized-verse
// state) because this is a global, cross-surah practice goal/streak.
const quranMemorizationStatsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    dailyGoal: {
      type:   { type: String, enum: ['verses', 'minutes'], default: 'verses' },
      target: { type: Number, default: 5 },
    },

    stats: {
      totalRecordings:   { type: Number, default: 0 },
      totalPracticeTime: { type: Number, default: 0 }, // seconds
      lastPracticeDate:  { type: String, default: '' }, // 'YYYY-MM-DD'
    },

    streak: {
      current:      { type: Number, default: 0 },
      longest:      { type: Number, default: 0 },
      lastReadDate: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

export default mongoose.model('QuranMemorizationStats', quranMemorizationStatsSchema);
