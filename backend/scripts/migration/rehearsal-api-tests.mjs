#!/usr/bin/env node
// Stage 2E rehearsal, step 4 of 5: "API tests" — boots the real Express app
// with DATA_BACKEND=supabase pointed at the local rehearsal Postgres (after
// mongo-to-supabase.mjs has imported the fixture data into it) and exercises
// the actual HTTP routes via supertest, exactly as a real client would.
// This is NOT part of the regular `node --test tests/**` suite (that suite
// always runs with DATA_BACKEND unset/mongodb) — it's a standalone rehearsal
// script, run manually against disposable local containers only.
//
// Run after: seed-mongo-fixture.mjs -> mongo-to-supabase.mjs -> (this file).
import assert from 'node:assert/strict';
import request from 'supertest';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

async function main() {
  assertLocalHost(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL');
  assert.equal(process.env.DATA_BACKEND, 'supabase', 'DATA_BACKEND must be "supabase" for this script');

  const { default: app } = await import('../../app.js');

  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`  PASS  ${name}`);
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
      console.log(`  FAIL  ${name}: ${err.message}`);
    }
  };

  console.log('[rehearsal] GET /api/blog — public list shows only the published fixture post');
  await check('blog list shows 1 published post, excludes the draft', async () => {
    const res = await request(app).get('/api/blog');
    assert.equal(res.status, 200);
    const slugs = res.body.posts.map((p) => p.slug);
    assert.ok(slugs.includes('fixture-post-virtue-of-learning-quran'), 'published fixture post missing');
    assert.ok(!slugs.includes('fixture-post-draft-not-published'), 'draft post leaked to public list');
  });

  console.log('[rehearsal] GET /api/blog/:slug — single published post');
  await check('single post fetch returns migrated content', async () => {
    const res = await request(app).get('/api/blog/fixture-post-virtue-of-learning-quran');
    assert.equal(res.status, 200);
    assert.equal(res.body.post.title, 'Fixture Post: The Virtue of Learning Quran');
    assert.equal(res.body.post.body, 'This is fixture content for the Stage 2E migration rehearsal only.');
  });

  // Mutating requests need the CSRF double-submit cookie (see middleware/
  // csrf.js) — a real client hits any GET first to receive it, exactly like
  // artifacts/al-rahma-academy/src/api/csrf.js's ensureCsrfToken().
  async function agentWithCsrf() {
    const agent = request.agent(app);
    const res = await agent.get('/api/blog');
    const cookie = (res.headers['set-cookie'] || []).map(String).find((c) => c.startsWith('csrf_token='));
    const token = cookie ? cookie.split(';')[0].split('=')[1] : null;
    if (!token) throw new Error('csrf_token cookie was not issued');
    return { agent, csrfHeaders: { 'x-csrf-token': token } };
  }

  console.log('[rehearsal] POST /api/newsletter — idempotent subscribe');
  await check('newsletter subscribe is idempotent for a migrated + a brand-new email', async () => {
    const { agent, csrfHeaders } = await agentWithCsrf();
    const existing = await agent.post('/api/newsletter').set(csrfHeaders).send({ email: 'fixture.sub1@example.test' });
    assert.equal(existing.status, 200);
    const fresh = await agent.post('/api/newsletter').set(csrfHeaders).send({ email: 'fixture.sub.brandnew@example.test' });
    assert.equal(fresh.status, 200);
  });

  console.log('[rehearsal] POST /api/trials — guest submission');
  await check('guest trial-request submission succeeds', async () => {
    const { agent, csrfHeaders } = await agentWithCsrf();
    const res = await agent.post('/api/trials').set(csrfHeaders).send({
      name: 'Rehearsal Walk-in',
      email: 'rehearsal.walkin@example.test',
      course: 'Arabic',
      message: 'API-test submission',
    });
    assert.equal(res.status, 201);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[rehearsal] ${results.length - failed.length}/${results.length} API checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[rehearsal] FATAL:', err.message);
  process.exitCode = 1;
});
