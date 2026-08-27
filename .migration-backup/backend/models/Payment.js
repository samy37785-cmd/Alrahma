import mongoose from 'mongoose';


// One record per checkout attempt. Created as `pending` when the user starts
// payment, then flipped to `paid` / `failed` by the gateway webhook/callback.
const paymentSchema = new mongoose.Schema(
  {
    plan: { type: String, required: true }, // Starter | Standard | Premium
    amount: { type: Number, required: true }, // looked up server-side; already net of any coupon
    currency: { type: String, default: 'EUR' },

    // Coupon applied at checkout (couponService.resolveCouponForCheckout).
    // Redeemed (usedCount/usedBy recorded) only when the payment actually
    // succeeds — see the webhook/capture/approval flows.
    couponCode:     { type: String, default: null },
    discountAmount: { type: Number, default: 0 },

    gateway: { type: String, enum: ['stripe', 'paypal'], required: true },
    // card (Stripe) / paypal
    method: { type: String, default: 'card' },

    customer: {
      name: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },

    // Gateway references (used to reconcile webhooks/captures with this record)
    gatewayOrderId: { type: String, index: true }, // Stripe session id / PayPal order id
    gatewayTxnId: { type: String }, // Stripe payment_intent / PayPal capture id
    stripeCustomerId:     { type: String }, // for matching renewal webhooks to a user
    stripeSubscriptionId: { type: String },
    raw: { type: Object }, // last raw gateway payload, for debugging/audit
  },
  { timestamps: true }
);

// ── Query indexes ─────────────────────────────────────────────────────────────
// gatewayOrderId is the primary lookup key (webhook reconciliation) — already indexed above
// User payment history
paymentSchema.index({ userId: 1 }, { sparse: true });
// Admin: filter by status + sort
paymentSchema.index({ status: 1, createdAt: -1 });
// Stripe renewal webhook: find payment by subscription id
paymentSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
// Stripe customer lookup (renewal/cancellation webhooks)
paymentSchema.index({ stripeCustomerId: 1 }, { sparse: true });

export default mongoose.model('Payment', paymentSchema);
