import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// AR-04, IP allowlist half: the two admin reads that moved to /api/v1/admin
// (the Trials and Newsletter tabs) must also be refused from an address
// outside ADMIN_IP_WHITELIST, even with a valid MFA-verified admin session.
//
// middleware/ipWhitelist.js reads ADMIN_IP_WHITELIST once at import, so it is
// set here before app.js is loaded (node --test runs each file in its own
// process). app.js trusts one proxy hop, so X-Forwarded-For sets req.ip the
// way the Vercel rewrite does in production.

const ALLOWED_IP = '198.51.100.7';
const OTHER_IP = '203.0.113.9';
const PATHS = ['/api/v1/admin/trials', '/api/v1/admin/newsletter'];

let app;
let AdminUser;
let signAccessToken;

before(async () => {
  process.env.ADMIN_IP_WHITELIST = ALLOWED_IP;
  ({ default: app } = await import('../app.js'));
  ({ default: AdminUser } = await import('../models/AdminUser.js'));
  ({ signAccessToken } = await import('../utils/adminAuthTokens.js'));
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function verifiedAdminCookie() {
  const admin = await AdminUser.create({
    name: 'Admin', email: `admin-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role: 'admin', mfaEnabled: true,
  });
  return `admin_at=${signAccessToken(admin._id, admin.role, true)}`;
}

test('an MFA-verified admin from an address outside the allowlist is refused on both moved reads', async () => {
  const cookie = await verifiedAdminCookie();
  for (const path of PATHS) {
    const res = await request(app).get(path).set('Cookie', cookie).set('X-Forwarded-For', OTHER_IP);
    assert.equal(res.status, 403, `${path} from ${OTHER_IP} expected 403, got ${res.status}`);
  }
});

test('the same admin from the allowed address is served', async () => {
  const cookie = await verifiedAdminCookie();
  for (const path of PATHS) {
    const res = await request(app).get(path).set('Cookie', cookie).set('X-Forwarded-For', ALLOWED_IP);
    assert.equal(res.status, 200, `${path} from ${ALLOWED_IP} expected 200, got ${res.status}`);
  }
});
