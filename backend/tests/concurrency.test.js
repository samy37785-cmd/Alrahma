import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import Certificate from '../models/Certificate.js';
import Invoice from '../models/Invoice.js';
import Course from '../models/Course.js';
import CourseProgress from '../models/CourseProgress.js';
import Wishlist from '../models/Wishlist.js';
import Review from '../models/Review.js';
import StudentRecord from '../models/StudentRecord.js';
import User from '../models/User.js';
import { deleteCourseCascade } from '../controllers/courseController.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// Regression tests promised (but deferred, for lack of DB test infra at the
// time) when fixing issues #4 (Certificate/Counter race condition) and #5
// (course-deletion cascade) earlier in this remediation pass. Now that
// tests/helpers/db.js exists, these close that gap.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

async function makeStudent(email) {
  return User.create({ name: 'Student', email, password: 'Str0ngP@ssw0rd!' });
}

test('Certificate: N concurrent creations never collide on certificateNumber', async () => {
  const student = await makeStudent('student1@example.com');
  const N = 15;

  const results = await Promise.allSettled(
    Array.from({ length: N }, () => Certificate.create({
      user: student._id, studentName: student.name, title: 'Ijazah', type: 'ijazah',
    })),
  );

  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(rejected.length, 0, `expected no duplicate-key errors, got: ${rejected.map((r) => r.reason?.message).join('; ')}`);

  const numbers = results.map((r) => r.value.certificateNumber);
  assert.equal(new Set(numbers).size, N, 'every certificate must have a unique number');
});

test('Certificate: numbering continues from an existing legacy (countDocuments-style) certificate instead of colliding with it', async () => {
  const student = await makeStudent('student2@example.com');
  const year = new Date().getFullYear();

  // Simulate a certificate that already exists from before this fix, created
  // directly (bypassing the pre-save hook's own numbering) the way the old
  // countDocuments()+1 code would have named the very first certificate of
  // the year.
  await Certificate.create({
    user: student._id, studentName: student.name, title: 'Legacy Cert',
    certificateNumber: `CERT-${year}-0001`,
  });

  const next = await Certificate.create({ user: student._id, studentName: student.name, title: 'New Cert' });
  assert.notEqual(next.certificateNumber, `CERT-${year}-0001`);
  assert.equal(next.certificateNumber, `CERT-${year}-0002`);
});

test('Invoice: N concurrent creations never collide on invoiceNumber', async () => {
  const N = 15;
  const results = await Promise.allSettled(
    Array.from({ length: N }, (_, i) => Invoice.create({
      customerEmail: `buyer${i}@example.com`, plan: 'Starter',
      amount: 10, originalAmount: 10,
    })),
  );

  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(rejected.length, 0, `expected no duplicate-key errors, got: ${rejected.map((r) => r.reason?.message).join('; ')}`);

  const numbers = results.map((r) => r.value.invoiceNumber);
  assert.equal(new Set(numbers).size, N);
});

test('deleteCourseCascade: deletes CourseProgress, pulls the Wishlist entry, and nulls (not deletes) Certificate/Review/StudentRecord references', async () => {
  const student = await makeStudent('caslearner@example.com');
  const course = await Course.create({ title: 'Tajweed Basics', description: 'x' });

  await CourseProgress.create({ user: student._id, course: course._id, completed: [] });
  await Wishlist.create({ user: student._id, courses: [{ course: course._id }] });
  const cert = await Certificate.create({ user: student._id, studentName: student.name, title: 'Completion', course: course._id });
  const review = await Review.create({ student: student._id, course: course._id, rating: 5, body: 'Great course' });
  const record = await StudentRecord.create({ student: student._id, teacher: student._id, course: course._id });

  const deleted = await deleteCourseCascade(course._id);
  assert.ok(deleted, 'expected the deleted course document to be returned');

  assert.equal(await Course.findById(course._id), null);
  assert.equal(await CourseProgress.countDocuments({ course: course._id }), 0);

  const wishlist = await Wishlist.findOne({ user: student._id });
  assert.equal(wishlist.courses.length, 0);

  const certAfter = await Certificate.findById(cert._id);
  assert.ok(certAfter, 'the certificate itself must NOT be deleted');
  assert.equal(certAfter.course, null);

  const reviewAfter = await Review.findById(review._id);
  assert.ok(reviewAfter, 'the review itself must NOT be deleted');
  assert.equal(reviewAfter.course, null);

  const recordAfter = await StudentRecord.findById(record._id);
  assert.ok(recordAfter, 'the student record itself must NOT be deleted');
  assert.equal(recordAfter.course, null);
});

test('deleteCourseCascade: returns null (no-op) for a course id that does not exist', async () => {
  const result = await deleteCourseCascade('000000000000000000000000');
  assert.equal(result, null);
});
