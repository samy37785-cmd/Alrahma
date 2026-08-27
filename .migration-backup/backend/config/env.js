/**
 * Central, named access to every environment variable read outside config/.
 *
 * Every property is a live getter, NOT a snapshot: tests overwrite env vars
 * at runtime (tests/helpers/db.js swaps MONGO_URI in for the in-memory
 * replica set; several suites set CRON_SECRET/CLIENT_URL per-test), and
 * config/db.js documents the same late-read requirement. A frozen snapshot
 * taken at import time would silently break all of that.
 *
 * Adding a var? Add a getter here AND, if the app can't run without it,
 * add it to config/validateEnv.js. ESLint (no-restricted-properties) blocks
 * direct process.env reads outside config//scripts//tests/ so this list
 * stays the complete inventory of what the app consumes.
 */

const get = (name) => process.env[name];

export const env = {
  // Runtime mode
  get NODE_ENV() { return get('NODE_ENV'); },
  get npm_package_version() { return get('npm_package_version'); },

  // Core auth
  get JWT_SECRET() { return get('JWT_SECRET'); },
  get JWT_EXPIRES_IN() { return get('JWT_EXPIRES_IN'); },
  get GOOGLE_CLIENT_ID() { return get('GOOGLE_CLIENT_ID'); },

  // Admin auth subsystem
  get ADMIN_JWT_ACCESS_SECRET() { return get('ADMIN_JWT_ACCESS_SECRET'); },
  get ADMIN_IP_WHITELIST() { return get('ADMIN_IP_WHITELIST'); },

  // Frontend origin(s) + Vercel preview support
  get CLIENT_URL() { return get('CLIENT_URL'); },
  get VERCEL_URL() { return get('VERCEL_URL'); },
  get VERCEL_PREVIEW_SCOPE() { return get('VERCEL_PREVIEW_SCOPE'); },

  // Payments
  get STRIPE_SECRET_KEY() { return get('STRIPE_SECRET_KEY'); },
  get STRIPE_WEBHOOK_SECRET() { return get('STRIPE_WEBHOOK_SECRET'); },
  get PAYPAL_MODE() { return get('PAYPAL_MODE'); },
  get PAYPAL_CLIENT_ID() { return get('PAYPAL_CLIENT_ID'); },
  get PAYPAL_CLIENT_SECRET() { return get('PAYPAL_CLIENT_SECRET'); },
  get PAYPAL_WEBHOOK_ID() { return get('PAYPAL_WEBHOOK_ID'); },

  // Manual payment method display config (controllers/manualPaymentController.js
  // builds the user-facing method list from whichever of these are set)
  get PAYPAL_RECEIVER_EMAIL() { return get('PAYPAL_RECEIVER_EMAIL'); },
  get PAYPAL_ME_LINK() { return get('PAYPAL_ME_LINK'); },
  get PAYONEER_EMAIL() { return get('PAYONEER_EMAIL'); },
  get BANK_NAME() { return get('BANK_NAME'); },
  get BANK_ACCOUNT_NAME() { return get('BANK_ACCOUNT_NAME'); },
  get BANK_IBAN() { return get('BANK_IBAN'); },
  get BANK_SWIFT() { return get('BANK_SWIFT'); },
  get BANK_CURRENCY() { return get('BANK_CURRENCY'); },
  get BANK_COUNTRY() { return get('BANK_COUNTRY'); },
  get WU_RECEIVER_NAME() { return get('WU_RECEIVER_NAME'); },
  get WU_RECEIVER_CITY() { return get('WU_RECEIVER_CITY'); },
  get WU_RECEIVER_COUNTRY() { return get('WU_RECEIVER_COUNTRY'); },
  get MG_RECEIVER_NAME() { return get('MG_RECEIVER_NAME'); },
  get MG_RECEIVER_CITY() { return get('MG_RECEIVER_CITY'); },
  get MG_RECEIVER_COUNTRY() { return get('MG_RECEIVER_COUNTRY'); },

  // Email
  get SMTP_USER() { return get('SMTP_USER'); },
  get EMAIL_FROM() { return get('EMAIL_FROM'); },
  get ADMIN_EMAIL() { return get('ADMIN_EMAIL'); },

  // Cron / features
  get CRON_SECRET() { return get('CRON_SECRET'); },
  get RENEWAL_REMINDER_DAYS() { return get('RENEWAL_REMINDER_DAYS'); },
  get AI_TUTOR_DAILY_MESSAGE_LIMIT() { return get('AI_TUTOR_DAILY_MESSAGE_LIMIT'); },
};

export default env;
