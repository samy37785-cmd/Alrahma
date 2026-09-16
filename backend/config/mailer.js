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

// Generic send helper. Corrective revision: this used to catch internally
// and return `undefined` on EVERY path (skipped, sent, or a real transport
// failure) — indistinguishable to a caller, and fatal for any code that
// wrapped a call in try/catch expecting a rejection to signal failure (an
// independent review found this meant enrollmentController.js's outbox
// queuing and cronController.js's retryFailedEmails success/failure
// detection were both dead code: a real SMTP error was logged here, then
// silently reported as "delivered" to every caller). Still never THROWS —
// several existing callers (trialController.js, certificateController.js,
// manualPaymentController.js) call this fire-and-forget with no try/catch
// at all, relying on that non-throwing contract; making it throw would turn
// every one of those into an unhandled rejection. Instead it now returns a
// real, inspectable result: `{ ok: true }` on a confirmed send, or
// `{ ok: false, error, skipped? }` otherwise — every caller that needs to
// know whether delivery actually happened (enrollment booking-notification
// outbox, retry-failed-emails) now checks `.ok` explicitly; callers that
// don't care can keep ignoring the return value exactly as before.
export async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('Skipped email — SMTP not configured', { subject, to });
    return { ok: false, error: 'SMTP_NOT_CONFIGURED', skipped: true };
  }
  try {
    await getTransporter().sendMail({
      from: `"AL-Rahma Academy" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (err) {
    logger.error('Failed to send email', { subject, to, message: err.message });
    return { ok: false, error: err.message };
  }
}

export const ADMIN_EMAIL = () => process.env.ADMIN_EMAIL || process.env.SMTP_USER || '';

// Simple syntax check — not RFC 5322-complete, but enough to catch a typo'd
// or truncated entry in a comma-separated env var before it reaches
// nodemailer as a "to" address.
const EMAIL_SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Comma-separated admin recipient list for booking notifications — same
// split(',').map(trim).filter(Boolean) idiom used elsewhere in this codebase
// for list-shaped env vars (see middleware/ipWhitelist.js). Validates each
// entry's syntax (a malformed one is dropped and logged, not silently sent
// to nodemailer) and case-insensitively deduplicates. Falls back to
// ADMIN_EMAIL() (as a single-entry list) so a deployment that hasn't set
// the new var yet still gets SOME notification rather than none — but that
// fallback is now LOUD (logged every time it's actually used), not silent:
// an independent review flagged that production, where two+ recipients are
// expected, could otherwise be quietly running on a single address with no
// visible signal. See config/validateEnv.js for the corresponding startup-
// time warning if the var is unset at all.
export function BOOKING_NOTIFICATION_RECIPIENTS() {
  const raw = process.env.BOOKING_NOTIFICATION_RECIPIENTS || '';
  const seen = new Set();
  const list = [];
  for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!EMAIL_SYNTAX_RE.test(entry)) {
      logger.warn('Ignoring malformed entry in BOOKING_NOTIFICATION_RECIPIENTS', { entry });
      continue;
    }
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(entry);
  }
  if (list.length > 0) return list;

  const fallback = ADMIN_EMAIL();
  if (fallback) {
    logger.warn(
      'BOOKING_NOTIFICATION_RECIPIENTS is not set (or had no valid entries) — falling back to a single ' +
      'ADMIN_EMAIL recipient. Set BOOKING_NOTIFICATION_RECIPIENTS explicitly in production so booking ' +
      'notifications reach the full admin list, not just one address.'
    );
    return [fallback];
  }
  return [];
}
