import Enrollment from '../models/Enrollment.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import { enrollmentAdminEmail, enrollmentStudentEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, sendPaginated } from '../utils/pagination.js';
import logger from '../config/logger.js';

// @route  POST /api/enrollments
// @access Public
export const createEnrollment = asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data.name || !data.email) {
    res.status(400);
    throw new Error('Name and email are required');
  }

  const enrollment = await Enrollment.create(data);

  // Admin notification — fire-and-forget (non-critical)
  const adminEmail = ADMIN_EMAIL();
  if (adminEmail) {
    sendMail({
      to: adminEmail,
      subject: `📋 New Enrollment — ${data.name} (${data.teacherName || 'no teacher yet'})`,
      html: enrollmentAdminEmail(data),
    });
  }

  // Student confirmation — await so we know it delivered; failure is logged but
  // does not roll back the enrollment (it's already saved to the DB).
  try {
    await sendMail({
      to: data.email,
      subject: 'Your enrollment request — AL-Rahma Academy',
      html: enrollmentStudentEmail({ name: data.name, teacherName: data.teacherName, plan: data.plan }),
    });
  } catch (err) {
    logger.error('Failed to send enrollment confirmation email', { email: data.email, message: err.message });
  }

  res.status(201).json({ message: 'Enrollment received', id: enrollment._id });
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
