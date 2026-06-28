import mongoose from 'mongoose';

// A certificate issued to a student — Ijazah, course completion, or a Hifz
// milestone. Issued by an admin/teacher and viewable/printable by the student.
const certificateSchema = new mongoose.Schema(
  {
    certificateNumber: { type: String, unique: true }, // auto: CERT-2026-0001
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['ijazah', 'completion', 'hifz', 'attendance'],
      default: 'completion',
    },
    title:    { type: String, required: true, trim: true }, // e.g. "Ijazah in Hafs ‘an ‘Asim"
    course:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }, // optional link
    issuedBy: { type: String, trim: true },   // name of the issuing teacher/admin
    grade:    { type: String, trim: true },    // optional: Excellent / Mumtaz, etc.
    notes:    { type: String, trim: true },
    issuedAt: { type: Date, default: Date.now },
    revoked:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Auto-generate a sequential certificate number on first save.
certificateSchema.pre('save', async function () {
  if (this.certificateNumber) return;
  const year = new Date().getFullYear();
  const count = await this.constructor.countDocuments();
  this.certificateNumber = `CERT-${year}-${String(count + 1).padStart(4, '0')}`;
});

export default mongoose.model('Certificate', certificateSchema);
