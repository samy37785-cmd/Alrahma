import ManualPayment from '../models/ManualPayment.js';
import Invoice from '../models/Invoice.js';
import { getPlan } from '../config/plans.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import { enrollUser } from '../config/enrollment.js';
import {
  manualPaymentAdminEmail,
  manualPaymentApprovedEmail,
  manualPaymentRejectedEmail,
} from '../config/emailTemplates.js';

// Returns the configured manual payment methods with display info.
// Only returns a method if its env vars are filled in.
export function getManualMethods(req, res) {
  const e = process.env;
  const methods = [];

  if (e.VODAFONE_CASH_NUMBER) {
    methods.push({
      id: 'vodafone_manual',
      label: 'Vodafone Cash (Manual)',
      icon: '📱',
      fields: [
        { label: 'Send to number', value: e.VODAFONE_CASH_NUMBER },
        { label: 'Account name',   value: e.VODAFONE_CASH_NAME || '' },
      ],
      instructions: 'Transfer the exact amount via Vodafone Cash, then enter the transfer reference below.',
    });
  }

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
export async function submitManualPayment(req, res, next) {
  try {
    const { plan: planName, method, customer = {}, reference = '', notes = '' } = req.body;

    const plan = getPlan(planName);
    if (!plan) {
      res.status(400);
      throw new Error(`Unknown plan: ${planName}`);
    }

    const record = await ManualPayment.create({
      plan:      plan.name,
      amount:    plan.amount,
      currency:  plan.currency,
      method,
      customer,
      reference,
      notes,
      userId:    req.user?._id ?? null,
      status:    'pending',
    });

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
          amount:    plan.amount,
          currency:  plan.currency,
          method,
          reference,
        }),
      });
    }

    res.status(201).json({ message: 'Payment request received. We will verify and activate your plan within 24 hours.', id: record._id });
  } catch (err) {
    next(err);
  }
}

// @desc  Admin: list all manual payment requests
// @route GET /api/payments/manual
// @access Admin
export async function listManualPayments(req, res, next) {
  try {
    const requests = await ManualPayment.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    next(err);
  }
}

// @desc  Admin: approve or reject a manual payment
// @route PATCH /api/payments/manual/:id
// @access Admin
export async function reviewManualPayment(req, res, next) {
  try {
    const { status, adminNote } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      res.status(400);
      throw new Error('status must be approved or rejected');
    }

    const record = await ManualPayment.findByIdAndUpdate(
      req.params.id,
      { status, adminNote },
      { new: true }
    );
    if (!record) {
      res.status(404);
      throw new Error('Manual payment request not found');
    }

    // On approval, create an invoice and activate subscription.
    if (status === 'approved') {
      await enrollUser(record.userId, record.plan).catch(() => {});
      const plan = getPlan(record.plan);
      const period = new Date().toISOString().slice(0, 7);
      await Invoice.create({
        user:           record.userId,
        customerEmail:  record.customer?.email,
        customerName:   record.customer?.name,
        plan:           record.plan,
        amount:         record.amount,
        originalAmount: plan?.originalAmount ?? record.amount,
        discountPct:    plan?.discountPct ?? 0,
        currency:       record.currency,
        billingPeriod:  period,
        status:         'paid',
      });
    }

    // Email the student about the decision
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
  } catch (err) {
    next(err);
  }
}
