import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

const ADMIN_PASSWORD = 'Sup3r-Str0ng-Pass!';

// Model-level (no HTTP) coverage for AdminUser's brute-force lock, kept
// separate from admin-auth-flow.test.js on purpose: triggering the lock
// takes exactly 5 failed attempts, which is the SAME threshold as
// loginLimiter (5 req/15min, config/adminRateLimits.js) -- driving this
// through real HTTP requests would hit the IP-level rate limiter (429)
// before the 6th request could ever reach the controller to observe the
// account-level lock (423) specifically. Testing the model method directly
// exercises the actual lock logic without that unrelated collision.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

test('account locks after 5 failed attempts and unlocks after resetFailedAttempts', async () => {
  const admin = await AdminUser.create({
    name: 'Lockout Test', email: 'lockout@example.com', password: 'Sup3r-Str0ng-Pass!', role: 'admin',
  });

  assert.equal(admin.isLocked(), false);

  for (let i = 0; i < 4; i++) {
    await admin.incrementFailedAttempts();
    assert.equal(admin.isLocked(), false, `should not lock before the 5th failed attempt (attempt ${i + 1})`);
  }

  await admin.incrementFailedAttempts(); // 5th
  assert.equal(admin.failedLoginAttempts, 5);
  assert.equal(admin.isLocked(), true, 'should lock exactly on the 5th failed attempt');
  assert.ok(admin.lockedUntil > new Date());

  await admin.resetFailedAttempts();
  assert.equal(admin.isLocked(), false);
  assert.equal(admin.failedLoginAttempts, 0);
  assert.equal(admin.lockedUntil, null);
});

test('a locked account is rejected at login even with the correct password (423, not 401)', async () => {
  // Lock state is set directly rather than driven through 5 real failed HTTP
  // logins -- one HTTP request here keeps this file's loginLimiter usage
  // (5 req/15min) independent of the threshold-collision explained above.
  await AdminUser.create({
    name: 'Locked', email: 'locked@example.com', password: ADMIN_PASSWORD, role: 'admin',
    failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
  });

  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent
    .post('/api/v1/admin/auth/login')
    .set(csrf)
    .send({ email: 'locked@example.com', password: ADMIN_PASSWORD }); // correct password

  assert.equal(res.status, 423);
  assert.equal(res.body.code, 'ACCOUNT_LOCKED');
});
