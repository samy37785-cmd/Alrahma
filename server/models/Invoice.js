import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true },
    user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerEmail: { type: String, lowercase: true, trim: true, required: true },
    customerName:  { type: String, trim: true },

    plan:           { type: String, required: true },
    amount:         { type: Number, required: true },
    originalAmount: { type: Number, required: true },
    discountPct:    { type: Number, default: 0 },
    currency:       { type: String, default: 'EUR' },

    billingPeriod: { type: String }, // "2025-06"
    status:        { type: String, enum: ['paid', 'pending', 'cancelled'], default: 'paid' },

    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  },
  { timestamps: true }
);

// Auto-generate invoice number before first save.
invoiceSchema.pre('save', async function () {
  if (this.invoiceNumber) return;
  const year = new Date().getFullYear();
  const count = await this.constructor.countDocuments();
  this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
});

export default mongoose.model('Invoice', invoiceSchema);
