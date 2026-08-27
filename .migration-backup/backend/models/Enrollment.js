import mongoose from 'mongoose';

const { Schema } = mongoose;

const enrollmentSchema = new Schema({
  // Step 1 — About you
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, trim: true, lowercase: true },
  whatsapp:  { type: String, trim: true },
  country:   { type: String, trim: true },
  city:      { type: String, trim: true },
  times:     [String],
  timezone:  { type: String, trim: true },

  // Step 2 — Learning goals
  subjects:   [String],
  lang:       { type: String },
  level:      { type: String },
  ageGroup:   { type: String },
  genderPref: { type: String },

  // Step 3 — Chosen teacher
  teacherId:   Number,
  teacherName: String,

  // Step 4 — Chosen plan
  plan: String,

  // Admin
  status: { type: String, enum: ['pending', 'contacted', 'enrolled', 'cancelled'], default: 'pending' },
  notes:  { type: String, default: '' },
}, { timestamps: true });

// ── Query indexes ─────────────────────────────────────────────────────────────
// getMyEnrollment: find by student email, newest first
enrollmentSchema.index({ email: 1, createdAt: -1 });
// Admin: filter by status + sort by date
enrollmentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Enrollment', enrollmentSchema);
