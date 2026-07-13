import mongoose from 'mongoose';

const manualPaymentSchema = new mongoose.Schema(
  {
    plan:     { type: String, required: true },
    amount:   { type: Number, required: true }, // already net of any coupon
    currency: { type: String, default: 'EUR' },
    method:   { type: String, required: true }, // wu | moneygram | payoneer | bank | paypal_manual

    // Coupon applied at submission (couponService.resolveCouponForCheckout);
    // redeemed only when an admin approves the payment.
    couponCode:     { type: String, default: null },
    discountAmount: { type: Number, default: 0 },

    customer: {
      name:  { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },

    reference: { type: String, trim: true }, // transfer reference / MTN / confirmation number
    notes:     { type: String, trim: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminNote: { type: String },
  },
  { timestamps: true }
);

// ── Query indexes ─────────────────────────────────────────────────────────────
// User payment history lookup
manualPaymentSchema.index({ userId: 1 }, { sparse: true });
// Admin: filter by status (pending review) + sort by date
manualPaymentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ManualPayment', manualPaymentSchema);
