import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8,  'Password must be at least 8 characters'],
      maxlength: [72, 'Password must not exceed 72 characters'],
      select: false, // never return the password by default
    },
    role: { type: String, enum: ['student', 'teacher', 'parent', 'admin'], default: 'student' },

    // ── Teacher / student link (set by admin) ──
    // For a STUDENT: the teacher responsible for following up on them.
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Parent / child link ──
    // For a PARENT: the student accounts they can follow.
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // For a STUDENT: a short code they share so a parent can link to them.
    parentLinkCode: { type: String, default: null, index: true },
    // For a STUDENT: optional family/household name, used to group students
    // (e.g. "Ammar's family") in the sessions register.
    familyName: { type: String, trim: true, default: '' },

    subscription: {
      plan:        { type: String, default: null },
      status:      { type: String, enum: ['active', 'inactive'], default: 'inactive' },
      activeSince: { type: Date, default: null },
      validUntil:  { type: Date, default: null },
      // Recurring-billing references (Stripe). Null for manual / PayPal payments.
      provider:             { type: String, default: null }, // 'stripe' | 'paypal' | 'manual'
      stripeCustomerId:     { type: String, default: null },
      stripeSubscriptionId: { type: String, default: null },
      cancelAtPeriodEnd:    { type: Boolean, default: false },
      // The validUntil value we last sent a "renewal coming up" email for.
      // Stored so the daily reminder job never emails the same period twice;
      // it naturally re-arms when validUntil moves forward on renewal.
      renewalReminderSentFor: { type: Date, default: null },
    },
    // OAuth — Google Sign-In subject identifier
    googleId: { type: String, default: null, index: true, sparse: true },

    // ── Gamification ──────────────────────────────────────────────────────────
    xp:            { type: Number, default: 0, min: 0 },
    level:         { type: Number, default: 1, min: 1 },
    streak:        { type: Number, default: 0, min: 0 },   // current daily streak
    lastStudyDate: { type: Date,   default: null },         // last day XP was earned
    badges:        [{ type: String }],                      // awarded badge keys

    resetToken:       { type: String, select: false },
    resetTokenExpiry: { type: Date,   select: false },
    // Incremented on password change; invalidates all previously-issued tokens.
    tokenVersion:     { type: Number, default: 0 },

    // ── Teacher profile (admin-populated for role=teacher accounts) ──
    // Referenced by searchController, teacherController, and admin staff views.
    specialization: { type: String, trim: true, default: '' },
    bio:            { type: String, trim: true, default: '' },
    gender:         { type: String, enum: ['male', 'female', ''], default: '' },
    languages:      [{ type: String }],
    subjects:       [{ type: String }],
    rating:         { type: Number, default: 0, min: 0, max: 5 },
  },
  { timestamps: true }
);

// ── Query indexes ─────────────────────────────────────────────────────────────
// Cron job: find active subscribers expiring within N days
userSchema.index({ 'subscription.status': 1, 'subscription.validUntil': 1 });
// Stripe webhook: deactivateSubscription() looks up by stripeSubscriptionId
userSchema.index({ 'subscription.stripeSubscriptionId': 1 }, { sparse: true });
// Admin listTeachers / role-based access checks
userSchema.index({ role: 1 });
// Student-teacher assignment queries (updateMany + populate)
userSchema.index({ teacher: 1 }, { sparse: true });

// Hash the password automatically before saving (only if changed).
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance method to compare a plain password with the hashed one.
userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

// True only if the subscription is marked active AND has not passed its
// validUntil date. This is the single source of truth for paid access —
// status alone is not enough because nothing flips it to inactive on expiry.
userSchema.methods.hasActiveSubscription = function () {
  const s = this.subscription;
  if (!s || s.status !== 'active') return false;
  if (!s.validUntil) return false;
  return new Date(s.validUntil).getTime() > Date.now();
};

export default mongoose.model('User', userSchema);
