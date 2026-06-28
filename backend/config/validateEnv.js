import logger from './logger.js';

/**
 * Validates environment variables at process startup.
 *
 * REQUIRED vars: if any are absent the process exits immediately with a clear
 * message — a missing JWT_SECRET or MONGO_URI renders the entire service
 * non-functional and is not recoverable at runtime.
 *
 * RECOMMENDED vars: absence is logged as a warning.  The service can start
 * without them but specific features (payments, admin MFA, email) will be
 * disabled or degrade.
 */

const REQUIRED = [
  'JWT_SECRET',
  'MONGO_URI',
];

const RECOMMENDED = [
  'ADMIN_ENCRYPTION_KEY',
  'ADMIN_JWT_ACCESS_SECRET',
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

  const absent = RECOMMENDED.filter((k) => !process.env[k]);
  if (absent.length) {
    logger.warn('Recommended environment variables not set — some features will be disabled', { absent });
  }
}
