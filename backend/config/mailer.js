import nodemailer from 'nodemailer';
import logger from './logger.js';

// Lazy-initialise the transporter once (reused across calls).
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

// Warn once at startup if email is not configured, so dead emails are obvious
// in the logs instead of failing silently.
if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  logger.warn(
    'SMTP_USER / SMTP_PASS not set — ALL emails are disabled ' +
    '(password reset, enrolment & payment notifications will NOT be sent). ' +
    'Add a Gmail App Password to SMTP_PASS in .env to enable them.'
  );
}

// Generic send helper — skips (with a warning) if SMTP is not configured.
//
// Logging rule: never log the recipient, subject, body, or the transport's
// error message (SMTP errors can echo addresses back). Only a generic status,
// the transport's error code, and an optional caller-supplied requestId.
//
// `from` is always the configured sender; callers can never set it. `replyTo`
// is only passed by callers that have already strictly validated the address
// (see utils/trialValidation.js). `text` is an optional plain-text part.
export async function sendMail({ to, subject, html, text, replyTo, requestId = null }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('Skipped email — SMTP not configured', { requestId });
    return;
  }
  try {
    await getTransporter().sendMail({
      from: `"AL-Rahma Academy" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
    });
  } catch (err) {
    logger.error('Failed to send email', { requestId, code: err?.code ?? null });
  }
}

export const ADMIN_EMAIL = () => process.env.ADMIN_EMAIL || process.env.SMTP_USER || '';
