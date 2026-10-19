import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';
import Coupon from '../models/Coupon.js';
import Blog from '../models/Blog.js';
import Review from '../models/Review.js';
import ContactMessage from '../models/ContactMessage.js';
import Course from '../models/Course.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
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
//
// All four PATCH endpoints below moved to /api/v1/admin/{coupons,blog,
// reviews,contact} (MFA + RBAC + audit-logged) as part of the B1
// legacy-route migration — see routes/v1/admin/.

const PASSWORD = 'Str0ngP@ssw0rd!';

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
  return { agent, csrf, cookieHeader };
}

// --------------------------------------------------------------------------
// Coupon
// --------------------------------------------------------------------------

test('updateCoupon: rejects an invalid discountType with 422', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const coupon = await Coupon.create({ code: 'SAVE10', discountType: 'percent', discountValue: 10 });

  const res = await agent.patch(`/api/v1/admin/coupons/${coupon._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ discountType: 'bogus' });
  assert.equal(res.status, 422);
});

test('updateCoupon: rejects a malformed code with 422', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const coupon = await Coupon.create({ code: 'SAVE10', discountType: 'percent', discountValue: 10 });

  const res = await agent.patch(`/api/v1/admin/coupons/${coupon._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ code: 'a' }); // too short, matches /^[A-Z0-9_-]{3,30}$/
  assert.equal(res.status, 422);
});

test('updateCoupon: cannot set usedCount or usedBy directly (mass-assignment fix)', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const student = await User.create({ name: 'Student', email: 'coupon-student@example.com', password: PASSWORD });
  const coupon = await Coupon.create({ code: 'SAVE10', discountType: 'percent', discountValue: 10 });

  const res = await agent.patch(`/api/v1/admin/coupons/${coupon._id}`).set({ ...csrf, Cookie: cookieHeader }).send({
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
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const coupon = await Coupon.create({ code: 'SAVE10', discountType: 'percent', discountValue: 10, description: 'Original' });

  const res = await agent.patch(`/api/v1/admin/coupons/${coupon._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ active: false });
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
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const post = await makePost();

  const res = await agent.patch(`/api/v1/admin/blog/${post._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ slug: 'Not A Valid Slug!' });
  assert.equal(res.status, 422);
});

test('updatePost: cannot set views directly (mass-assignment fix)', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const post = await makePost();

  const res = await agent.patch(`/api/v1/admin/blog/${post._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ views: 99999, title: 'Updated Title' });
  assert.equal(res.status, 200);

  const updated = await Blog.findById(post._id);
  assert.equal(updated.views, 0, 'views must not be settable via PATCH');
  assert.equal(updated.title, 'Updated Title', 'legitimate fields in the same request must still apply');
});

test('updatePost: a legitimate partial update changes only the given field', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const post = await makePost();

  const res = await agent.patch(`/api/v1/admin/blog/${post._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ published: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.post.published, true);
  assert.equal(res.body.post.title, 'A Post');
});

// --------------------------------------------------------------------------
// Review moderation
// --------------------------------------------------------------------------

test('moderateReview: rejects an invalid status with 422', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const student = await User.create({ name: 'Reviewer', email: 'reviewer@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 5, body: 'Great!' });

  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'bogus' });
  assert.equal(res.status, 422);

  const unchanged = await Review.findById(review._id);
  assert.equal(unchanged.status, 'pending', 'an invalid status must never be persisted');
});

test('moderateReview: a valid status is applied', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const student = await User.create({ name: 'Reviewer2', email: 'reviewer2@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 4, body: 'Good course' });

  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'approved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.status, 'approved');
});

test('moderateReview: updating adminNote alone (no status) still works, preserving existing behavior', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const student = await User.create({ name: 'Reviewer3', email: 'reviewer3@example.com', password: PASSWORD });
  const review = await Review.create({ student: student._id, course: student._id, rating: 3, body: 'Okay' });

  const res = await agent.patch(`/api/v1/admin/reviews/${review._id}/moderate`).set({ ...csrf, Cookie: cookieHeader }).send({ adminNote: 'Checked, looks fine' });
  assert.equal(res.status, 200);
  assert.equal(res.body.review.status, 'pending'); // unchanged
  assert.equal(res.body.review.adminNote, 'Checked, looks fine');
});

// --------------------------------------------------------------------------
// Contact status
// --------------------------------------------------------------------------

test('updateContactStatus: rejects an invalid status with 422', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const contact = await ContactMessage.create({ name: 'X', email: 'x@example.com', subject: 'Hi', message: 'A message here.' });

  const res = await agent.patch(`/api/v1/admin/contact/${contact._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'bogus' });
  assert.equal(res.status, 422);

  const unchanged = await ContactMessage.findById(contact._id);
  assert.equal(unchanged.status, 'new', 'an invalid status must never be persisted');
});

test('updateContactStatus: a valid status is applied, and resolving sets repliedAt', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const contact = await ContactMessage.create({ name: 'X', email: 'x2@example.com', subject: 'Hi', message: 'A message here.' });

  const res = await agent.patch(`/api/v1/admin/contact/${contact._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ status: 'resolved' });
  assert.equal(res.status, 200);
  assert.equal(res.body.contact.status, 'resolved');
  assert.ok(res.body.contact.repliedAt);
});

test('updateContactStatus: updating adminNote alone (no status) still works, preserving existing behavior', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const contact = await ContactMessage.create({ name: 'X', email: 'x3@example.com', subject: 'Hi', message: 'A message here.' });

  const res = await agent.patch(`/api/v1/admin/contact/${contact._id}`).set({ ...csrf, Cookie: cookieHeader }).send({ adminNote: 'Spam-like, monitoring' });
  assert.equal(res.status, 200);
  assert.equal(res.body.contact.status, 'new'); // unchanged
  assert.equal(res.body.contact.adminNote, 'Spam-like, monitoring');
});

// --------------------------------------------------------------------------
// Course
// --------------------------------------------------------------------------
// The console's course form saves whole `resources` and `modules` arrays.
// These tests pin what keeps that from erasing content: the admin read
// returns everything the form needs, a save built from it keeps every lesson
// and resource, and a save built from an older copy is refused with a 409.

const OLD_UPDATED_AT = new Date('2026-01-01T00:00:00.000Z');

async function createFullCourse() {
  const course = await Course.create({
    title: 'Tajweed', description: 'Rules of recitation', icon: '📗', level: 'Beginner',
    resources: [
      { type: 'pdf', label: 'Workbook', url: 'https://example.com/workbook.pdf' },
      { type: 'youtube', label: 'Playlist', url: 'https://example.com/playlist' },
    ],
    modules: [
      { title: 'Makharij', summary: 'Where letters come from', order: 0, lessons: [
        { title: 'Throat letters', type: 'video', url: 'https://example.com/l1', duration: '10 min', order: 0,
          resources: [{ type: 'pdf', label: 'Chart', url: 'https://example.com/chart.pdf' }] },
        { title: 'Tongue letters', type: 'text', content: 'Lesson text', order: 1 },
      ] },
      { title: 'Madd', order: 1, lessons: [{ title: 'Natural madd', type: 'link', url: 'https://example.com/l3' }] },
    ],
  });
  // A fixed, older updatedAt, so the first save always moves it.
  await Course.collection.updateOne({ _id: course._id }, { $set: { updatedAt: OLD_UPDATED_AT } });
  return course._id;
}

// What the console's form sends: the admin read's fields it edits, plus the
// updatedAt it loaded the course with.
function formBody(full, overrides = {}) {
  return {
    title: full.title, description: full.description, icon: full.icon, level: full.level,
    resources: full.resources ?? [], modules: full.modules ?? [],
    expectedUpdatedAt: full.updatedAt, ...overrides,
  };
}

function lessonTitles(course) {
  return course.modules.map((m) => m.lessons.map((l) => l.title));
}

test('updateCourse: the public list leaves out lessons and resources, the admin read does not', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const id = await createFullCourse();

  const pub = await agent.get('/api/courses');
  assert.equal(pub.status, 200);
  const listed = pub.body.find((c) => String(c._id) === String(id));
  assert.equal(listed.resources, undefined);
  assert.ok(listed.modules.every((m) => m.lessons === undefined));

  const full = await agent.get(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader });
  assert.equal(full.status, 200);
  assert.equal(full.body.resources.length, 2);
  assert.deepEqual(lessonTitles(full.body), [['Throat letters', 'Tongue letters'], ['Natural madd']]);
  assert.equal(full.body.updatedAt, OLD_UPDATED_AT.toISOString());
});

test('updateCourse: saving the admin read with a small change keeps every lesson and resource', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const id = await createFullCourse();
  const before = await Course.findById(id).lean();
  const full = (await agent.get(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })).body;

  const res = await agent.put(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })
    .send(formBody(full, { title: 'Tajweed for beginners' }));
  assert.equal(res.status, 200);

  const after = await Course.findById(id).lean();
  assert.equal(after.title, 'Tajweed for beginners');
  assert.deepEqual(after.resources, before.resources);
  assert.deepEqual(lessonTitles(after), lessonTitles(before));
  assert.deepEqual(
    after.modules.flatMap((m) => m.lessons.map((l) => String(l._id))),
    before.modules.flatMap((m) => m.lessons.map((l) => String(l._id))),
    'lessons keep their ids',
  );
  assert.deepEqual(after.modules[0].lessons[0].resources, before.modules[0].lessons[0].resources);
  assert.equal(after.modules[0].lessons[1].content, 'Lesson text');
  assert.equal(after.expectedUpdatedAt, undefined, 'the version check is never stored');
  assert.notEqual(after.updatedAt.getTime(), OLD_UPDATED_AT.getTime());
});

test('updateCourse: a save from a copy opened before another save is refused with 409 and changes nothing', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const id = await createFullCourse();
  const tabA = (await agent.get(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })).body;
  const tabB = (await agent.get(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })).body;

  // Tab B adds a lesson and saves first.
  const withNewLesson = tabB.modules.map((m, i) => (i === 1
    ? { ...m, lessons: [...m.lessons, { title: 'Connected madd', type: 'video', url: 'https://example.com/l4' }] }
    : m));
  const saveB = await agent.put(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })
    .send(formBody(tabB, { modules: withNewLesson }));
  assert.equal(saveB.status, 200);

  // Tab A still holds the old lessons and only changed the title.
  const saveA = await agent.put(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })
    .send(formBody(tabA, { title: 'Stale title' }));
  assert.equal(saveA.status, 409);
  assert.match(saveA.body.message, /changed after you opened it/);

  const after = await Course.findById(id).lean();
  assert.equal(after.title, 'Tajweed');
  assert.deepEqual(lessonTitles(after), [['Throat letters', 'Tongue letters'], ['Natural madd', 'Connected madd']]);

  // Opening it again gives the new version, which saves.
  const reopened = (await agent.get(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })).body;
  const retry = await agent.put(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })
    .send(formBody(reopened, { title: 'Fresh title' }));
  assert.equal(retry.status, 200);
  assert.deepEqual(lessonTitles(await Course.findById(id).lean())[1], ['Natural madd', 'Connected madd']);
});

test('updateCourse: an old course stored without resources/modules can be edited', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  // The shape of the real catalogue's courses: created before `resources`,
  // `modules` and `tags` existed, so the fields are absent, not empty.
  const { insertedId: id } = await Course.collection.insertOne({
    title: 'Quran reading', description: 'Learn to read', icon: '📘', level: 'All levels', price: 0,
    published: true, __v: 0, createdAt: OLD_UPDATED_AT, updatedAt: OLD_UPDATED_AT,
  });

  const full = (await agent.get(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })).body;
  assert.equal(full.resources, undefined, 'the admin read returns the stored document as is');
  assert.equal(full.modules, undefined);

  const res = await agent.put(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })
    .send(formBody(full, { description: 'Learn to read the Quran' }));
  assert.equal(res.status, 200);
  const after = await Course.findById(id).lean();
  assert.equal(after.description, 'Learn to read the Quran');
  assert.deepEqual(after.modules, []);
  assert.deepEqual(after.resources, []);
});

test('updateCourse: a request without expectedUpdatedAt keeps working and only changes the given field', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const id = await createFullCourse();

  const res = await agent.put(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader }).send({ title: 'Renamed' });
  assert.equal(res.status, 200);
  const after = await Course.findById(id).lean();
  assert.equal(after.title, 'Renamed');
  assert.deepEqual(lessonTitles(after), [['Throat letters', 'Tongue letters'], ['Natural madd']]);
});

test('updateCourse: a malformed expectedUpdatedAt is rejected with 422 and changes nothing', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const id = await createFullCourse();

  for (const expectedUpdatedAt of ['not-a-date', 1767225600000, null, { at: 'x' }]) {
    const res = await agent.put(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })
      .send({ title: 'Should not save', expectedUpdatedAt });
    assert.equal(res.status, 422, `expectedUpdatedAt=${JSON.stringify(expectedUpdatedAt)}`);
  }
  assert.equal((await Course.findById(id).lean()).title, 'Tajweed');
});

test('updateCourse: a viewer (courses:read only) cannot save a course', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent('viewer');
  const id = await createFullCourse();
  const full = (await agent.get(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })).body;

  const res = await agent.put(`/api/v1/admin/courses/${id}`).set({ ...csrf, Cookie: cookieHeader })
    .send(formBody(full, { title: 'Viewer edit' }));
  assert.equal(res.status, 403);
  assert.equal((await Course.findById(id).lean()).title, 'Tajweed');
});
