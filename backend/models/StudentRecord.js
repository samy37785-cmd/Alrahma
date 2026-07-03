import mongoose from 'mongoose';

// A single follow-up entry a teacher records about one of their students.
// One document per evaluation/session. Any combination of grade, attendance
// and note can be filled in — they're all optional so a teacher can log just
// a grade, just attendance, or a full report.
const studentRecordSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Optional course this entry relates to.
    course:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },

    // Date the session/evaluation happened (defaults to now).
    date:    { type: Date, default: Date.now },

    // Numeric grade out of 100 (optional) + a free-text label (e.g. ممتاز / Excellent).
    grade:      { type: Number, min: 0, max: 100, default: null },
    gradeLabel: { type: String, trim: true, default: '' },

    // Attendance for the session (optional).
    attendance: { type: String, enum: ['present', 'absent', 'late', 'excused', ''], default: '' },

    // ── Session register fields (Excel-style columns) ──
    memoFrom:  { type: String, trim: true, default: '' },   // memorization from (e.g. "Al-Baqarah 1")
    memoTo:    { type: String, trim: true, default: '' },   // memorization to   (e.g. "Al-Baqarah 20")
    review:    { type: String, trim: true, default: '' },   // what was revised (muraja'a)
    tajweed:   { type: String, trim: true, default: '' },   // tajweed rating / remark
    homework:  { type: String, trim: true, default: '' },   // assignment for next session

    // Free-text note about the student's performance.
    note: { type: String, trim: true, default: '', maxlength: 2000 },
  },
  { timestamps: true }
);

studentRecordSchema.index({ student: 1, date: -1 });

export default mongoose.model('StudentRecord', studentRecordSchema);
