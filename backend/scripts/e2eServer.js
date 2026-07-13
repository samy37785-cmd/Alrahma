/**
 * Boots the REAL Express app against an in-memory MongoDB replica set and
 * seeds one student account, so the Playwright e2e suite (repo root /e2e)
 * exercises production code paths — real CSRF, real auth cookies, real
 * rate limiting — with zero external dependencies. Local + CI only; never
 * part of any deployment.
 *
 * Reuses tests/helpers/db.js so the e2e database behaves exactly like the
 * backend test suite's (single-node replica set, transactions work).
 */

// Required env must exist BEFORE app.js is imported — validateEnv() runs at
// import time and exits the process on a missing var. Placeholder values
// only, mirroring the CI backend-test job; MONGO_URI is overwritten by
// setupTestDb() with the in-memory replica set's URI.
process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'e2e-jwt-secret-not-a-real-secret';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/placeholder';
process.env.ADMIN_ENCRYPTION_KEY ||=
  '0000000000000000000000000000000000000000000000000000000000000000';
process.env.ADMIN_JWT_ACCESS_SECRET ||= 'e2e-admin-jwt-secret-not-a-real-secret';
// Vite preview origin (frontend/vite.config.js) — CORS + auth-cookie origin.
process.env.CLIENT_URL ||= 'http://localhost:4173';

const { setupTestDb } = await import('../tests/helpers/db.js');
await setupTestDb();

const { default: app } = await import('../app.js');
const { default: User } = await import('../models/User.js');

// Credentials duplicated in e2e/support/constants.mjs — keep in sync.
await User.create({
  name: 'E2E Student',
  email: 'e2e.student@alrahma.test',
  password: 'E2e!Passw0rd42',
  role: 'student',
});

const PORT = Number(process.env.E2E_BACKEND_PORT || 5000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console -- Playwright's webServer readiness log
  console.log(`[e2e] backend + in-memory MongoDB ready on :${PORT}`);
});
