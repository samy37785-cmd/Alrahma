import logger from './logger.js';

/**
 * Validates environment variables at process startup.
 *
 * REQUIRED vars: if any are absent the process exits immediately with a clear
 * message — a missing JWT_SECRET or MONGO_URI renders the entire service
 * non-functional and is not recoverable at runtime.
 *
 * ADMIN_CRITICAL vars: without these, admin login/MFA cannot function at all
 * (see config/encryption.js) — as non-functional, in that subsystem, as a
 * missing REQUIRED var. They are NOT promoted to REQUIRED (i.e. this does
 * NOT process.exit) because that hasn't been confirmed safe against the live
 * Render environment — if either is actually unset there today, exiting here
 * would take the entire site down on next deploy instead of just admin
 * login. Logged at error (not warn) severity so it's impossible to miss in
 * startup logs. TODO(owner): once ADMIN_ENCRYPTION_KEY and
 * ADMIN_JWT_ACCESS_SECRET are confirmed set in the Render dashboard, move
 * them into REQUIRED above so a future missing key fails the deploy loudly
 * instead of failing silently at the first admin login attempt.
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
];

const ADMIN_CRITICAL = [
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
];

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    logger.error('Server startup aborted — required environment variables are not set', { missing });
    process.exit(1);
  }

  const adminMissing = ADMIN_CRITICAL.filter((k) => !process.env[k]);
  if (adminMissing.length) {
    logger.error(
      'Admin login/MFA will NOT work — critical admin environment variables are not set. ' +
      'This will not fail requests until an admin actually tries to log in or set up MFA.',
      { missing: adminMissing },
    );
  }

  const absent = RECOMMENDED.filter((k) => !process.env[k]);
  if (absent.length) {
    logger.warn('Recommended environment variables not set — some features will be disabled', { absent });
  }
}
