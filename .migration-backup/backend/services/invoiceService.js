import Invoice from '../models/Invoice.js';
import { getPlan } from '../config/plans.js';

/**
 * Creates a paid Invoice document (idempotent when gatewayInvoiceId is supplied).
 *
 * When gatewayInvoiceId is provided the function performs a read-first check
 * inside the transaction so that a duplicate webhook delivery for the same
 * gateway event never creates a second invoice.  The sparse unique index on
 * gatewayInvoiceId provides a second line of defence: if two concurrent
 * transactions both pass the read check, the second insert will hit a
 * duplicate-key error, causing withTransaction() to retry, at which point the
 * read check finds the already-committed document and returns early.
 *
 * @param {object}  params
 * @param {*}       [params.userId]            - User._id (null for guest checkouts)
 * @param {string}  [params.email]             - Customer email
 * @param {string}  [params.name]              - Customer display name
 * @param {string}  params.planName            - e.g. 'Starter'
 * @param {*}       [params.paymentId]         - Payment._id for traceability
 * @param {Date}    [params.createdAt]         - Billing period anchor (defaults to now)
 * @param {string}  [params.gatewayInvoiceId]  - Gateway-issued invoice ID for idempotency
 * @param {number}  [params.amountPaid]        - Actual amount charged, when it differs
 *                                               from the plan's list price (coupon
 *                                               checkouts). Omit for full-price flows
 *                                               like Stripe renewals.
 * @param {object}  [params.session]           - Mongoose ClientSession for transactions
 * @returns {Promise<Invoice>}
 */
export async function createInvoice({
  userId          = null,
  email,
  name,
  planName,
  paymentId       = null,
  createdAt       = new Date(),
  gatewayInvoiceId = null,
  amountPaid      = null,
  session         = null,
}) {
  const plan        = getPlan(planName);
  const billingPeriod = new Date(createdAt).toISOString().slice(0, 7); // 'YYYY-MM'
  const sessionOpts = session ? { session } : {};

  // Idempotency: if this gateway event was already processed, return the
  // existing invoice instead of creating a duplicate.
  if (gatewayInvoiceId) {
    const existing = await Invoice.findOne({ gatewayInvoiceId }, null, sessionOpts);
    if (existing) return existing;
  }

  const invoiceData = {
    user:           userId || undefined,
    customerEmail:  email,
    customerName:   name,
    plan:           planName,
    amount:         amountPaid ?? plan?.amount ?? 0,
    originalAmount: plan?.originalAmount ?? plan?.amount ?? 0,
    discountPct:    plan?.discountPct    ?? 0,
    currency:       plan?.currency       ?? 'EUR',
    billingPeriod,
    status:         'paid',
    payment:        paymentId || undefined,
    ...(gatewayInvoiceId ? { gatewayInvoiceId } : {}),
  };

  // Model.create([doc], { session }) is required when passing a Mongoose session.
  const [invoice] = await Invoice.create([invoiceData], sessionOpts);
  return invoice;
}
