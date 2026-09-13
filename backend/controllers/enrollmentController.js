import { randomBytes } from 'node:crypto';
import Enrollment from '../models/Enrollment.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import { enrollmentAdminEmail, enrollmentStudentEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';
import { pickPublicBookingFields, normalizeWhatsapp } from '../utils/enrollmentValidation.js';
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

// @route  GET /api/enrollments/mine
// @access Student (own enrollment, matched by email)
export const getMyEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({ email: req.user.email }).sort('-createdAt').lean();
  res.json(enrollment || null);
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
