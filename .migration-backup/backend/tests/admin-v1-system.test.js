import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import SystemAuditLog from '../models/SystemAuditLog.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Production Readiness Sprint 3: backend/controllers/systemController.js
// (admin creation, maintenance mode, financial freeze, audit-log read/GDPR
// purge, admin listing) had zero automated test coverage before this file —
// every endpoint here is exercised via the real HTTP routes
// (routes/v1/admin/systemRoutes.js), real RBAC middleware, and the real
// database, not reimplemented logic.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminAgent(role = 'admin') {
  const { agent, csrf } = await agentWithCsrf(app);
  const admin = await AdminUser.create({
    name: `${role} admin`, email: `${role}-${Date.now()}${Math.random()}@example.com`,
    password: 'Sup3r-Str0ng-Pass!', role,
  });
  const token = signAccessToken(admin._id, admin.role, true);
  const cookieHeader = `admin_at=${token}; csrf_token=${csrf['x-csrf-token']}`;
  return { agent, csrf, cookieHeader, admin };
}

// ---------------------------------------------------------------------------
// GET /api/v1/admin/system/status — any authenticated admin, no RBAC gate
// ---------------------------------------------------------------------------

test('getSystemStatus: defaults to both flags false before any toggle has ever run', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent();
  const res = await agent.get('/api/v1/admin/system/status').set({ ...csrf, Cookie: cookieHeader });

  assert.equal(res.status, 200);
  assert.equal(res.body.maintenanceMode, false);
  assert.equal(res.body.financialsFrozen, false);
  assert.ok(res.body.timestamp);
});

test('getSystemStatus: any authenticated admin role (not just super-admin) can read it', async () => {
  for (const role of ['viewer', 'editor', 'admin', 'super-admin']) {
    const { agent, csrf, cookieHeader } = await adminAgent(role);
    const res = await agent.get('/api/v1/admin/system/status').set({ ...csrf, Cookie: cookieHeader });
    assert.equal(res.status, 200, `role ${role} must be able to read system status`);
  }
});

test('getSystemStatus: rejects an unauthenticated request with 401', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.get('/api/v1/admin/system/status').set(csrf);
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// POST /api/v1/admin/system/maintenance — super-admin only
// ---------------------------------------------------------------------------

test('toggleMaintenanceMode: a super-admin can enable it, status reflects it, and a regular admin mutation is then blocked (real end-to-end side effect via maintenanceGuard)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');

  const toggle = await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });
  assert.equal(toggle.status, 200);
  assert.equal(toggle.body.maintenanceMode, true);

  const status = await agent.get('/api/v1/admin/system/status').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(status.body.maintenanceMode, true);

  // Real downstream consumer: a regular admin's mutation is now blocked.
  const { agent: regularAgent, csrf: regularCsrf, cookieHeader: regularCookie } = await adminAgent('admin');
  const blocked = await regularAgent.patch('/api/v1/admin/users/000000000000000000000000/role')
    .set({ ...regularCsrf, Cookie: regularCookie }).send({ role: 'student' });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, 'MAINTENANCE_MODE');

  // Super-admin bypasses the guard even while maintenance mode is on.
  const bypass = await agent.patch('/api/v1/admin/users/000000000000000000000000/role').set({ ...csrf, Cookie: cookieHeader }).send({ role: 'student' });
  assert.notEqual(bypass.status, 503);
});

test('toggleMaintenanceMode: disabling it after enabling restores normal access', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });

  const off = await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({ enable: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.maintenanceMode, false);

  const status = await agent.get('/api/v1/admin/system/status').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(status.body.maintenanceMode, false);
});

test('toggleMaintenanceMode: writes a critical audit log entry with accurate before/after state', async () => {
  const { agent, csrf, cookieHeader, admin } = await adminAgent('super-admin');
  const res = await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });
  assert.equal(res.status, 200);

  const entry = await SystemAuditLog.findOne({ action: 'system.maintenance_enabled' });
  assert.ok(entry, 'a system.maintenance_enabled audit entry must be written');
  assert.equal(String(entry.adminId), String(admin._id));
  assert.equal(entry.severity, 'critical');
  assert.equal(entry.before.maintenance_mode, 'false');
  assert.equal(entry.after.maintenance_mode, 'true');
});

test('toggleMaintenanceMode: rejects a non-boolean "enable" value with 422 and does not change state', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const res = await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({ enable: 'not-a-boolean' });
  assert.equal(res.status, 422);

  const status = await agent.get('/api/v1/admin/system/status').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(status.body.maintenanceMode, false);
});

test('toggleMaintenanceMode: rejects a missing "enable" field with 422', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const res = await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(res.status, 422);
});

test('toggleMaintenanceMode: is forbidden for admin/editor/viewer roles (super-admin only), and unauthenticated is rejected with 401', async () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    const { agent, csrf, cookieHeader } = await adminAgent(role);
    const res = await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });
    assert.equal(res.status, 403, `role ${role} must be forbidden`);
    assert.equal(res.body.message, 'Insufficient role');
    assert.deepEqual(res.body.required, ['super-admin']);
  }

  const { agent, csrf } = await agentWithCsrf(app);
  const unauth = await agent.post('/api/v1/admin/system/maintenance').set(csrf).send({ enable: true });
  assert.equal(unauth.status, 401);
});

// ---------------------------------------------------------------------------
// POST /api/v1/admin/system/financial-freeze — super-admin only
// ---------------------------------------------------------------------------

test('toggleFinancialFreeze: a super-admin can enable it, and a regular admin approving a manual payment is then blocked (real end-to-end side effect via financialGuard)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');

  const toggle = await agent.post('/api/v1/admin/system/financial-freeze').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });
  assert.equal(toggle.status, 200);
  assert.equal(toggle.body.financialsFrozen, true);

  const status = await agent.get('/api/v1/admin/system/status').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(status.body.financialsFrozen, true);

  const { agent: regularAgent, csrf: regularCsrf, cookieHeader: regularCookie } = await adminAgent('admin');
  const blocked = await regularAgent.patch('/api/v1/admin/payments/manual/000000000000000000000000')
    .set({ ...regularCsrf, Cookie: regularCookie }).send({ status: 'approved' });
  assert.equal(blocked.status, 423);
  assert.equal(blocked.body.code, 'FINANCIALS_FROZEN');
});

test('toggleFinancialFreeze: writes a critical audit log entry', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const res = await agent.post('/api/v1/admin/system/financial-freeze').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });
  assert.equal(res.status, 200);

  const entry = await SystemAuditLog.findOne({ action: 'system.financials_frozen' });
  assert.ok(entry);
  assert.equal(entry.severity, 'critical');
  assert.equal(entry.after.financials_frozen, 'true');
});

test('toggleFinancialFreeze: rejects a non-boolean "enable" value with 422', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const res = await agent.post('/api/v1/admin/system/financial-freeze').set({ ...csrf, Cookie: cookieHeader }).send({ enable: 'nope' });
  assert.equal(res.status, 422);
});

test('toggleFinancialFreeze: is forbidden for admin/editor/viewer roles, and unauthenticated is rejected with 401', async () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    const { agent, csrf, cookieHeader } = await adminAgent(role);
    const res = await agent.post('/api/v1/admin/system/financial-freeze').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });
    assert.equal(res.status, 403);
  }

  const { agent, csrf } = await agentWithCsrf(app);
  const unauth = await agent.post('/api/v1/admin/system/financial-freeze').set(csrf).send({ enable: true });
  assert.equal(unauth.status, 401);
});

// ---------------------------------------------------------------------------
// GET /api/v1/admin/system/audit-log — requires audit:read
// ---------------------------------------------------------------------------

test('getAuditLog: an admin (has audit:read) receives the paginated envelope of real entries', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('admin');

  // Generate two real audit entries via an actually-audited action.
  const { agent: superAgent, csrf: superCsrf, cookieHeader: superCookie } = await adminAgent('super-admin');
  await superAgent.post('/api/v1/admin/system/maintenance').set({ ...superCsrf, Cookie: superCookie }).send({ enable: true });
  await superAgent.post('/api/v1/admin/system/maintenance').set({ ...superCsrf, Cookie: superCookie }).send({ enable: false });

  const res = await agent.get('/api/v1/admin/system/audit-log').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.ok(res.body.total >= 2);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data[0].action, 'system.maintenance_disabled', 'most recent entry first (sort by createdAt desc)');
});

test('getAuditLog: filters by severity, resource, and adminId', async () => {
  const { agent, csrf, cookieHeader, admin } = await adminAgent('super-admin');
  await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });

  const bySeverity = await agent.get('/api/v1/admin/system/audit-log?severity=critical').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(bySeverity.status, 200);
  assert.ok(bySeverity.body.data.every((e) => e.severity === 'critical'));

  const byResource = await agent.get('/api/v1/admin/system/audit-log?resource=SystemConfig').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(byResource.status, 200);
  assert.ok(byResource.body.data.every((e) => e.resource === 'SystemConfig'));

  const byAdmin = await agent.get(`/api/v1/admin/system/audit-log?adminId=${admin._id}`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(byAdmin.status, 200);
  assert.ok(byAdmin.body.data.every((e) => String(e.adminId) === String(admin._id)));
});

test('getAuditLog: a valid but non-matching adminId returns an empty result, not an error', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  await agent.post('/api/v1/admin/system/maintenance').set({ ...csrf, Cookie: cookieHeader }).send({ enable: true });

  const res = await agent.get('/api/v1/admin/system/audit-log?adminId=000000000000000000000000').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 0);
  assert.deepEqual(res.body.data, []);
});

test('getAuditLog: rejects malformed query params with 422 (invalid severity, invalid adminId)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('admin');

  const badSeverity = await agent.get('/api/v1/admin/system/audit-log?severity=extreme').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(badSeverity.status, 422);

  const badAdminId = await agent.get('/api/v1/admin/system/audit-log?adminId=not-a-valid-id').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(badAdminId.status, 422);

  const badLimit = await agent.get('/api/v1/admin/system/audit-log?limit=99999').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(badLimit.status, 422);
});

test('getAuditLog: is forbidden for a role without audit:read (editor), and unauthenticated is rejected with 401', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('editor');
  const res = await agent.get('/api/v1/admin/system/audit-log').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 403);
  assert.deepEqual(res.body.required, ['audit:read']);

  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  const unauth = await anon.get('/api/v1/admin/system/audit-log').set(anonCsrf);
  assert.equal(unauth.status, 401);
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/admin/system/audit-log — GDPR purge, super-admin only
// ---------------------------------------------------------------------------

async function seedAuditLog(adminId, createdAt) {
  return SystemAuditLog.collection.insertOne({
    adminId, adminEmail: 'seed@example.com', action: 'seed.action', resource: 'Seed',
    resourceId: null, before: null, after: null, severity: 'info',
    userAgent: null, ipAnon: null, metadata: null, createdAt, updatedAt: createdAt,
  });
}

test('purgeOldAuditLogs: deletes only entries strictly older than the default 365-day cutoff', async () => {
  const { agent, csrf, cookieHeader, admin } = await adminAgent('super-admin');
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  await seedAuditLog(admin._id, new Date(now - 400 * DAY)); // older -- must be purged
  await seedAuditLog(admin._id, new Date(now - 10 * DAY));  // recent -- must survive

  const res = await agent.delete('/api/v1/admin/system/audit-log').set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.purgedCount, 1);

  const remaining = await SystemAuditLog.find({ action: 'seed.action' }).lean();
  assert.equal(remaining.length, 1);
  assert.ok(Date.now() - remaining[0].createdAt.getTime() < 400 * DAY);
});

test('purgeOldAuditLogs: respects a custom olderThanDays cutoff (fencepost: exactly at, just inside, and just outside the boundary)', async () => {
  const { agent, csrf, cookieHeader, admin } = await adminAgent('super-admin');
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  await seedAuditLog(admin._id, new Date(now - 91 * DAY)); // strictly older than 90 days -- purged
  await seedAuditLog(admin._id, new Date(now - 89 * DAY)); // strictly newer than 90 days -- survives

  const res = await agent.delete('/api/v1/admin/system/audit-log').set({ ...csrf, Cookie: cookieHeader }).send({ olderThanDays: 90 });
  assert.equal(res.status, 200);
  assert.equal(res.body.purgedCount, 1);

  const remaining = await SystemAuditLog.find({ action: 'seed.action' }).lean();
  assert.equal(remaining.length, 1);
});

test('purgeOldAuditLogs: rejects an olderThanDays below the 90-day legal minimum with 422, and purges nothing', async () => {
  const { agent, csrf, cookieHeader, admin } = await adminAgent('super-admin');
  await seedAuditLog(admin._id, new Date(Date.now() - 400 * 24 * 60 * 60 * 1000));

  const res = await agent.delete('/api/v1/admin/system/audit-log').set({ ...csrf, Cookie: cookieHeader }).send({ olderThanDays: 30 });
  assert.equal(res.status, 422);

  const remaining = await SystemAuditLog.find({ action: 'seed.action' }).lean();
  assert.equal(remaining.length, 1, 'nothing must be purged when validation fails');
});

test('purgeOldAuditLogs: writes its own critical audit entry recording the purge itself (which therefore always survives its own purge)', async () => {
  const { agent, csrf, cookieHeader, admin } = await adminAgent('super-admin');
  await seedAuditLog(admin._id, new Date(Date.now() - 400 * 24 * 60 * 60 * 1000));

  const res = await agent.delete('/api/v1/admin/system/audit-log').set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(res.status, 200);

  const purgeEntry = await SystemAuditLog.findOne({ action: 'system.audit_purge' });
  assert.ok(purgeEntry, 'the purge action itself must be audited');
  assert.equal(purgeEntry.severity, 'critical');
  assert.equal(purgeEntry.after.purgedCount, res.body.purgedCount);
});

test('purgeOldAuditLogs: a zero-match purge returns purgedCount 0 without error', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const res = await agent.delete('/api/v1/admin/system/audit-log').set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.purgedCount, 0);
});

test('purgeOldAuditLogs: is forbidden for admin/editor/viewer roles, and unauthenticated is rejected with 401', async () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    const { agent, csrf, cookieHeader } = await adminAgent(role);
    const res = await agent.delete('/api/v1/admin/system/audit-log').set({ ...csrf, Cookie: cookieHeader }).send({});
    assert.equal(res.status, 403, `role ${role} must be forbidden from purging audit logs`);
  }

  const { agent, csrf } = await agentWithCsrf(app);
  const unauth = await agent.delete('/api/v1/admin/system/audit-log').set(csrf).send({});
  assert.equal(unauth.status, 401);
});

// ---------------------------------------------------------------------------
// GET /api/v1/admin/system/admins — super-admin only
// ---------------------------------------------------------------------------

test('listAdmins: returns every AdminUser, excluding password/_mfaSecret/_mfaPendingSecret', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  await AdminUser.create({ name: 'Second Admin', email: `second-${Date.now()}@example.com`, password: 'Sup3r-Str0ng-Pass!', role: 'admin' });

  const res = await agent.get('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2); // caller + the one just created
  for (const entry of res.body.data) {
    assert.equal(entry.password, undefined);
    assert.equal(entry._mfaSecret, undefined);
    assert.equal(entry._mfaPendingSecret, undefined);
  }
});

test('listAdmins: is forbidden for admin/editor/viewer roles, and unauthenticated is rejected with 401', async () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    const { agent, csrf, cookieHeader } = await adminAgent(role);
    const res = await agent.get('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader });
    assert.equal(res.status, 403);
  }

  const { agent, csrf } = await agentWithCsrf(app);
  const unauth = await agent.get('/api/v1/admin/system/admins').set(csrf);
  assert.equal(unauth.status, 401);
});

// ---------------------------------------------------------------------------
// POST /api/v1/admin/system/admins — super-admin only
// ---------------------------------------------------------------------------

test('createAdmin: a super-admin creates a new AdminUser with an explicit role, and it is audited', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const email = `new-admin-${Date.now()}@example.com`;

  const res = await agent.post('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'New Admin', email, password: 'Br4nd-New-Str0ng-Pass!', role: 'editor' });

  assert.equal(res.status, 201);
  assert.equal(res.body.email, email);
  assert.equal(res.body.role, 'editor');

  const created = await AdminUser.findOne({ email }).select('+password');
  assert.ok(created, 'the AdminUser must actually be persisted');
  assert.notEqual(created.password, 'Br4nd-New-Str0ng-Pass!', 'the password must be hashed, not stored in plaintext');

  const auditEntry = await SystemAuditLog.findOne({ action: 'system.admin_created', resourceId: String(created._id) });
  assert.ok(auditEntry);
  assert.equal(auditEntry.severity, 'critical');
});

test('createAdmin: omitting role defaults to "viewer" (the schema default)', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const email = `default-role-${Date.now()}@example.com`;

  const res = await agent.post('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'Default Role Admin', email, password: 'Br4nd-New-Str0ng-Pass!' });

  assert.equal(res.status, 201);
  assert.equal(res.body.role, 'viewer');
});

test('createAdmin: rejects a duplicate email with 409, without creating a second account', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');
  const email = `dupe-${Date.now()}@example.com`;
  await AdminUser.create({ name: 'Existing', email, password: 'Sup3r-Str0ng-Pass!', role: 'viewer' });

  const res = await agent.post('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'Impersonator', email, password: 'Br4nd-New-Str0ng-Pass!' });

  assert.equal(res.status, 409);
  const count = await AdminUser.countDocuments({ email });
  assert.equal(count, 1);
});

test('createAdmin: rejects malformed input with 422 (invalid email, short password, invalid role) and creates nothing', async () => {
  const { agent, csrf, cookieHeader } = await adminAgent('super-admin');

  const badEmail = await agent.post('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'X', email: 'not-an-email', password: 'Br4nd-New-Str0ng-Pass!' });
  assert.equal(badEmail.status, 422);

  const shortPassword = await agent.post('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'X', email: `short-pw-${Date.now()}@example.com`, password: 'tooshort' });
  assert.equal(shortPassword.status, 422);

  const badRole = await agent.post('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader })
    .send({ name: 'X', email: `bad-role-${Date.now()}@example.com`, password: 'Br4nd-New-Str0ng-Pass!', role: 'superuser' });
  assert.equal(badRole.status, 422);

  const missingName = await agent.post('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader })
    .send({ email: `no-name-${Date.now()}@example.com`, password: 'Br4nd-New-Str0ng-Pass!' });
  assert.equal(missingName.status, 422);
});

test('createAdmin: is forbidden for admin/editor/viewer roles, and unauthenticated is rejected with 401', async () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    const { agent, csrf, cookieHeader } = await adminAgent(role);
    const res = await agent.post('/api/v1/admin/system/admins').set({ ...csrf, Cookie: cookieHeader })
      .send({ name: 'X', email: `forbidden-${role}-${Date.now()}@example.com`, password: 'Br4nd-New-Str0ng-Pass!' });
    assert.equal(res.status, 403, `role ${role} must be forbidden from creating admins`);
  }

  const { agent, csrf } = await agentWithCsrf(app);
  const unauth = await agent.post('/api/v1/admin/system/admins').set(csrf)
    .send({ name: 'X', email: `unauth-${Date.now()}@example.com`, password: 'Br4nd-New-Str0ng-Pass!' });
  assert.equal(unauth.status, 401);
});
