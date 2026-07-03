import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z0-9_-]{3,30}$/,
    },
    description: {
      type: String,
      maxlength: 300,
    },
    discountType: {
      type: String,
      enum: ['percent', 'fixed'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    maxUses: {
      type: Number,
      default: null,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    usedBy: [
      {
        user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
      },
    ],
    applicablePlans: [{ type: String }],
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

couponSchema.index({ active: 1, validUntil: 1 });
// Fast per-user duplicate-use check (validateCoupon) — avoids loading full usedBy array
couponSchema.index({ 'usedBy.user': 1 });

couponSchema.methods.isValid = function () {
  const now = new Date();
  if (!this.active) return false;
  if (this.validFrom && now < this.validFrom) return false;
  if (this.validUntil && now > this.validUntil) return false;
  if (this.maxUses !== null && this.usedCount >= this.maxUses) return false;
  return true;
};

couponSchema.methods.calculateDiscount = function (amount) {
  if (!this.isValid()) return 0;
  if (amount < this.minOrderAmount) return 0;
  if (this.discountType === 'percent') {
    return Math.min((amount * this.discountValue) / 100, amount);
  }
  return Math.min(this.discountValue, amount);
};

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
