import mongoose from 'mongoose';

// Tracks a student's Qur'an memorization progress, one document per
// (user, surah). `memorizedVerses` holds the ayah numbers the student has
// marked as memorized, so we can compute counts and completion per surah.
const hifzProgressSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chapterId:   { type: Number, required: true, min: 1, max: 114 }, // surah number
    chapterName: { type: String, default: '' },
    totalVerses: { type: Number, default: 0 }, // ayah count of the surah (for % complete)
    memorizedVerses: { type: [Number], default: [] }, // sorted, unique ayah numbers
    lastRevised: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One progress row per surah per student.
hifzProgressSchema.index({ user: 1, chapterId: 1 }, { unique: true });

export default mongoose.model('HifzProgress', hifzProgressSchema);
