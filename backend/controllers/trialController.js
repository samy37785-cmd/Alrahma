import TrialRequest from '../models/TrialRequest.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import { trialRequestAdminEmail, trialRequestStudentEmail } from '../templates/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// @desc   Submit a free-trial request (from the React form)
// @route  POST /api/trials
// @access Public
export const createTrial = asyncHandler(async (req, res) => {
  const { name, email, phone, course, message } = req.body;
  if (!name || !email) {
    res.status(400);
    throw new Error('Name and email are required');
  }

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
