import mongoose from 'mongoose';
import Counter from './Counter.js';

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

// Auto-generate a sequential certificate number on first save, via an atomic
// per-year Counter (same pattern as Invoice.js) — countDocuments()+1 is NOT
// atomic under concurrency and can hand two concurrent creates the same
// number, causing a duplicate-key error on the unique certificateNumber index.
certificateSchema.pre('save', async function () {
  if (this.certificateNumber) return;
  const year = new Date().getFullYear();
  // Seed the counter from existing certificates the first time it's used, so
  // numbering continues from the legacy countDocuments()-based scheme instead
  // of colliding with already-issued numbers. Safe because certificates are
  // only ever revoked (a flag, see revokeCertificate), never hard-deleted, so
  // this count is always an accurate high-water mark. A no-op cost after the
  // first call (Counter.nextSeq only applies the seed once) — acceptable
  // given certificate issuance is a low-frequency, admin-triggered action.
  const existingThisYear = await this.constructor.countDocuments({
    createdAt: {
      $gte: new Date(year, 0, 1),
      $lt: new Date(year + 1, 0, 1),
    },
  });
  const seq = await Counter.nextSeq(`certificate-${year}`, existingThisYear);
  this.certificateNumber = `CERT-${year}-${String(seq).padStart(4, '0')}`;
});

export default mongoose.model('Certificate', certificateSchema);
