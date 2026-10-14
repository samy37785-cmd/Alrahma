import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import speakeasy from 'speakeasy';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Audit AR-10 and AR-11 on the admin TOTP step (POST /api/v1/admin/auth/mfa/verify):
//   AR-11: a code is accepted once. Replaying it, even within its 30 seconds,
//          or sending it twice in parallel, gets in at most once.
//   AR-10: a locked account cannot keep trying codes with a pre-auth token.
//
// A separate file from admin-auth-flow.test.js because /login allows 5 requests
// per 15 minutes per IP (config/adminRateLimits.js) and that file uses all 5.
// This one uses 4 logins and 5 /mfa/* requests (limit 10).

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Admin-Pass!';

async function makeMfaAdmin() {
  const admin = await AdminUser.create({ name: 'Test Admin', email: 'admin@example.com', password: ADMIN_PASSWORD, role: 'admin' });
  const secret = speakeasy.generateSecret({ length: 32 }).base32;
  admin.setMfaSecret(secret);
  admin.mfaEnabled = true;
  await admin.save({ validateBeforeSave: false });
  return { admin, secret };
}

// Password stage: returns an agent holding the pre-auth (stage "mfa") cookie.
async function passwordStage() {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/v1/admin/auth/login').set(csrf).send({ email: 'admin@example.com', password: ADMIN_PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.body.stage, 'mfa');
  return { agent, csrf };
}

const verify = ({ agent, csrf }, token) => agent.post('/api/v1/admin/auth/mfa/verify').set(csrf).send({ token });

test('AR-11: a code that already signed in is refused when replayed, and counts as a failed attempt', async () => {
  const { secret } = await makeMfaAdmin();
  const code = speakeasy.totp({ secret, encoding: 'base32' });

  assert.equal((await verify(await passwordStage(), code)).status, 200);

  const replay = await verify(await passwordStage(), code);
  assert.equal(replay.status, 401);
  assert.equal(replay.body.message, 'Invalid TOTP code');
  assert.equal((await AdminUser.findOne({ email: 'admin@example.com' })).failedLoginAttempts, 1);
});

test('AR-11: the same code sent twice in parallel signs in exactly once', async () => {
  const { secret } = await makeMfaAdmin();
  const [a, b] = [await passwordStage(), await passwordStage()];
  const code = speakeasy.totp({ secret, encoding: 'base32' });

  const statuses = (await Promise.all([verify(a, code), verify(b, code)])).map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 401]);
});

test('AR-10: while the account is locked, even a correct code is refused with 423 and nothing is recorded', async () => {
  const { secret } = await makeMfaAdmin();
  const session = await passwordStage();
  await AdminUser.updateOne({ email: 'admin@example.com' }, { $set: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } });

  const res = await verify(session, speakeasy.totp({ secret, encoding: 'base32' }));
  assert.equal(res.status, 423);
  assert.equal(res.body.code, 'ACCOUNT_LOCKED');
  const admin = await AdminUser.findOne({ email: 'admin@example.com' });
  assert.equal(admin.lastTotpStep, null);
  assert.equal(admin.lastLoginAt, null);
});
