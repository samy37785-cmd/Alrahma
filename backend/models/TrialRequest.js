import mongoose from 'mongoose';

// Stores submissions from the "Book a Free Trial" form on the React site.
const trialRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
    phone: { type: String, trim: true },
    course: { type: String, trim: true },
    message: { type: String, trim: true },
    status: { type: String, enum: ['new', 'contacted', 'scheduled'], default: 'new' },
  },
  { timestamps: true }
);

// ── Query indexes ─────────────────────────────────────────────────────────────
// Admin: filter new/contacted/scheduled trials, sorted by date
trialRequestSchema.index({ status: 1, createdAt: -1 });
// Duplicate-submission guard
trialRequestSchema.index({ email: 1 });

export default mongoose.model('TrialRequest', trialRequestSchema);
