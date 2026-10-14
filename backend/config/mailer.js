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

// Render's Free plan blocks outbound SMTP: on Production every Gmail SMTP send
// timed out (ETIMEDOUT after ~120 s, found 2026-10-14). With RESEND_API_KEY set,
// mail goes through Resend's HTTPS API instead; SMTP stays as the fallback.
// EMAIL_FROM must be an address on a domain verified in Resend.
const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'AL-Rahma Academy <no-reply@al-rahmaacademy.com>';
const RESEND_TIMEOUT_MS = 15_000;

export function mailProvider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return null;
}

// Warn once at startup if email is not configured, so dead emails are obvious
// in the logs instead of failing silently.
if (!mailProvider()) {
  logger.warn(
    'No email provider configured (RESEND_API_KEY, or SMTP_USER / SMTP_PASS) — ALL emails are disabled ' +
    '(password reset, enrolment & payment notifications will NOT be sent).'
  );
}

// Callers may pass nodemailer-style addresses ({ name, address }), which
// Resend does not take: it wants "Name <address>" strings.
function toResendAddress(value) {
  if (Array.isArray(value)) return value.map(toResendAddress);
  if (value && typeof value === 'object') {
    return value.name ? `${String(value.name).replace(/[<>"]/g, '')} <${value.address}>` : value.address;
  }
  return value;
}

async function sendViaResend({ to, subject, html, text, replyTo }) {
  // Replies to the no-reply sender reach the academy inbox unless the caller
  // set its own (already validated) reply-to.
  const reply = replyTo || process.env.EMAIL_REPLY_TO || ADMIN_EMAIL();
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: toResendAddress(to),
      subject,
      html,
      ...(text ? { text } : {}),
      ...(reply ? { reply_to: toResendAddress(reply) } : {}),
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Only the status reaches the log: Resend's error body can echo addresses.
    const err = new Error('Resend request failed');
    err.code = `HTTP_${res.status}`;
    throw err;
  }
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
  const provider = mailProvider();
  if (!provider) {
    logger.warn('Skipped email — no email provider configured', { requestId });
    return;
  }
  try {
    if (provider === 'resend') {
      await sendViaResend({ to, subject, html, text, replyTo });
      return;
    }
    await getTransporter().sendMail({
      from: `"AL-Rahma Academy" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
    });
  } catch (err) {
    logger.error('Failed to send email', { requestId, code: err?.code ?? err?.name ?? null });
  }
}

export const ADMIN_EMAIL = () => process.env.ADMIN_EMAIL || process.env.SMTP_USER || '';
