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

  // Booking-first model (payment happens off-site, over WhatsApp) — this
  // reference is shown to the student right after submission and embedded
  // in the pre-filled WhatsApp message so admin and student can both refer
  // to the same request unambiguously.
  bookingRef: { type: String, unique: true, sparse: true, index: true },

  // Admin — status values kept superset-compatible with pre-existing prod
  // documents ('pending'/'enrolled' predate the booking-first model and
  // still mean "new"/"activated"; 'awaiting_payment'/'paid' are new
  // intermediate states). No data migration needed — this is additive.
  status: { type: String, enum: ['pending', 'contacted', 'awaiting_payment', 'paid', 'enrolled', 'cancelled'], default: 'pending' },
  notes:  { type: String, default: '' },

  // Admin-only financial bookkeeping for the offline payment the student
  // arranges over WhatsApp — never a payment gateway, never card/account
  // data. Distinct from the customer-facing `notes` field above.
  agreedAmount:          { type: Number },
  currency:              { type: String, trim: true },
  paymentMethodExternal: { type: String, trim: true },
  paidAt:                { type: Date },
  renewalAt:             { type: Date },
  adminNote:             { type: String, default: '' },
}, { timestamps: true });

// ── Query indexes ─────────────────────────────────────────────────────────────
// getMyEnrollment: find by student email, newest first
enrollmentSchema.index({ email: 1, createdAt: -1 });
// Admin: filter by status + sort by date
enrollmentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Enrollment', enrollmentSchema);
