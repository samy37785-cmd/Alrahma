import { body } from 'express-validator';
import TrialRequest from '../models/TrialRequest.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import { trialRequestAdminEmail, trialRequestStudentEmail } from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidationErrors } from '../utils/validationHelper.js';

// Mirrors contactController.js's contactValidation shape — same length caps,
// same real email-format check, applied to this form for the first time
// (previously only a manual `if (!name || !email)` truthy check).
export const trialValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 30 }),
  body('course').optional().trim().isLength({ max: 200 }),
  body('message').optional().trim().isLength({ max: 3000 }),
];

// @desc   Submit a free-trial request (from the React form)
// @route  POST /api/trials
// @access Public
export const createTrial = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;

  const { name, email, phone, course, message } = req.body;
  const trial = await TrialRequest.create({ name, email, phone, course, message });

  // Notify admin + confirm to student (non-blocking)
  const adminEmail = ADMIN_EMAIL();
  if (adminEmail) {
    sendMail({
      to: adminEmail,
      subject: `New Trial Request — ${name}`,
      html: trialRequestAdminEmail({ name, email, phone, course, message }),
    });
  }
  sendMail({
    to: email,
    subject: 'We received your trial request — AL-Rahma Academy',
    html: trialRequestStudentEmail({ name }),
  });

  res.status(201).json({ message: 'Trial request received', trial });
});

// @desc   List all trial requests (for the admin dashboard)
// @route  GET /api/trials
// @access Private/Admin
export const getTrials = asyncHandler(async (req, res) => {
  const trials = await TrialRequest.find().sort('-createdAt').lean();
  res.json(trials);
});
