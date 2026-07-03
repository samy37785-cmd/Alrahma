import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// RBAC coverage for the v1 admin API (middleware/rbac.js: requirePermissions)
// -- previously untested. Signs access tokens directly the same way
// adminAuthController does after a real login, rather than driving the
// full login/MFA HTTP flow, since only the permission check itself is under
// test here and this avoids any interaction with loginLimiter/mfaLimiter.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminCookie(role) {
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}@example.com`, password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  return `admin_at=${token}`;
}

test("editor role lacks courses:delete -- rejected with 403 and the required permission listed", async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const cookie = await adminCookie('editor');

  const res = await agent
    .delete('/api/v1/admin/courses/000000000000000000000000')
    .set({ ...csrf, Cookie: `${cookie}; csrf_token=${csrf['x-csrf-token']}` })
    .send();

  assert.equal(res.status, 403);
  assert.deepEqual(res.body.required, ['courses:delete']);
});

test("super-admin role has courses:delete -- passes RBAC (404 for a nonexistent id, not 403)", async () => {
  // Regular 'admin' deliberately does NOT have courses:delete (only
  // 'super-admin' does -- see ROLE_PERMISSIONS in models/AdminUser.js), so
  // this uses super-admin specifically to exercise the "has permission" path.
  const { agent, csrf } = await agentWithCsrf(app);
  const cookie = await adminCookie('super-admin');

  const res = await agent
    .delete('/api/v1/admin/courses/000000000000000000000000')
    .set({ ...csrf, Cookie: `${cookie}; csrf_token=${csrf['x-csrf-token']}` })
    .send();

  assert.equal(res.status, 404); // got past RBAC; just no such course
});

test("viewer role can read but not write courses", async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const cookie = await adminCookie('viewer');
  const cookieHeader = `${cookie}; csrf_token=${csrf['x-csrf-token']}`;

  const read = await agent.get('/api/v1/admin/courses').set({ ...csrf, Cookie: cookieHeader }).send();
  assert.equal(read.status, 200);

  const write = await agent
    .post('/api/v1/admin/courses')
    .set({ ...csrf, Cookie: cookieHeader })
    .send({ title: 'Should not be created', description: 'x' });
  assert.equal(write.status, 403);
});
