#!/usr/bin/env node
// Seeds a LOCAL MongoDB with fixture data for the Stage 2F migration-tooling
// rehearsal covering the 12 new domains (courses, contact_messages,
// system_config, wishlists, hifz_progress, certificates, reviews,
// referrals, course_progress, live_classes, messages, student_records).
// Companion to seed-mongo-fixture.mjs (Stage 2E's 3 matched-domain fixture)
// — kept separate rather than merged in, since this one also seeds a
// `users` collection the Stage 2E fixture never needed. All data is
// synthetic, invented for this rehearsal only.
//
// IMPORTANT precondition this script does NOT set up itself: mongo-to-
// supabase.mjs resolves every user/course reference below against an
// ALREADY-EXISTING Postgres `profiles` row (by email) or `courses` row (via
// the courses domain's own checkpoint) — see its resolveProfileId()/
// resolveCoursePgId() comments for why. Run seed-postgres-users-stage2f.mjs
// (or otherwise ensure matching profiles rows exist) and migrate `courses`
// BEFORE migrating any domain that references a user or a course.
import mongoose from 'mongoose';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

// Fixed ObjectIds so this script and seed-postgres-users-stage2f.mjs agree
// on who's who without needing to pass ids between processes.
export const FIXTURE_USER_IDS = {
  admin: '650000000000000000000001',
  teacher: '650000000000000000000002',
  student1: '650000000000000000000003',
  student2: '650000000000000000000004',
};

async function main() {
  const uri = process.env.MIGRATION_MONGO_URI;
  if (!uri) throw new Error('MIGRATION_MONGO_URI must be set (local-only).');
  assertLocalHost(uri, 'MIGRATION_MONGO_URI');

  await mongoose.connect(uri);
  const db = mongoose.connection;
  const oid = (s) => new mongoose.Types.ObjectId(s);

  for (const c of [
    'users', 'courses', 'contactmessages', 'systemconfigs', 'wishlists', 'hifzprogresses',
    'certificates', 'reviews', 'referrals', 'courseprogresses', 'liveclasses', 'messages', 'studentrecords',
  ]) {
    await db.collection(c).deleteMany({});
  }

  await db.collection('users').insertMany([
    { _id: oid(FIXTURE_USER_IDS.admin), name: 'Fixture Admin', email: 'fixture.admin@example.test' },
    { _id: oid(FIXTURE_USER_IDS.teacher), name: 'Fixture Teacher', email: 'fixture.teacher@example.test' },
    { _id: oid(FIXTURE_USER_IDS.student1), name: 'Fixture Student One', email: 'fixture.student1.2f@example.test' },
    { _id: oid(FIXTURE_USER_IDS.student2), name: 'Fixture Student Two', email: 'fixture.student2.2f@example.test' },
  ]);

  const courseId = oid('650000000000000000001001');
  await db.collection('courses').insertOne({
    _id: courseId,
    title: 'Fixture Tajweed Course',
    description: 'Fixture course for the Stage 2F migration rehearsal.',
    icon: '📘',
    level: 'Beginner',
    price: 49,
    tags: ['fixture', 'tajweed'],
    resources: [{ type: 'pdf', label: 'Fixture Book', url: 'https://example.test/book.pdf' }],
    modules: [{ title: 'Module 1', summary: 'Intro', order: 0, lessons: [{ title: 'Lesson 1', type: 'video', url: 'https://example.test/l1', duration: '10 min', order: 0 }] }],
    published: true,
  });

  await db.collection('contactmessages').insertMany([
    { name: 'Fixture Guest', email: 'fixture.guest@example.test', subject: 'Question', message: 'Fixture contact message body for rehearsal.', status: 'new', ipAddress: '203.0.113.5', createdAt: new Date() },
  ]);

  await db.collection('systemconfigs').insertMany([
    { key: 'maintenance_mode', _value: 'false', encrypted: false, description: 'Fixture flag', createdAt: new Date() },
    { key: 'financials_frozen', _value: 'false', encrypted: false, description: 'Fixture flag', createdAt: new Date() },
  ]);

  await db.collection('wishlists').insertOne({
    user: oid(FIXTURE_USER_IDS.student1),
    courses: [{ course: courseId, addedAt: new Date() }],
  });

  await db.collection('hifzprogresses').insertOne({
    user: oid(FIXTURE_USER_IDS.student1), chapterId: 1, chapterName: 'Al-Fatiha', totalVerses: 7,
    memorizedVerses: [1, 2, 3], lastRevised: new Date(),
  });

  await db.collection('certificates').insertOne({
    certificateNumber: 'CERT-FIXTURE-0001', user: oid(FIXTURE_USER_IDS.student1), studentName: 'Fixture Student One',
    type: 'completion', title: 'Fixture Completion Certificate', course: courseId, issuedBy: 'Fixture Admin',
    issuedAt: new Date(), revoked: false,
  });

  await db.collection('reviews').insertOne({
    student: oid(FIXTURE_USER_IDS.student1), teacher: oid(FIXTURE_USER_IDS.teacher), course: courseId,
    rating: 5, title: 'Great', body: 'Fixture review body text for rehearsal purposes.', status: 'approved', helpful: 0,
  });

  await db.collection('referrals').insertOne({
    referrer: oid(FIXTURE_USER_IDS.student1), referee: oid(FIXTURE_USER_IDS.student2),
    code: 'FIXTURE1', status: 'pending',
  });

  await db.collection('courseprogresses').insertOne({
    user: oid(FIXTURE_USER_IDS.student1), course: courseId, completed: ['https://example.test/l1'], lastActivity: new Date(),
  });

  await db.collection('liveclasses').insertOne({
    teacher: oid(FIXTURE_USER_IDS.teacher), student: oid(FIXTURE_USER_IDS.student1), title: 'Fixture Lesson',
    startsAt: new Date(Date.now() + 86400000), durationMin: 30, meetingUrl: 'https://example.test/meet', status: 'scheduled',
  });

  await db.collection('messages').insertOne({
    from: oid(FIXTURE_USER_IDS.student1), to: oid(FIXTURE_USER_IDS.teacher), body: 'Fixture message body', readAt: null, createdAt: new Date(),
  });

  await db.collection('studentrecords').insertOne({
    student: oid(FIXTURE_USER_IDS.student1), teacher: oid(FIXTURE_USER_IDS.teacher), course: courseId,
    date: new Date(), grade: 90, gradeLabel: 'Excellent', attendance: 'present', note: 'Fixture note',
  });

  const counts = {};
  for (const c of ['users', 'courses', 'contactmessages', 'systemconfigs', 'wishlists', 'hifzprogresses', 'certificates', 'reviews', 'referrals', 'courseprogresses', 'liveclasses', 'messages', 'studentrecords']) {
    counts[c] = await db.collection(c).countDocuments();
  }
  console.log('[seed-mongo-fixture-stage2f] seeded counts:', counts);

  await mongoose.disconnect();
}

// Guarded so seed-postgres-users-stage2f.mjs can import FIXTURE_USER_IDS
// from this module without re-running (and re-seeding Mongo via) main() —
// compared by basename rather than a full file:// URL, which needs
// different formatting on Windows vs POSIX and isn't worth getting exactly
// right for a same-directory, same-filename check like this one.
const isMain = process.argv[1]?.replace(/\\/g, '/').split('/').pop() === 'seed-mongo-fixture-stage2f.mjs';
if (isMain) {
  main().catch((err) => {
    console.error('[seed-mongo-fixture-stage2f] FATAL:', err.message);
    process.exitCode = 1;
  });
}
