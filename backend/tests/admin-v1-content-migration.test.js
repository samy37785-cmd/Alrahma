import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import Blog from '../models/Blog.js';
import ContactMessage from '../models/ContactMessage.js';
import Certificate from '../models/Certificate.js';
import Review from '../models/Review.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import SystemAuditLog from '../models/SystemAuditLog.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// B1 (Production Readiness Audit): completes the migration of every
// remaining privileged admin mutation route off the legacy protect+adminOnly
// stack (middleware/auth.js) onto the hardened /api/v1/admin API
// (verifyAccessToken TOTP-MFA session + requirePermissions RBAC +
// auditFromReq audit logging — see routes/v1/admin/{blog,coupons,contact,
// certificates,referrals,reviews}Routes.js). Coupon and referral mutation
// coverage lives in tests/coupon.test.js and tests/referral.test.js
// respectively; this file covers blog, contact, certificates, reviews, and
// confirms the courses/enrollments legacy mutation routes (which already had
// a hardened /api/v1/admin equivalent before this migration) are gone too.

const STUDENT_PASSWORD = 'Stud3nt-Str0ng-Pass!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function adminUserAgent(role = 'admin') {
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
// Blog
// ---------------------------------------------------------------------------

test('POST /api/v1/admin/blog creates a post and writes an audit log entry', async () => {
  const { agent, csrf, cookieHeader, admin } = await adminUserAgent();
  const res = await agent.post('/api/v1/admin/blog').set({ ...csrf, Cookie: cookieHeader }).send({
    slug: 'new-post', title: 'New Post', excerpt: 'An excerpt', body: 'Body text',
    author: { name: 'Al-Rahma Team' },
  });

  assert.equal(res.status, 201);
  const post = await Blog.findOne({ slug: 'new-post' });
  assert.ok(post, 'post must be persisted');

  const auditEntry = await SystemAuditLog.findOne({ action: 'blog.create', resourceId: String(post._id) });
  assert.ok(auditEntry, 'a blog.create audit entry must be written');
  assert.equal(String(auditEntry.adminId), String(admin._id));
});

test('DELETE /api/v1/admin/blog/:id deletes a post and writes an audit log entry', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const post = await Blog.create({
    slug: 'delete-me', title: 'Delete Me', excerpt: 'x', body: 'x', author: { name: 'Al-Rahma Team' },
  });

  const res = await agent.delete(`/api/v1/admin/blog/${post._id}`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);
  assert.equal(await Blog.findById(post._id), null);

  const auditEntry = await SystemAuditLog.findOne({ action: 'blog.delete', resourceId: String(post._id) });
  assert.ok(auditEntry, 'a blog.delete audit entry must be written');
});

test('POST /api/v1/admin/blog is forbidden for a viewer (no blog:write) and rejects unauthenticated requests', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent('viewer');
  const forbidden = await agent.post('/api/v1/admin/blog').set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(forbidden.status, 403);

  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  const unauthenticated = await anon.post('/api/v1/admin/blog').set(anonCsrf).send({});
  assert.equal(unauthenticated.status, 401);
});

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

test('PATCH /api/v1/admin/contact/:id updates status and writes an audit log entry', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const contact = await ContactMessage.create({ name: 'X', email: 'x@example.com', subject: 'Hi', message: 'A real message here.' });

  const res = await agent.patch(`/api/v1/admin/contact/${contact._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'resolved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.contact.status, 'resolved');

  const auditEntry = await SystemAuditLog.findOne({ action: 'contact.status.update', resourceId: String(contact._id) });
  assert.ok(auditEntry, 'a contact.status.update audit entry must be written');
});

test('PATCH /api/v1/admin/contact/:id is forbidden for a viewer (no contact:write) and rejects unauthenticated requests', async () => {
  const contact = await ContactMessage.create({ name: 'X', email: 'x2@example.com', subject: 'Hi', message: 'A real message here.' });
  const { agent, csrf, cookieHeader } = await adminUserAgent('viewer');
  const forbidden = await agent.patch(`/api/v1/admin/contact/${contact._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'resolved' });
  assert.equal(forbidden.status, 403);

  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  const unauthenticated = await anon.patch(`/api/v1/admin/contact/${contact._id}`).set(anonCsrf).send({ status: 'resolved' });
  assert.equal(unauthenticated.status, 401);
});

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

test('POST /api/v1/admin/certificates issues a certificate, records the issuing admin, and writes an audit log entry', async () => {
  const { agent, csrf, cookieHeader, admin } = await adminUserAgent();
  const student = await User.create({ name: 'Student', email: `cert-${Date.now()}@example.com`, password: STUDENT_PASSWORD });

  const res = await agent.post('/api/v1/admin/certificates').set({ ...csrf, Cookie: cookieHeader }).send({
    userId: student._id.toString(), type: 'completion', title: 'Course Completion',
  });

  assert.equal(res.status, 201);
  const cert = await Certificate.findById(res.body._id);
  assert.ok(cert, 'certificate must be persisted');
  assert.equal(cert.issuedBy, admin.name, 'issuedBy must be sourced from req.adminUser, not req.user');

  const auditEntry = await SystemAuditLog.findOne({ action: 'certificate.issue', resourceId: String(cert._id) });
  assert.ok(auditEntry, 'a certificate.issue audit entry must be written');
});

test('DELETE /api/v1/admin/certificates/:id revokes a certificate and writes an audit log entry', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const student = await User.create({ name: 'Student2', email: `cert2-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  const cert = await Certificate.create({ user: student._id, studentName: student.name, type: 'completion', title: 'X' });

  const res = await agent.delete(`/api/v1/admin/certificates/${cert._id}`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(res.status, 200);

  const updated = await Certificate.findById(cert._id);
  assert.equal(updated.revoked, true);

  const auditEntry = await SystemAuditLog.findOne({ action: 'certificate.revoke', resourceId: String(cert._id) });
  assert.ok(auditEntry, 'a certificate.revoke audit entry must be written');
});

test('POST /api/v1/admin/certificates is forbidden for a viewer (no certificates:write) and rejects unauthenticated requests', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent('viewer');
  const forbidden = await agent.post('/api/v1/admin/certificates').set({ ...csrf, Cookie: cookieHeader }).send({});
  assert.equal(forbidden.status, 403);

  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  const unauthenticated = await anon.post('/api/v1/admin/certificates').set(anonCsrf).send({});
  assert.equal(unauthenticated.status, 401);
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

test('PATCH /api/v1/admin/reviews/:id/moderate moderates a review and writes an audit log entry', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const student = await User.create({ name: 'Reviewer', email: `reviewer-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 5, body: 'Great!' });

  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.status, 'approved');

  const auditEntry = await SystemAuditLog.findOne({ action: 'review.moderate', resourceId: String(review._id) });
  assert.ok(auditEntry, 'a review.moderate audit entry must be written');
});

test('PATCH /api/v1/admin/reviews/:id/moderate is forbidden for a viewer (no reviews:write) and rejects unauthenticated requests', async () => {
  const student = await User.create({ name: 'Reviewer2', email: `reviewer2-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 4, body: 'Good' });
  const { agent, csrf, cookieHeader } = await adminUserAgent('viewer');
  const forbidden = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(forbidden.status, 403);

  const { agent: anon, csrf: anonCsrf } = await agentWithCsrf(app);
  const unauthenticated = await anon.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set(anonCsrf).send({ status: 'approved' });
  assert.equal(unauthenticated.status, 401);
});

// ---------------------------------------------------------------------------
// Courses / Enrollments — already had a hardened /api/v1/admin equivalent
// before this migration (routes/v1/admin/coursesRoutes.js,
// enrollmentsRoutes.js); this migration only removed the duplicate legacy
// mutation routes. Confirms the v1 admin routes still work and the legacy
// duplicates are gone.
// ---------------------------------------------------------------------------

test('POST/PUT/DELETE /api/v1/admin/courses still work after removing the legacy duplicate routes', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();

  const create = await agent.post('/api/v1/admin/courses').set({ ...csrf, Cookie: cookieHeader })
    .send({ title: 'New Course', description: 'x' });
  assert.equal(create.status, 201);

  const update = await agent.put(`/api/v1/admin/courses/${create.body._id}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ title: 'Updated Course' });
  assert.equal(update.status, 200);
  assert.equal(update.body.title, 'Updated Course');

  // courses:delete is super-admin only (see ROLE_PERMISSIONS in
  // models/AdminUser.js and tests/admin-rbac.test.js) — unaffected by this
  // migration, so a fresh super-admin session is used for the delete step.
  const { agent: superAgent, csrf: superCsrf, cookieHeader: superCookie } = await adminUserAgent('super-admin');
  const del = await superAgent.delete(`/api/v1/admin/courses/${create.body._id}`).set({ ...superCsrf, Cookie: superCookie });
  assert.equal(del.status, 200);
  assert.equal(await Course.findById(create.body._id), null);
});

test('legacy POST/PUT/DELETE /api/courses admin mutation routes no longer exist (404)', async () => {
  const course = await Course.create({ title: 'X', description: 'x', published: true });
  const { agent, csrf } = await agentWithCsrf(app);

  const create = await agent.post('/api/courses').set(csrf).send({ title: 'Y', description: 'y' });
  assert.equal(create.status, 404);

  const update = await agent.put(`/api/courses/${course._id}`).set(csrf).send({ title: 'Z' });
  assert.equal(update.status, 404);

  const del = await agent.delete(`/api/courses/${course._id}`).set(csrf);
  assert.equal(del.status, 404);
});

test('legacy PATCH /api/enrollments/:id admin mutation route no longer exists (404)', async () => {
  const enrollment = await Enrollment.create({ name: 'Student', email: 'enroll@example.com' });
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.patch(`/api/enrollments/${enrollment._id}`).set(csrf).send({ status: 'contacted' });
  assert.equal(res.status, 404);
});

test('PUT /api/v1/admin/enrollments/:id still works after removing the legacy duplicate route', async () => {
  const enrollment = await Enrollment.create({ name: 'Student', email: 'enroll2@example.com' });
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const res = await agent.put(`/api/v1/admin/enrollments/${enrollment._id}`).set({ ...csrf, Cookie: cookieHeader })
    .send({ status: 'contacted' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'contacted');
});

// ---------------------------------------------------------------------------
// Certificate legacy route removal
// ---------------------------------------------------------------------------

test('legacy POST/DELETE /api/certificates admin mutation routes no longer exist (404)', async () => {
  const student = await User.create({ name: 'S', email: `legacy-cert-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  const cert = await Certificate.create({ user: student._id, studentName: student.name, type: 'completion', title: 'X' });
  const { agent, csrf } = await agentWithCsrf(app);

  const create = await agent.post('/api/certificates').set(csrf).send({ userId: student._id.toString(), title: 'Y' });
  assert.equal(create.status, 404);

  const del = await agent.delete(`/api/certificates/${cert._id}`).set(csrf);
  assert.equal(del.status, 404);
});

// ---------------------------------------------------------------------------
// Blog / reviews legacy route removal (contact and coupons are covered in
// admin-authorization-consolidation.test.js and coupon.test.js respectively)
// ---------------------------------------------------------------------------

test('legacy POST/PATCH/DELETE /api/blog admin mutation routes no longer exist (404)', async () => {
  const post = await Blog.create({ slug: 'legacy-post', title: 'X', excerpt: 'x', body: 'x', author: { name: 'Team' } });
  const { agent, csrf } = await agentWithCsrf(app);

  const create = await agent.post('/api/blog').set(csrf).send({});
  assert.equal(create.status, 404);

  const update = await agent.patch(`/api/blog/${post._id}`).set(csrf).send({ title: 'Y' });
  assert.equal(update.status, 404);

  const del = await agent.delete(`/api/blog/${post._id}`).set(csrf);
  assert.equal(del.status, 404);
});

test('legacy PATCH /api/reviews/:id/moderate no longer exists (404)', async () => {
  const student = await User.create({ name: 'S2', email: `legacy-review-${Date.now()}@example.com`, password: STUDENT_PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 5, body: 'x' });
  const { agent, csrf } = await agentWithCsrf(app);

  const res = await agent.patch(`/api/reviews/${review._id}/moderate`).set(csrf).send({ status: 'approved' });
  assert.equal(res.status, 404);
});
