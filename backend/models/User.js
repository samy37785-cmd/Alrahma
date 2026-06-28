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
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // never return the password by default
    },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
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
    },
    resetToken:       { type: String, select: false },
    resetTokenExpiry: { type: Date,   select: false },
  },
  { timestamps: true }
);

// Hash the password automatically before saving (only if changed).
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
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
