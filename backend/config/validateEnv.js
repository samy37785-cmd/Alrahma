import logger from './logger.js';
import { getDataBackend } from './dataBackend.js';

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
 * without them but specific features (cron, email) will be disabled or
 * degrade — this is an accepted, working design for these, confirmed by how
 * each is actually consumed (e.g. the mailer no-ops if unconfigured, the
 * cron route fails closed with 503 if CRON_SECRET is unset).
 *
 * Scope correction (see docs/current-project-status.md): only online CARD
 * payment (Stripe/PayPal checkout/capture/webhooks) is cancelled — those
 * routes are a fixed 410 regardless of what's set in the environment, so no
 * card-gateway secret (Stripe/PayPal keys, webhook secrets) is validated
 * here any more. Manual/offline payment bookkeeping, coupons, invoices, and
 * admin subscription activation are live again and never depended on a
 * gateway credential either way. This validator does not read or require
 * any of them; it does not, and never did, touch their actual values in
 * Render/Vercel.
 */

const REQUIRED = [
  'JWT_SECRET',
];

// Only required when DATA_BACKEND is NOT supabase (the default, mongodb,
// backend) — under DATA_BACKEND=supabase this app never opens a MongoDB
// connection (see server.js and app.js's isSupabaseBackend()-gated DB
// checks), so requiring MONGO_URI there would fail a valid Supabase-only
// deployment over a variable it will never use.
const MONGO_REQUIRED = [
  'MONGO_URI',
];

const ADMIN_CRITICAL = [
  'ADMIN_ENCRYPTION_KEY',
  'ADMIN_JWT_ACCESS_SECRET',
];

const RECOMMENDED = [
  'CRON_SECRET',
  'SMTP_USER',
  'SMTP_PASS',
  'CLIENT_URL',
];

// Stage 2E: only required when DATA_BACKEND=supabase (the default,
// mongodb, never touches these). Distinct names from MONGO_URI/JWT_SECRET —
// see data/supabase/client.js and data/supabase/authClients.js for how each
// is used.
const SUPABASE_REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  // Stage 2F: verifies the signature of the live GoTrue access token carried
  // in the admin_sat cookie, so admin AAL2 proof is read from a real,
  // signed Supabase JWT claim on every request — see
  // data/supabase/supabaseSessionCookie.js.
  'SUPABASE_JWT_SECRET',
];

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    logger.error('Server startup aborted — required environment variables are not set', { missing });
    process.exit(1);
  }

  if (getDataBackend() !== 'supabase') {
    const mongoMissing = MONGO_REQUIRED.filter((k) => !process.env[k]);
    if (mongoMissing.length) {
      logger.error('Server startup aborted — required environment variables are not set', { missing: mongoMissing });
      process.exit(1);
    }
  }

  if (getDataBackend() === 'supabase') {
    const supabaseMissing = SUPABASE_REQUIRED.filter((k) => !process.env[k]);
    if (supabaseMissing.length) {
      logger.error(
        'Server startup aborted — DATA_BACKEND=supabase but required Supabase environment variables are not set',
        { missing: supabaseMissing },
      );
      process.exit(1);
    }

    // Full production cutover: the gap this gate used to block on is
    // closed for real (0033_profiles_token_version.sql) — profiles.
    // token_version is bumped by the owner-only bump_token_version() RPC
    // from data/supabase/authController.js's updateMe()/resetPassword() on
    // every real password change/reset, and data/supabase/loadUser.js now
    // reads the real column instead of hardcoding tokenVersion: 0 —
    // middleware/auth.js's protect() therefore rejects a stale session's
    // token exactly the same way it always has under Mongo, with no
    // backend-specific code path. Verified end-to-end against a real local
    // GoTrue instance (backend/scripts/migration/rehearsal-password-reset-
    // e2e.mjs — a stale pre-reset/pre-update session is proven rejected
    // 401, not just asserted). The former SUPABASE_SESSION_INVALIDATION_
    // GAP_ACKNOWLEDGED bypass flag is removed entirely, not left as a
    // now-pointless no-op — there is nothing left to acknowledge.
  }

  const adminMissing = ADMIN_CRITICAL.filter((k) => !process.env[k]);
  if (adminMissing.length) {
    logger.error(
      'Admin login/MFA will NOT work — critical admin environment variables are not set. ' +
      'This will not fail requests until an admin actually tries to log in or set up MFA.',
      { missing: adminMissing },
    );
  }

  // T21 security audit: ipWhitelist middleware now fails closed (denies all
  // admin requests) in production when this is unset, instead of the old
  // fail-open "allow everyone" default. Logged loudly here — same rationale
  // as ADMIN_CRITICAL above — so a missing var is an obvious startup log
  // entry instead of a silent site-wide admin lockout discovered by an admin
  // getting 403s.
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

  // Corrective revision: an independent review found the booking admin-
  // notification email (controllers/enrollmentController.js) could silently
  // run in production on a single ADMIN_EMAIL fallback forever if
  // BOOKING_NOTIFICATION_RECIPIENTS was simply never set — the function
  // itself now also logs a warning every time that fallback is actually
  // used (config/mailer.js's BOOKING_NOTIFICATION_RECIPIENTS()), but that
  // only fires on the first booking. This is the startup-time signal, same
  // severity/pattern as ADMIN_IP_WHITELIST above, so a production
  // deployment missing it shows up immediately in the deploy log rather
  // than only being discoverable after the fact.
  if (process.env.NODE_ENV === 'production' && !process.env.BOOKING_NOTIFICATION_RECIPIENTS) {
    logger.error(
      'BOOKING_NOTIFICATION_RECIPIENTS is not set in production — booking notifications will fall back to a ' +
      'single ADMIN_EMAIL recipient instead of the full admin list. Set BOOKING_NOTIFICATION_RECIPIENTS=' +
      'email1,email2 explicitly.',
    );
  }
}
