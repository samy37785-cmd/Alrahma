import mongoose from 'mongoose';

// A scheduled one-to-one live session between a teacher and one of their
// students. startsAt is stored in UTC (a JS Date); the frontend renders it in
// each viewer's local timezone, so no timezone is stored on the row.
const liveClassSchema = new mongoose.Schema(
  {
    teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    student:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:       { type: String, required: true, trim: true },
    startsAt:    { type: Date, required: true },
    durationMin: { type: Number, default: 30, min: 5, max: 240 },
    // Teacher pastes a Zoom / Google Meet / Jitsi link — provider-agnostic.
    meetingUrl:  { type: String, default: '' },
    notes:       { type: String, default: '' },
    status:      { type: String, enum: ['scheduled', 'cancelled', 'completed'], default: 'scheduled' },
  },
  { timestamps: true }
);

// Compound indexes match the two dominant query patterns:
//   teacher dashboard → "upcoming classes for teacher X" filters by teacher + startsAt
//   student view      → "upcoming classes for student X" filters by student + startsAt
// These replace the three separate single-field indexes that were here before,
// removing write overhead while covering every real query.
liveClassSchema.index({ teacher: 1, startsAt: 1 });
liveClassSchema.index({ student: 1, startsAt: 1 });

export default mongoose.model('LiveClass', liveClassSchema);
