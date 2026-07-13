import mongoose from 'mongoose';
import ManualPayment from '../models/ManualPayment.js';
import { getPlan } from '../config/plans.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import { enrollUser } from '../services/subscriptionService.js';
import { resolveCouponForCheckout, redeemCoupon } from '../services/couponService.js';
import { createInvoice } from '../services/invoiceService.js';
import { createNotification } from '../services/notificationService.js';
import {
  manualPaymentAdminEmail,
  manualPaymentApprovedEmail,
  manualPaymentRejectedEmail,
} from '../config/emailTemplates.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditFromReq } from '../services/auditService.js';
import logger from '../config/logger.js';

// Returns the configured manual payment methods with display info.
// Only returns a method if its env vars are filled in.
export function getManualMethods(req, res) {
  const e = process.env;
  const methods = [];

  if (e.PAYPAL_RECEIVER_EMAIL) {
    const paypalFields = [
      { label: 'PayPal email', value: e.PAYPAL_RECEIVER_EMAIL },
    ];
    if (e.PAYPAL_ME_LINK) {
      paypalFields.push({ label: 'PayPal.me link', value: e.PAYPAL_ME_LINK });
    }
    methods.push({
      id: 'paypal_manual',
      label: 'PayPal (Manual Transfer)',
      icon: '🌍',
      fields: paypalFields,
      instructions: 'Send the amount via PayPal to the email or PayPal.me link above, then enter the transaction ID below.',
    });
  }

  if (e.WU_RECEIVER_NAME) {
    methods.push({
      id: 'wu',
      label: 'Western Union',
      icon: '🏦',
      fields: [
        { label: 'Receiver name',    value: e.WU_RECEIVER_NAME },
        { label: 'Country',          value: e.WU_RECEIVER_COUNTRY || 'Egypt' },
        { label: 'City',             value: e.WU_RECEIVER_CITY || '' },
      ],
      instructions: 'Visit a Western Union agent or use the WU app to send money to the details above. Enter the MTCN (tracking number) below.',
    });
  }

  if (e.MG_RECEIVER_NAME) {
    methods.push({
      id: 'moneygram',
      label: 'MoneyGram',
      icon: '💸',
      fields: [
        { label: 'Receiver name', value: e.MG_RECEIVER_NAME },
        { label: 'Country',       value: e.MG_RECEIVER_COUNTRY || 'Egypt' },
        { label: 'City',          value: e.MG_RECEIVER_CITY || '' },
      ],
      instructions: 'Use MoneyGram to send to the details above and enter the Reference Number below.',
    });
  }

  if (e.PAYONEER_EMAIL) {
    methods.push({
      id: 'payoneer',
      label: 'Payoneer',
      icon: '💳',
      fields: [
        { label: 'Payoneer email', value: e.PAYONEER_EMAIL },
      ],
      instructions: 'Log in to your Payoneer account and send a payment to the email above. Enter the Transaction ID below.',
    });
  }

  if (e.BANK_IBAN) {
    methods.push({
      id: 'bank',
      label: 'Bank Transfer (IBAN)',
      icon: '🏛️',
      fields: [
        { label: 'Account name', value: e.BANK_ACCOUNT_NAME || '' },
        { label: 'IBAN',         value: e.BANK_IBAN },
        { label: 'SWIFT / BIC',  value: e.BANK_SWIFT || '' },
        { label: 'Bank name',    value: e.BANK_NAME || '' },
        { label: 'Country',      value: e.BANK_COUNTRY || 'Egypt' },
        { label: 'Currency',     value: e.BANK_CURRENCY || 'EUR' },
      ],
      instructions: 'Wire the exact amount using the IBAN above. Use your name as the payment reference. Enter the transfer reference / IBAN confirmation number below.',
    });
  }

  res.json(methods);
}

// @desc  Student submits a manual payment request
// @route POST /api/payments/manual
// @access Public (softProtect attaches userId if logged in)
export const submitManualPayment = asyncHandler(async (req, res) => {
    const { plan: planName, method, customer = {}, reference = '', notes = '' } = req.body;

    const plan = getPlan(planName);
    if (!plan) {
      res.status(400);
      throw new Error(`Unknown plan: ${planName}`);
    }

    // Coupon (optional): validated server-side against the server-side plan
    // price. The recorded amount is what the student must actually transfer;
    // redemption is recorded only if/when an admin approves the payment.
    const couponResult = await resolveCouponForCheckout({
      code:   req.body.coupon,
      userId: req.user?._id,
      plan,
    });
    if (!couponResult.ok) {
      res.status(couponResult.status);
      throw new Error(couponResult.message);
    }
    const { coupon, discount, finalAmount } = couponResult;

    const record = await ManualPayment.create({
      plan:      plan.name,
      amount:    finalAmount, // net of any coupon
      currency:  plan.currency,
      method,
      customer,
      reference,
      notes,
      userId:    req.user?._id ?? null,
      status:    'pending',
      couponCode:     coupon?.code ?? null,
      discountAmount: discount,
    });

    logger.info('Manual payment submitted', { id: String(record._id), plan: plan.name, method });

    // Notify admin (non-blocking)
    const adminEmail = ADMIN_EMAIL();
    if (adminEmail) {
      sendMail({
        to: adminEmail,
        subject: `New Manual Payment — ${customer.name || 'Unknown'} · ${plan.name}`,
        html: manualPaymentAdminEmail({
          name:      customer.name,
          email:     customer.email,
          plan:      plan.name,
          // The amount the student was actually asked to transfer (net of
          // any coupon) — the admin verifies the transfer against this.
          amount:    finalAmount,
          currency:  plan.currency,
          method,
          reference,
        }),
      });
    }

    res.status(201).json({ message: 'Payment request received. We will verify and activate your plan within 24 hours.', id: record._id });
});

// @desc  Admin: list all manual payment requests
// @route GET /api/v1/admin/payments/manual
// @access Admin (payments:read)
export const listManualPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 500, maxLimit: 500 });
  const [data, total] = await Promise.all([
    ManualPayment.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ManualPayment.countDocuments(),
  ]);
  return sendPaginated(res, { data, total, page, limit });
});

// @desc  Admin: approve or reject a manual payment
// @route PATCH /api/v1/admin/payments/manual/:id
// @access Admin (payments:write) — blocked by financialGuard while financials
//         are frozen, except for the super-admin emergency override.
export const reviewManualPayment = asyncHandler(async (req, res) => {
    const { status, adminNote } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      res.status(400);
      throw new Error('status must be approved or rejected');
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400);
      throw new Error('Invalid ID format');
    }

    // Load without modifying — the approval transaction performs an atomic
    // status claim so two concurrent approvals can never both succeed.
    const record = await ManualPayment.findById(req.params.id).lean();
    if (!record) {
      res.status(404);
      throw new Error('Manual payment request not found');
    }

    // Atomic status claim: only succeeds if the record is still 'pending'.
    // Rejection must use the exact same claim as approval — otherwise a
    // reject racing (or arriving after) an approval could silently overwrite
    // an already-approved, already-enrolled record, and a duplicate
    // reject/approve attempt would report false-positive success instead of
    // the 409 the caller needs to know nothing actually changed.
    let claimed;

    if (status === 'approved') {
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          claimed = await ManualPayment.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            { $set: { status, adminNote } },
            { new: true, session: dbSession },
          );
          if (!claimed) return;

          // Record the coupon redemption now that the transfer is verified.
          // A false return (per-user/maxUses race) is logged, not thrown —
          // the student already sent the discounted amount.
          if (record.couponCode && record.userId) {
            const redeemed = await redeemCoupon(record.couponCode, record.userId, dbSession);
            if (!redeemed) {
              logger.warn('Manual payment approve: coupon redemption not recorded (already used or cap reached)', {
                coupon: record.couponCode, userId: String(record.userId), id: req.params.id,
              });
            }
          }

          await enrollUser(record.userId, record.plan, dbSession);
          await createInvoice({
            userId:   record.userId,
            email:    record.customer?.email,
            name:     record.customer?.name,
            planName: record.plan,
            // ManualPayment.amount is already net of any coupon.
            amountPaid: record.amount,
            session:  dbSession,
          });
          await createNotification({
            recipient: record.userId,
            type:      'payment_received',
            title:     'Payment approved',
            body:      `Your payment for the ${record.plan} plan has been approved and your subscription is now active.`,
            link:      '/billing',
          }, { session: dbSession });
        });
      } finally {
        dbSession.endSession();
      }
    } else {
      claimed = await ManualPayment.findOneAndUpdate(
        { _id: req.params.id, status: 'pending' },
        { $set: { status, adminNote } },
        { new: true },
      );
      if (claimed) {
        await createNotification({
          recipient: record.userId,
          type:      'payment_failed',
          title:     'Payment verification update',
          body:      adminNote
            ? `Your payment could not be verified: ${adminNote}`
            : 'Your payment could not be verified. Please contact support.',
          link:      '/billing',
        });
      }
    }

    if (!claimed) {
      logger.warn('Manual payment review rejected — record no longer pending', {
        id: req.params.id, attemptedStatus: status,
      });
      res.status(409);
      throw new Error('This payment request has already been processed');
    }

    if (status === 'approved') {
      logger.info('Manual payment approved', {
        id:     req.params.id,
        plan:   record.plan,
        userId: String(record.userId),
      });
    } else {
      logger.info('Manual payment rejected', { id: req.params.id });
    }

    // Reflect the committed changes in the response object.
    record.status    = status;
    record.adminNote = adminNote;

    await auditFromReq(
      req, 'payment.manual.review', 'ManualPayment', record._id,
      { status: 'pending' }, { status, adminNote },
      status === 'approved' ? 'warning' : 'info',
    );

    // Email the student about the decision — fires after the transaction commits.
    const studentEmail = record.customer?.email;
    const studentName  = record.customer?.name || 'Student';
    if (studentEmail) {
      if (status === 'approved') {
        sendMail({
          to: studentEmail,
          subject: 'Your payment has been approved — AL-Rahma Academy',
          html: manualPaymentApprovedEmail({ name: studentName, plan: record.plan }),
        });
      } else {
        sendMail({
          to: studentEmail,
          subject: 'Payment verification update — AL-Rahma Academy',
          html: manualPaymentRejectedEmail({ name: studentName, adminNote }),
        });
      }
    }

    res.json(record);
});
