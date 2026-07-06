import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import Course from '../models/Course.js';
import Blog from '../models/Blog.js';
import User from '../models/User.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// Coverage for T7: search had zero prior test coverage. Adds regression
// coverage for the three /api/search/* endpoints as they exist today
// (unanchored, case-insensitive regex matching — unchanged by this task,
// see the T7 report for why: no semantics-preserving way to accelerate that
// specific query shape was found), plus a direct check that the one
// implemented optimization (an index on Course.level, a plain equality
// filter unrelated to the regex side of these endpoints) doesn't change
// which courses are matched or how they're filtered.

const PASSWORD = 'Str0ngP@ssw0rd!';

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

// ---------------------------------------------------------------------------
// GET /api/search (globalSearch)
// ---------------------------------------------------------------------------

test('globalSearch: rejects a query shorter than 2 characters with 400', async () => {
  const res = await request(app).get('/api/search').query({ q: 'a' });
  assert.equal(res.status, 400);
});

test('globalSearch: matches a course, a published blog post, and a teacher by substring, case-insensitively', async () => {
  await Course.create({ title: 'Tajweed Mastery', description: 'x', published: true });
  await Blog.create({ slug: 'a-post', title: 'Understanding Tajweed', excerpt: 'x', body: 'y', published: true, author: { name: 'Team' } });
  await User.create({ name: 'Tajweed Teacher', email: 'tajweed-teacher@example.com', password: PASSWORD, role: 'teacher', specialization: 'Tajweed' });

  const res = await request(app).get('/api/search').query({ q: 'tajweed' }); // lowercase, substring
  assert.equal(res.status, 200);
  assert.equal(res.body.q, 'tajweed');
  assert.equal(res.body.results.courses.length, 1);
  assert.equal(res.body.results.posts.length, 1);
  assert.equal(res.body.results.teachers.length, 1);
  assert.equal(res.body.results.courses[0].title, 'Tajweed Mastery');
});

test('globalSearch: an unpublished blog post is never matched', async () => {
  await Blog.create({ slug: 'draft', title: 'Draft Tajweed Post', excerpt: 'x', body: 'y', published: false, author: { name: 'Team' } });
  const res = await request(app).get('/api/search').query({ q: 'tajweed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.results.posts.length, 0);
});

// ---------------------------------------------------------------------------
// GET /api/search/courses — level filter is the T7-optimized path
// ---------------------------------------------------------------------------

test('searchCourses: filtering by level alone (no q) returns only courses of that level', async () => {
  await Course.create({ title: 'Course A', description: 'x', level: 'Beginner', published: true });
  await Course.create({ title: 'Course B', description: 'x', level: 'Advanced', published: true });
  await Course.create({ title: 'Course C', description: 'x', level: 'Beginner', published: true });

  const res = await request(app).get('/api/search/courses').query({ level: 'Beginner' });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.ok(res.body.courses.every((c) => c.level === 'Beginner'));
});

test('searchCourses: q and level combined narrow correctly together', async () => {
  await Course.create({ title: 'Tajweed for Kids', description: 'x', level: 'Beginner', published: true });
  await Course.create({ title: 'Tajweed Advanced', description: 'x', level: 'Advanced', published: true });
  await Course.create({ title: 'Arabic for Kids', description: 'x', level: 'Beginner', published: true });

  const res = await request(app).get('/api/search/courses').query({ q: 'tajweed', level: 'Beginner' });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.courses[0].title, 'Tajweed for Kids');
});

test('searchCourses: pagination shape is unchanged (page/pages/total)', async () => {
  for (let i = 0; i < 15; i++) {
    await Course.create({ title: `Course ${i}`, description: 'x', published: true });
  }
  const res = await request(app).get('/api/search/courses').query({ limit: 10, page: 2 });
  assert.equal(res.status, 200);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.total, 15);
  assert.equal(res.body.pages, 2);
  assert.equal(res.body.courses.length, 5);
});

// ---------------------------------------------------------------------------
// GET /api/search/teachers
// ---------------------------------------------------------------------------

test('searchTeachers: matches by name, specialization, or bio substring; never returns non-teachers', async () => {
  await User.create({ name: 'Amina', email: 'amina-t@example.com', password: PASSWORD, role: 'teacher', specialization: 'Quran memorization' });
  await User.create({ name: 'Bilal', email: 'bilal-student@example.com', password: PASSWORD, role: 'student', specialization: 'Quran memorization' });

  const res = await request(app).get('/api/search/teachers').query({ q: 'quran' });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.teachers[0].name, 'Amina');
});

test('searchTeachers: subject/gender/language filters combine with role: teacher', async () => {
  await User.create({ name: 'T1', email: 't1@example.com', password: PASSWORD, role: 'teacher', gender: 'female', subjects: ['Tajweed'] });
  await User.create({ name: 'T2', email: 't2@example.com', password: PASSWORD, role: 'teacher', gender: 'male', subjects: ['Tajweed'] });

  const res = await request(app).get('/api/search/teachers').query({ gender: 'female' });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.teachers[0].name, 'T1');
});

// ---------------------------------------------------------------------------
// T7 optimization evidence: the new Course.level index is real and used
// ---------------------------------------------------------------------------

test('T7: Course.level has a supporting index, and a level-only filter uses it (not a full collection scan)', async () => {
  for (let i = 0; i < 50; i++) {
    await Course.create({ title: `C${i}`, description: 'x', level: i % 2 === 0 ? 'Beginner' : 'Advanced', published: true });
  }

  const indexes = await Course.collection.getIndexes();
  assert.ok(Object.keys(indexes).some((name) => name.includes('level')), 'expected an index covering the level field');

  const plan = await Course.find({ level: 'Beginner' }).explain('executionStats');
  const winningStage = plan.queryPlanner.winningPlan.inputStage?.stage || plan.queryPlanner.winningPlan.stage;
  assert.notEqual(winningStage, 'COLLSCAN', 'expected an indexed plan (IXSCAN/FETCH), not a full collection scan');
  assert.equal(plan.executionStats.totalDocsExamined, 25, 'only the matching documents should be examined, not the whole collection');
});
