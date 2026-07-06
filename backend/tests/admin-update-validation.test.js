import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import Coupon from '../models/Coupon.js';
import Blog from '../models/Blog.js';
import Review from '../models/Review.js';
import ContactMessage from '../models/ContactMessage.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Coverage for T8: coupon/blog/review/contact PATCH ("update") endpoints
// previously had no validation at all (or, for coupon/blog, forwarded raw
// req.body straight into Mongoose with no field allowlist — a
// mass-assignment gap letting a PATCH set system-managed fields like
// Coupon.usedCount/usedBy or Blog.views). These tests prove: (1) malformed
// values are now rejected the same way create already rejected them, (2)
// system-managed fields can no longer be set via PATCH, and (3) legitimate
// partial updates still work exactly as before.

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeAdminAgent() {
  const { agent, csrf } = await agentWithCsrf(app);
  const email = `admin${Date.now()}${Math.random()}@example.com`;
  await User.create({ name: 'Admin', email, password: PASSWORD, role: 'admin' });
  const login = await agent.post('/api/auth/login').set(csrf).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, csrf };
}

// --------------------------------------------------------------------------
// Coupon
// --------------------------------------------------------------------------

test('updateCoupon: rejects an invalid discountType with 422', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const coupon = await Coupon.create({ code: 'SAVE10', discountType: 'percent', discountValue: 10 });

  const res = await agent.patch(`/api/coupons/${coupon._id}`).set(csrf).send({ discountType: 'bogus' });
  assert.equal(res.status, 422);
});

test('updateCoupon: rejects a malformed code with 422', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const coupon = await Coupon.create({ code: 'SAVE10', discountType: 'percent', discountValue: 10 });

  const res = await agent.patch(`/api/coupons/${coupon._id}`).set(csrf).send({ code: 'a' }); // too short, matches /^[A-Z0-9_-]{3,30}$/
  assert.equal(res.status, 422);
});

test('updateCoupon: cannot set usedCount or usedBy directly (mass-assignment fix)', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const student = await User.create({ name: 'Student', email: 'coupon-student@example.com', password: PASSWORD });
  const coupon = await Coupon.create({ code: 'SAVE10', discountType: 'percent', discountValue: 10 });

  const res = await agent.patch(`/api/coupons/${coupon._id}`).set(csrf).send({
    usedCount: 999,
    usedBy: [{ user: student._id }],
    active: false, // a legitimate field, sent alongside — should still apply
  });

  assert.equal(res.status, 200);
  const updated = await Coupon.findById(coupon._id);
  assert.equal(updated.usedCount, 0, 'usedCount must not be settable via PATCH');
  assert.equal(updated.usedBy.length, 0, 'usedBy must not be settable via PATCH');
  assert.equal(updated.active, false, 'legitimate fields in the same request must still apply');
});

test('updateCoupon: a legitimate partial update changes only the given field', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const coupon = await Coupon.create({ code: 'SAVE10', discountType: 'percent', discountValue: 10, description: 'Original' });

  const res = await agent.patch(`/api/coupons/${coupon._id}`).set(csrf).send({ active: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.coupon.active, false);
  assert.equal(res.body.coupon.description, 'Original');
  assert.equal(res.body.coupon.code, 'SAVE10');
});

// --------------------------------------------------------------------------
// Blog
// --------------------------------------------------------------------------

async function makePost(overrides = {}) {
  return Blog.create({
    slug: 'a-post', title: 'A Post', excerpt: 'An excerpt', body: 'Body text',
    author: { name: 'Al-Rahma Team' }, ...overrides,
  });
}

test('updatePost: rejects a malformed slug with 422', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const post = await makePost();

  const res = await agent.patch(`/api/blog/${post._id}`).set(csrf).send({ slug: 'Not A Valid Slug!' });
  assert.equal(res.status, 422);
});

test('updatePost: cannot set views directly (mass-assignment fix)', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const post = await makePost();

  const res = await agent.patch(`/api/blog/${post._id}`).set(csrf).send({ views: 99999, title: 'Updated Title' });
  assert.equal(res.status, 200);

  const updated = await Blog.findById(post._id);
  assert.equal(updated.views, 0, 'views must not be settable via PATCH');
  assert.equal(updated.title, 'Updated Title', 'legitimate fields in the same request must still apply');
});

test('updatePost: a legitimate partial update changes only the given field', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const post = await makePost();

  const res = await agent.patch(`/api/blog/${post._id}`).set(csrf).send({ published: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.post.published, true);
  assert.equal(res.body.post.title, 'A Post');
});

// --------------------------------------------------------------------------
// Review moderation
// --------------------------------------------------------------------------

test('moderateReview: rejects an invalid status with 422', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const student = await User.create({ name: 'Reviewer', email: 'reviewer@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 5, body: 'Great!' });

  const res = await agent.patch(`/api/reviews/${review._id}/moderate`).set(csrf).send({ status: 'bogus' });
  assert.equal(res.status, 422);

  const unchanged = await Review.findById(review._id);
  assert.equal(unchanged.status, 'pending', 'an invalid status must never be persisted');
});

test('moderateReview: a valid status is applied', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const student = await User.create({ name: 'Reviewer2', email: 'reviewer2@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 4, body: 'Good course' });

  const res = await agent.patch(`/api/reviews/${review._id}/moderate`).set(csrf).send({ status: 'approved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.status, 'approved');
});

test('moderateReview: updating adminNote alone (no status) still works, preserving existing behavior', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const student = await User.create({ name: 'Reviewer3', email: 'reviewer3@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 3, body: 'Okay' });

  const res = await agent.patch(`/api/reviews/${review._id}/moderate`).set(csrf).send({ adminNote: 'Checked, looks fine' });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.status, 'pending'); // unchanged
  assert.equal(res.body.review.adminNote, 'Checked, looks fine');
});

// --------------------------------------------------------------------------
// Contact status
// --------------------------------------------------------------------------

test('updateContactStatus: rejects an invalid status with 422', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const contact = await ContactMessage.create({ name: 'X', email: 'x@example.com', subject: 'Hi', message: 'A message here.' });

  const res = await agent.patch(`/api/contact/${contact._id}`).set(csrf).send({ status: 'bogus' });
  assert.equal(res.status, 422);

  const unchanged = await ContactMessage.findById(contact._id);
  assert.equal(unchanged.status, 'new', 'an invalid status must never be persisted');
});

test('updateContactStatus: a valid status is applied, and resolving sets repliedAt', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const contact = await ContactMessage.create({ name: 'X', email: 'x2@example.com', subject: 'Hi', message: 'A message here.' });

  const res = await agent.patch(`/api/contact/${contact._id}`).set(csrf).send({ status: 'resolved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.contact.status, 'resolved');
  assert.ok(res.body.contact.repliedAt);
});

test('updateContactStatus: updating adminNote alone (no status) still works, preserving existing behavior', async () => {
  const { agent, csrf } = await makeAdminAgent();
  const contact = await ContactMessage.create({ name: 'X', email: 'x3@example.com', subject: 'Hi', message: 'A message here.' });

  const res = await agent.patch(`/api/contact/${contact._id}`).set(csrf).send({ adminNote: 'Spam-like, monitoring' });
  assert.equal(res.status, 200);
  assert.equal(res.body.contact.status, 'new'); // unchanged
  assert.equal(res.body.contact.adminNote, 'Spam-like, monitoring');
});
