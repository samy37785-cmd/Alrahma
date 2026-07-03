import mongoose from 'mongoose';

// Tracks how far a student has progressed through a course's materials.
// A course's resources have no stable _id in the DB, so completion is keyed
// by the resource URL (effectively a unique identifier per lesson item).
const courseProgressSchema = new mongoose.Schema(
  {
    user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    completed: { type: [String], default: [] }, // resource URLs marked done
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One progress row per (student, course).
courseProgressSchema.index({ user: 1, course: 1 }, { unique: true });

export default mongoose.model('CourseProgress', courseProgressSchema);
