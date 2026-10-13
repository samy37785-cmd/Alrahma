import TrialRequest from '../models/TrialRequest.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import {
  trialRequestAdminEmail, trialRequestAdminText,
  trialRequestStudentEmail, trialRequestStudentText,
} from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// @desc   Submit a free-trial request (from the React form)
// @route  POST /api/trials
// @access Public — input is validated by utils/trialValidation.js (mounted in
//         routes/trialRoutes.js); this handler only reads req.trialInput.
export const createTrial = asyncHandler(async (req, res) => {
  const { name, email, phone, course, message } = req.trialInput;

  const trial = await TrialRequest.create({
    name, email,
    ...(phone ? { phone } : {}),
    ...(course ? { course } : {}),
    ...(message ? { message } : {}),
  });

  // The address is passed as an object so Nodemailer never re-parses it as a
  // list; it was already proven to be exactly one bare address.
  const student = { name: '', address: email };
  const fields = { name, email, phone, course, message };

  // Notify admin + confirm to student (non-blocking)
  const adminEmail = ADMIN_EMAIL();
  if (adminEmail) {
    sendMail({
      to: adminEmail,
      replyTo: student,
      subject: 'New Trial Request',
      html: trialRequestAdminEmail(fields),
      text: trialRequestAdminText(fields),
      requestId: req.requestId ?? null,
    });
  }
  sendMail({
    to: student,
    subject: 'We received your trial request — AL-Rahma Academy',
    html: trialRequestStudentEmail({ name }),
    text: trialRequestStudentText({ name }),
    requestId: req.requestId ?? null,
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
