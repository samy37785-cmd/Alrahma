import mongoose from 'mongoose';
import Counter from './Counter.js';

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

    // Populated for gateway-issued invoices (e.g. Stripe invoice ID for renewals).
    // Sparse unique index prevents duplicate processing of the same gateway event.
    gatewayInvoiceId: { type: String },
  },
  { timestamps: true }
);

// ── Query indexes ─────────────────────────────────────────────────────────────
invoiceSchema.index({ user: 1, createdAt: -1 });
invoiceSchema.index({ customerEmail: 1, createdAt: -1 });
invoiceSchema.index({ createdAt: -1 });
// Unique sparse index ensures one invoice per gateway event (idempotency for renewals).
invoiceSchema.index({ gatewayInvoiceId: 1 }, { unique: true, sparse: true });

// Auto-generate invoice number using an atomic per-year counter.
// countDocuments() + 1 is NOT atomic under concurrency — two concurrent
// creates could get the same count and both try to use the same number,
// causing a duplicate-key error on the unique invoiceNumber index.
invoiceSchema.pre('save', async function () {
  if (this.invoiceNumber) return;
  const year = new Date().getFullYear();
  const seq  = await Counter.nextSeq(`invoice-${year}`);
  this.invoiceNumber = `INV-${year}-${String(seq).padStart(4, '0')}`;
});

export default mongoose.model('Invoice', invoiceSchema);
