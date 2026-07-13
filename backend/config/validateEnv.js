import logger from './logger.js';

/**
 * Validates environment variables at process startup.
 *
 * REQUIRED vars: if any are absent the process exits immediately with a clear
 * message — a missing JWT_SECRET, MONGO_URI, ADMIN_ENCRYPTION_KEY, or
 * ADMIN_JWT_ACCESS_SECRET renders the entire service (or, for the latter
 * two, the entire admin/MFA subsystem) non-functional and is not
 * recoverable at runtime. ADMIN_ENCRYPTION_KEY/ADMIN_JWT_ACCESS_SECRET were
 * previously logged-only (not fatal) because it hadn't been confirmed they
 * were actually set in the live Render environment — confirmed as of this
 * change, so a missing key now fails the deploy loudly instead of failing
 * silently at the first admin login attempt.
 *
 * RECOMMENDED vars: absence is logged as a warning. The service can start
 * without them but specific features (payments, cron, email) will be
 * disabled or degrade — this is an accepted, working design for these,
 * confirmed by how each is actually consumed (e.g. the mailer no-ops if
 * unconfigured, the cron route fails closed with 503 if CRON_SECRET is
 * unset).
 */

const REQUIRED = [
  'JWT_SECRET',
  'MONGO_URI',
  'ADMIN_ENCRYPTION_KEY',
  'ADMIN_JWT_ACCESS_SECRET',
];

const RECOMMENDED = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CRON_SECRET',
  'SMTP_USER',
  'SMTP_PASS',
  'CLIENT_URL',
  'ANTHROPIC_API_KEY',
];

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    logger.error('Server startup aborted — required environment variables are not set', { missing });
    process.exit(1);
  }

  // T21 security audit: ipWhitelist middleware now fails closed (denies all
  // admin requests) in production when this is unset, instead of the old
  // fail-open "allow everyone" default. Logged loudly here — same "make it
  // impossible to miss" rationale as the REQUIRED vars above — so a missing
  // var is an obvious startup log entry instead of a silent site-wide admin
  // lockout discovered by an admin getting 403s.
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_IP_WHITELIST) {
    logger.error(
      'ADMIN_IP_WHITELIST is not set in production — the admin API will deny ALL requests ' +
      '(fail-closed). Set ADMIN_IP_WHITELIST to restore admin access.',
    );
  }

  const absent = RECOMMENDED.filter((k) => !process.env[k]);
  if (absent.length) {
    logger.warn('Recommended environment variables not set — some features will be disabled', { absent });
  }
}
