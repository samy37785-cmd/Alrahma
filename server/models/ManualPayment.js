import mongoose from 'mongoose';

const manualPaymentSchema = new mongoose.Schema(
  {
    plan:     { type: String, required: true },
    amount:   { type: Number, required: true },
    currency: { type: String, default: 'EUR' },
    method:   { type: String, required: true }, // wu | moneygram | payoneer | bank | vodafone_manual | paypal_manual

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

export default mongoose.model('ManualPayment', manualPaymentSchema);
