import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import AdminUser from '../models/AdminUser.js';
import Blog, { BLOG_LOCALES } from '../models/Blog.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// Blog SEO Foundation PR A ("Localized Article Data Model + Public API
// Locale Contract"): covers the Mongo-side data model (locale,
// translationGroupId, per-locale slug uniqueness) and the public API's new
// requirement that GET /api/blog and GET /api/blog/:slug always be told an
// explicit `?locale=`. Everything runs against an in-memory MongoDB replica
// set (see helpers/db.js) — no real/production database is touched.
// The Supabase-side equivalent of the public-API assertions lives in
// tests/contract/supabase-adapter.contract.test.js (skipped unless a
// developer opts in with a local Postgres); tests/blogLocaleParity.test.js
// asserts both backends' locale allow-lists are identical values.

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
// 1-2) Create/validate a valid EN and AR article
// ---------------------------------------------------------------------------

test('Blog model: a valid EN article is created with locale defaulted or explicit', async () => {
  const post = await Blog.create({
    slug: 'intro-to-tajweed', title: 'Intro to Tajweed', excerpt: 'x', body: 'x',
    author: { name: 'Al-Rahma Team' }, locale: 'en',
  });
  assert.equal(post.locale, 'en');
});

test('Blog model: a valid AR article is created with locale: "ar"', async () => {
  const post = await Blog.create({
    slug: 'muqaddima-fi-tajweed', title: 'مقدمة في التجويد', excerpt: 'x', body: 'x',
    author: { name: 'فريق الرحمة' }, locale: 'ar',
  });
  assert.equal(post.locale, 'ar');
});

// ---------------------------------------------------------------------------
// 3) Reject any locale outside en/ar
// ---------------------------------------------------------------------------

test('Blog model: rejects a locale outside en/ar', async () => {
  await assert.rejects(
    Blog.create({ slug: 'x', title: 'X', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'fr' }),
  );
});

test('POST /api/v1/admin/blog: rejects locale "it" with 422', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const res = await agent.post('/api/v1/admin/blog').set({ ...csrf, Cookie: cookieHeader }).send({
    slug: 'a-post', title: 'A Post', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'it',
  });
  assert.equal(res.status, 422);
});

test('POST /api/v1/admin/blog: locale defaults to "en" when omitted (backward-compatible)', async () => {
  const { agent, csrf, cookieHeader } = await adminUserAgent();
  const res = await agent.post('/api/v1/admin/blog').set({ ...csrf, Cookie: cookieHeader }).send({
    slug: 'no-locale-given', title: 'No Locale Given', excerpt: 'x', body: 'x', author: { name: 'Team' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.post.locale, 'en');
});

// ---------------------------------------------------------------------------
// 4-5) Slug uniqueness is per-locale, not global
// ---------------------------------------------------------------------------

test('Blog model: the same slug is allowed once in EN and once in AR', async () => {
  await Blog.create({ slug: 'ijazah', title: 'Ijazah', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en' });
  const ar = await Blog.create({ slug: 'ijazah', title: 'الإجازة', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'ar' });
  assert.equal(ar.slug, 'ijazah');
  assert.equal(ar.locale, 'ar');
});

test('Blog model: rejects a duplicate slug within the same locale (EN)', async () => {
  await Blog.create({ slug: 'dup', title: 'Dup', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en' });
  await assert.rejects(
    Blog.create({ slug: 'dup', title: 'Dup Again', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en' }),
    /duplicate key|E11000/,
  );
});

test('Blog model: rejects a duplicate slug within the same locale (AR)', async () => {
  await Blog.create({ slug: 'dup-ar', title: 'كرر', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'ar' });
  await assert.rejects(
    Blog.create({ slug: 'dup-ar', title: 'كرر مرة أخرى', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'ar' }),
    /duplicate key|E11000/,
  );
});

// ---------------------------------------------------------------------------
// 6-7) Translation group linking is optional, never assumed
// ---------------------------------------------------------------------------

test('Blog model: an EN and AR article can be linked via a shared translationGroupId', async () => {
  const groupId = '11111111-1111-4111-8111-111111111111';
  const en = await Blog.create({ slug: 'hifz-guide', title: 'Hifz Guide', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en', translationGroupId: groupId });
  const ar = await Blog.create({ slug: 'daleel-alhifz', title: 'دليل الحفظ', excerpt: 'x', body: 'x', author: { name: 'فريق' }, locale: 'ar', translationGroupId: groupId });
  assert.equal(en.translationGroupId, ar.translationGroupId);
});

test('Blog model: an article with no counterpart translation is valid (translationGroupId null)', async () => {
  const post = await Blog.create({ slug: 'standalone', title: 'Standalone', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en' });
  assert.equal(post.translationGroupId, null);
});

test('Blog model: rejects a non-UUID translationGroupId', async () => {
  await assert.rejects(
    Blog.create({ slug: 'bad-group', title: 'X', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en', translationGroupId: 'not-a-uuid' }),
  );
});

// ---------------------------------------------------------------------------
// 8-9) Public API: locale-scoped list and get-by-slug, no cross-locale leak
// ---------------------------------------------------------------------------

test('GET /api/blog: requires an explicit locale query parameter (400 when missing)', async () => {
  const res = await request(app).get('/api/blog');
  assert.equal(res.status, 400);
  assert.match(res.body.message, /locale/i);
});

test('GET /api/blog: rejects an invalid locale value (400)', async () => {
  const res = await request(app).get('/api/blog?locale=fr');
  assert.equal(res.status, 400);
});

test('GET /api/blog?locale=ar: never returns an EN post, and vice versa', async () => {
  await Blog.create({ slug: 'en-post', title: 'EN Post', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en', published: true, publishedAt: new Date() });
  await Blog.create({ slug: 'ar-post', title: 'منشور عربي', excerpt: 'x', body: 'x', author: { name: 'فريق' }, locale: 'ar', published: true, publishedAt: new Date() });

  const ar = await request(app).get('/api/blog?locale=ar');
  assert.equal(ar.status, 200);
  assert.equal(ar.body.posts.length, 1);
  assert.equal(ar.body.posts[0].slug, 'ar-post');

  const en = await request(app).get('/api/blog?locale=en');
  assert.equal(en.status, 200);
  assert.equal(en.body.posts.length, 1);
  assert.equal(en.body.posts[0].slug, 'en-post');
});

test('GET /api/blog/:slug: depends on (locale, slug) together, no fallback to the other locale', async () => {
  await Blog.create({ slug: 'shared-slug', title: 'EN Version', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en', published: true, publishedAt: new Date() });
  await Blog.create({ slug: 'shared-slug', title: 'النسخة العربية', excerpt: 'x', body: 'x', author: { name: 'فريق' }, locale: 'ar', published: true, publishedAt: new Date() });

  const en = await request(app).get('/api/blog/shared-slug?locale=en');
  assert.equal(en.status, 200);
  assert.equal(en.body.post.title, 'EN Version');

  const ar = await request(app).get('/api/blog/shared-slug?locale=ar');
  assert.equal(ar.status, 200);
  assert.equal(ar.body.post.title, 'النسخة العربية');
});

test('GET /api/blog/:slug: missing locale is a 400, not a fallback', async () => {
  await Blog.create({ slug: 'no-locale-req', title: 'X', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en', published: true, publishedAt: new Date() });
  const res = await request(app).get('/api/blog/no-locale-req');
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// 10) Draft/unpublished never appears in the public API, in either locale
// ---------------------------------------------------------------------------

test('GET /api/blog: a draft (unpublished) post never appears, regardless of locale', async () => {
  await Blog.create({ slug: 'draft-en', title: 'Draft EN', excerpt: 'x', body: 'x', author: { name: 'Team' }, locale: 'en', published: false });
  await Blog.create({ slug: 'draft-ar', title: 'مسودة', excerpt: 'x', body: 'x', author: { name: 'فريق' }, locale: 'ar', published: false });

  const en = await request(app).get('/api/blog?locale=en');
  const ar = await request(app).get('/api/blog?locale=ar');
  assert.equal(en.body.posts.length, 0);
  assert.equal(ar.body.posts.length, 0);

  const enGet = await request(app).get('/api/blog/draft-en?locale=en');
  assert.equal(enGet.status, 404);
});

// Sanity check that this suite and BLOG_LOCALES agree on the allow-list
// itself, so a future edit to one can't silently drift from the other.
test('BLOG_LOCALES is exactly ["en", "ar"] for this phase', () => {
  assert.deepEqual([...BLOG_LOCALES].sort(), ['ar', 'en']);
});
