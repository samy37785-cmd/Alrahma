import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import Blog from '../models/Blog.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';

// The frontend's useBlog.js hook unwraps these responses via a react-query
// `select` (`res.posts` / `res.post`) — a previous response-shape mismatch
// here (returning the array/object directly instead of wrapped) crashed the
// Blog page in production (`posts.map is not a function`). This locks in
// the exact envelope shape the frontend depends on.

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

test('GET /api/blog returns { posts, total, page, pages } even with zero posts', async () => {
  const res = await request(app).get('/api/blog');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.posts, []);
  assert.equal(res.body.total, 0);
  assert.equal(res.body.page, 1);
  assert.equal(res.body.pages, 0);
});

test('GET /api/blog returns only published posts, wrapped in { posts: [...] }', async () => {
  await Blog.create({
    slug: 'published-post', title: 'Published', excerpt: 'x', body: 'x',
    category: 'general', author: { name: 'Al-Rahma Academy' }, published: true,
  });
  await Blog.create({
    slug: 'draft-post', title: 'Draft', excerpt: 'x', body: 'x',
    category: 'general', author: { name: 'Al-Rahma Academy' }, published: false,
  });

  const res = await request(app).get('/api/blog');
  assert.equal(res.status, 200);
  assert.equal(res.body.posts.length, 1);
  assert.equal(res.body.posts[0].slug, 'published-post');
});

test('GET /api/blog/:slug returns a single post wrapped in { post: {...} }', async () => {
  await Blog.create({
    slug: 'a-real-post', title: 'A Real Post', excerpt: 'x', body: 'Full content here',
    category: 'general', author: { name: 'Al-Rahma Academy' }, published: true,
  });

  const res = await request(app).get('/api/blog/a-real-post');
  assert.equal(res.status, 200);
  assert.equal(res.body.post.slug, 'a-real-post');
  // BlogPost.jsx renders post.body (renderMarkdown(post.body)) — a mismatch
  // here (e.g. a stray "content" field) is exactly the class of bug that
  // crashed this page before; assert the real field name is present.
  assert.equal(res.body.post.body, 'Full content here');
});

test('GET /api/blog/:slug returns 404 (not a crash) for an unknown slug', async () => {
  const res = await request(app).get('/api/blog/does-not-exist');
  assert.equal(res.status, 404);
});
