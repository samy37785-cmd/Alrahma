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

  // Scope correction (see docs/current-project-status.md): registration is
  // a booking request; reaching 'enrolled' via the admin's "Approve &
  // Activate" action (controllers/enrollmentController.js's
  // approveEnrollment) is what activates the student's paid subscription
  // and generates an invoice — never a card-gateway charge. Canonical,
  // writable-going-forward values are 'pending'/'approved'/'enrolled'/
  // 'cancelled' (utils/enrollmentValidation.js's ENROLLMENT_STATUSES is the
  // enforced allowlist for every write). 'contacted'/'awaiting_payment'/
  // 'paid' predate this design (an earlier offline-payment-bookkeeping
  // scheme) and stay in the enum ONLY so pre-existing Mongo documents
  // carrying one of those values remain readable/re-saveable — migration-
  // safe, not a feature: no API can newly set them.
  status: { type: String, enum: ['pending', 'approved', 'contacted', 'awaiting_payment', 'paid', 'enrolled', 'cancelled'], default: 'pending' },
  notes:  { type: String, default: '' },
  adminNote: { type: String, default: '' },

  // Historical, admin-only offline-payment bookkeeping fields from the
  // retired payments product. No API (public or admin) may write to these
  // any more — see utils/enrollmentValidation.js's ADMIN_UPDATABLE_FIELDS,
  // which excludes them. Left on the schema, unvalidated/unenforced, purely
  // so pre-existing documents that already have values here keep loading
  // exactly as stored; never delete this data per product decision.
  agreedAmount:          { type: Number },
  currency:              { type: String, trim: true },
  paymentMethodExternal: { type: String, trim: true },
  paidAt:                { type: Date },
  renewalAt:             { type: Date },
}, { timestamps: true });

// ── Query indexes ─────────────────────────────────────────────────────────────
// getMyEnrollment: find by student email, newest first
enrollmentSchema.index({ email: 1, createdAt: -1 });
// Admin: filter by status + sort by date
enrollmentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Enrollment', enrollmentSchema);
