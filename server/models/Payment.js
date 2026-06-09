import mongoose from 'mongoose';

// One record per checkout attempt. Created as `pending` when the user starts
// payment, then flipped to `paid` / `failed` by the gateway webhook/callback.
const paymentSchema = new mongoose.Schema(
  {
    plan: { type: String, required: true }, // Starter | Standard | Premium
    amount: { type: Number, required: true }, // looked up server-side
    currency: { type: String, default: 'EUR' },

    gateway: { type: String, enum: ['paymob', 'paypal'], required: true },
    // card / wallet (Vodafone Cash, etc.) for PayMob; paypal for PayPal
    method: { type: String, default: 'card' },

    customer: {
      name: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },

    status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },

    // Gateway references (used to reconcile webhooks/captures with this record)
    gatewayOrderId: { type: String, index: true }, // PayMob order id / PayPal order id
    gatewayTxnId: { type: String }, // PayMob transaction id / PayPal capture id
    raw: { type: Object }, // last raw gateway payload, for debugging/audit
  },
  { timestamps: true }
);

export default mongoose.model('Payment', paymentSchema);
