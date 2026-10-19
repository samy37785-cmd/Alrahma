import mongoose from 'mongoose';
import TrialRequest from '../models/TrialRequest.js';
import { sendMail, ADMIN_EMAIL } from '../config/mailer.js';
import {
  trialRequestAdminEmail, trialRequestAdminText,
  trialRequestStudentEmail, trialRequestStudentText,
} from '../config/emailTemplates.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditFromReq } from '../services/auditService.js';

// "instagram / social / ramadan" for the admin email; null without tags.
function campaignLabel(utm) {
  if (!utm) return null;
  return [utm.source, utm.medium, utm.campaign].filter(Boolean).join(' / ');
}

// @desc   Submit a free-trial request (from the React form)
// @route  POST /api/trials
// @access Public — input is validated by utils/trialValidation.js (mounted in
//         routes/trialRoutes.js); this handler only reads req.trialInput.
export const createTrial = asyncHandler(async (req, res) => {
  const { name, email, phone, course, message } = req.trialInput;
  const { heardFrom, formSource, utm } = req.trialSource;

  const trial = await TrialRequest.create({
    name, email,
    ...(phone ? { phone } : {}),
    ...(course ? { course } : {}),
    ...(message ? { message } : {}),
    ...(heardFrom ? { heardFrom } : {}),
    ...(formSource ? { formSource } : {}),
    ...(utm ? { utm } : {}),
  });

  // The address is passed as an object so Nodemailer never re-parses it as a
  // list; it was already proven to be exactly one bare address.
  const student = { name: '', address: email };
  const fields = { name, email, phone, course, message, heardFrom, campaign: campaignLabel(utm) };

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
// @route  GET /api/v1/admin/trials
// @access Admin API (MFA + IP allowlist + enrollments:read)
export const getTrials = asyncHandler(async (req, res) => {
  const trials = await TrialRequest.find().sort('-createdAt').lean();
  res.json(trials);
});

const TRIAL_STATUSES = TrialRequest.schema.path('status').enumValues;

// @desc   Change a trial request's follow-up status (new / contacted /
//         scheduled, in any direction)
// @route  PATCH /api/v1/admin/trials/:id/status
// @access Admin API (MFA + IP allowlist + enrollments:write)
// Only the status changes, and only when an admin sets it: nothing changes
// old requests on its own, and nobody is emailed or messaged. The audit log
// keeps the old and new status only, not the person's contact details.
export const updateTrialStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  const { status } = req.body ?? {};
  if (typeof status !== 'string' || !TRIAL_STATUSES.includes(status)) {
    return res.status(422).json({ message: `status must be one of: ${TRIAL_STATUSES.join(', ')}` });
  }

  // Writes only when the status really changes, and returns the previous
  // value from the same atomic update, so the audit entry is exact even if
  // two admins change it at once.
  const previous = await TrialRequest.findOneAndUpdate(
    { _id: id, status: { $ne: status } },
    { $set: { status } },
    { new: false, projection: { status: 1 } },
  ).lean();

  const trial = await TrialRequest.findById(id).lean();
  if (!trial) return res.status(404).json({ message: 'Trial request not found' });

  if (previous) {
    await auditFromReq(req, 'trial.status_change', 'TrialRequest', trial._id, { status: previous.status ?? null }, { status });
  }
  return res.json(trial);
});
