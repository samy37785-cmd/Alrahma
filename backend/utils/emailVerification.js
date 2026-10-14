import crypto from 'crypto';
import { hashToken } from './hashToken.js';
import { siteOrigin } from '../config/site.js';
import { sendMail } from '../config/mailer.js';
import { verifyEmailTemplate } from '../config/emailTemplates.js';

// Audit AR-02: an account could claim a guest booking or invoice just by
// signing up with the same email, without proving it owns that address.
// New accounts and changed emails now start unconfirmed and get a link;
// data matched only by email (guest bookings, invoices) waits for it.

export const EMAIL_VERIFY_TTL_MS = 48 * 60 * 60 * 1000;

// Accounts created before email confirmation existed have no field at all and
// count as confirmed, so nobody already registered loses access. Only an
// explicit `false` (set at sign-up or on an email change) means unconfirmed.
export const isEmailVerified = (user) => user?.emailVerified !== false;

// Like the reset link (AR-18), the token travels in the fragment.
export const verifyLink = (rawToken) => `${siteOrigin()}/verify-email#token=${rawToken}`;

// Marks the user unconfirmed with a fresh token (the hash is stored, never the
// raw value) and returns the raw token for the email. The caller saves.
export function startEmailVerification(user) {
  const raw = crypto.randomBytes(32).toString('hex');
  user.emailVerified     = false;
  user.emailVerifyToken  = hashToken(raw);
  user.emailVerifyExpiry = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
  return raw;
}

export function markEmailVerified(user) {
  user.emailVerified     = true;
  user.emailVerifyToken  = undefined;
  user.emailVerifyExpiry = undefined;
}

// Not awaited by callers: sendMail never throws (config/mailer.js), and the
// response must not wait for SMTP.
export function sendVerificationEmail(user, rawToken) {
  return sendMail({
    to: user.email,
    subject: 'Confirm your email — Al-Rahma Academy',
    html: verifyEmailTemplate({ name: user.name, link: verifyLink(rawToken) }),
  });
}
