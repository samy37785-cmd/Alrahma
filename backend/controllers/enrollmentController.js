import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import { enrollmentAdminEmail, enrollmentStudentEmail, bookingApprovedEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';
import { pickPublicBookingFields, normalizeWhatsapp } from '../utils/enrollmentValidation.js';
import { adminSetSubscription } from '../services/subscriptionService.js';
import { createInvoice } from '../services/invoiceService.js';
import { auditFromReq } from '../services/auditService.js';
import logger from '../config/logger.js';

// Booking reference shown to the student and embedded in the pre-filled
// WhatsApp message (e.g. "AR-20260913-K7F2"). The 4-char suffix comes from
// node:crypto (cryptographically strong), not Math.random() — this value is
// shown to strangers and used as a lookup key, so it should not be
// predictable/guessable. Retried on the rare unique-constraint collision.
function generateBookingRef() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
  return `AR-${day}-${suffix}`;
}

async function createWithBookingRef(data, attemptsLeft = 5) {
  try {
    return await Enrollment.create({ ...data, status: 'pending', bookingRef: generateBookingRef() });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.bookingRef && attemptsLeft > 0) {
      return createWithBookingRef(data, attemptsLeft - 1);
    }
    throw err;
  }
}

// @route  POST /api/enrollments
// @access Public
export const createEnrollment = asyncHandler(async (req, res) => {
  // Mass-assignment fix: req.body used to be passed straight into
  // Enrollment.create() — a guest could set bookingRef/status/agreedAmount/
  // currency/paymentMethodExternal/paidAt/renewalAt/adminNote directly (e.g.
  // POST { status: 'paid', agreedAmount: 0 }). Only an explicit allowlist of
  // customer-facing fields is ever read from the request body now; status
  // is always forced server-side (see createWithBookingRef above) and every
  // admin/financial field is simply never in that allowlist at all.
  const data = pickPublicBookingFields(req.body);
  if (!data.name || !data.email) {
    res.status(400);
    throw new Error('Name and email are required');
  }

  const whatsapp = normalizeWhatsapp(data.whatsapp);
  if (!whatsapp) {
    res.status(400);
    throw new Error('A valid WhatsApp number is required so we can contact you to arrange your booking');
  }
  data.whatsapp = whatsapp;

  const enrollment = await createWithBookingRef(data);

  // Admin notification — fire-and-forget (non-critical)
  const adminEmail = ADMIN_EMAIL();
  if (adminEmail) {
    sendMail({
      to: adminEmail,
      subject: `📋 New Booking Request — ${data.name} (${data.teacherName || 'no teacher yet'})`,
      html: enrollmentAdminEmail({ ...data, bookingRef: enrollment.bookingRef }),
    });
  }

  // Student confirmation — await so we know it delivered; failure is logged but
  // does not roll back the enrollment (it's already saved to the DB).
  try {
    await sendMail({
      to: data.email,
      subject: 'Your booking request — AL-Rahma Academy',
      html: enrollmentStudentEmail({ name: data.name, teacherName: data.teacherName, plan: data.plan, bookingRef: enrollment.bookingRef }),
    });
  } catch (err) {
    logger.error('Failed to send enrollment confirmation email', { email: data.email, message: err.message });
  }

  res.status(201).json({ message: 'Booking request received', id: enrollment._id, bookingRef: enrollment.bookingRef });
});

// Scope correction (see docs/current-project-status.md): only online CARD/
// gateway payment is cancelled — plans, coupons, manual/offline payment
// bookkeeping, invoices, subscriptions, and bookings all stay supported.
// The booking journey itself still never accepts or displays payment-
// shaped data. Historical Enrollment documents may still carry the old
// offline-payment-bookkeeping fields (models/Enrollment.js) — excluded
// here so a student can never see them, even on their own old booking.
const FINANCIAL_FIELD_EXCLUSION = '-agreedAmount -currency -paymentMethodExternal -paidAt -renewalAt';

// @route  GET /api/enrollments/mine
// @access Student (own enrollment, matched by email)
export const getMyEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({ email: req.user.email })
    .select(FINANCIAL_FIELD_EXCLUSION)
    .sort('-createdAt')
    .lean();
  res.json(enrollment || null);
});

// Scope correction (see docs/current-project-status.md): the one admin
// action that links a booking to a registered account and activates their
// subscription/content access — end to end, in one transaction. Reuses
// services/subscriptionService.js's adminSetSubscription (the same
// free-form, admin-attested activation path PATCH /api/v1/admin/users/:id/
// subscription uses) and services/invoiceService.js's createInvoice
// verbatim — no new activation logic, just new wiring from a booking.
//
// @route  PATCH /api/v1/admin/enrollments/:id/approve
// @access Admin (enrollments:write)
export const approveEnrollment = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let enrollment;
  let user;
  try {
    await session.withTransaction(async () => {
      // Atomic claim: only a booking still awaiting a decision can be
      // approved — guards against a double-approve race or re-activating an
      // already-cancelled booking.
      enrollment = await Enrollment.findOneAndUpdate(
        { _id: req.params.id, status: { $in: ['pending', 'approved'] } },
        { $set: { status: 'enrolled' } },
        { session, new: true },
      );
      if (!enrollment) {
        const err = new Error('This booking is not awaiting approval — it may already be enrolled/cancelled, or does not exist');
        err.statusCode = 409;
        throw err;
      }

      user = await User.findOne({ email: enrollment.email }).session(session);
      if (!user) {
        const err = new Error(`No registered account found for ${enrollment.email} yet — ask the student to sign up, then retry.`);
        err.statusCode = 422;
        throw err;
      }

      await adminSetSubscription(user._id, { action: 'activate', plan: enrollment.plan, session });
      await createInvoice({ userId: user._id, email: user.email, name: user.name, planName: enrollment.plan, session });
    });
  } finally {
    session.endSession();
  }

  const activatedUser = await User.findById(user._id);

  await auditFromReq(
    req, 'enrollment.approve', 'Enrollment', enrollment._id,
    { status: 'pending' }, { status: 'enrolled', activatedUserId: activatedUser._id, subscription: activatedUser.subscription },
    'warning',
  );

  // Best-effort student email, after commit — never fails the request.
  // Approval itself (the part that matters — subscription activation) is
  // already committed above; this is a courtesy notice, not queued to the
  // outbox like the booking-creation emails (deliberately out of the scope
  // this correction targeted — a student who doesn't get this email still
  // sees their unlocked content on next login).
  const approvalEmailResult = await sendMail({
    to: activatedUser.email,
    subject: 'Your booking is approved — AL-Rahma Academy',
    html: bookingApprovedEmail({ name: activatedUser.name, plan: enrollment.plan }),
  });
  if (!approvalEmailResult.ok) {
    logger.error('Failed to send booking-approved email', { email: activatedUser.email, message: approvalEmailResult.error });
  }

  res.json({
    message: 'Booking approved and subscription activated',
    enrollment,
    user: { _id: activatedUser._id, name: activatedUser.name, email: activatedUser.email, subscription: activatedUser.subscription },
  });
});

// @route  GET /api/enrollments?page=1&limit=50
// @access Admin
export const getEnrollments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 500, maxLimit: 500 });
  const [data, total] = await Promise.all([
    Enrollment.find().sort('-createdAt').skip(skip).limit(limit).lean(),
    Enrollment.countDocuments(),
  ]);
  return sendPaginated(res, { data, total, page, limit });
});
