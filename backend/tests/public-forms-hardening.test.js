import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { trialRequestAdminEmail, trialRequestStudentEmail } from '../config/emailTemplates.js';

// Auth hardening security batch: trials/contact/newsletter previously had no
// (or, for contact, incomplete) request validation, length caps, or
// dedicated rate limiting, and the trial-request email templates
// interpolated user input into HTML without escaping. This file proves all
// three are fixed.
//
// SAFETY: this machine's local backend/.env has real SMTP_USER/SMTP_PASS
// set (dotenv loads it via app.js's `import 'dotenv/config'`). A successful
// trial/contact submission calls config/mailer.js's sendMail(), which sends
// a REAL email whenever those two vars are both set. sendMail() re-checks
// process.env at CALL time (not import time), so forcibly clearing both
// here guarantees every send in this file no-ops instead of hitting a real
// SMTP server, regardless of what's in the local .env.
before(async () => {
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  await setupTestDb();
}, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => { await clearTestDb(); });

// ---------------------------------------------------------------------------
// HTML-escaping in email templates (unit-level — no HTTP/SMTP involved, so
// no risk of a real send either way; direct proof the fix actually escapes)
// ---------------------------------------------------------------------------

test('escapeHtml: escapes &, <, >, " and falls back to an em-dash for empty input', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('Tom & Jerry "quoted"'), 'Tom &amp; Jerry &quot;quoted&quot;');
  assert.equal(escapeHtml(''), '—');
  assert.equal(escapeHtml(undefined), '—');
});

test('trialRequestAdminEmail: a <script> payload in every user-supplied field is escaped, not raw', () => {
  const payload = '<script>alert(1)</script>';
  const html = trialRequestAdminEmail({ name: payload, email: 'a@b.com', phone: payload, course: payload, message: payload });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw <script> tag must not appear in the rendered HTML');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'escaped form must appear instead');
});

test('trialRequestStudentEmail: a <script> payload in name is escaped, not raw', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const html = trialRequestStudentEmail({ name: payload });
  assert.ok(!html.includes(payload), 'raw payload must not appear in the rendered HTML');
  assert.ok(html.includes(escapeHtml(payload)), 'escaped form must appear instead');
});

// ---------------------------------------------------------------------------
// Validation: email format
// ---------------------------------------------------------------------------

test('POST /api/trials: rejects an invalid email format with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/trials').set(csrf).send({ name: 'Ali', email: 'not-an-email' });
  assert.equal(res.status, 422);
});

test('POST /api/newsletter: rejects an invalid email format with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/newsletter').set(csrf).send({ email: 'not-an-email' });
  assert.equal(res.status, 422);
});

// ---------------------------------------------------------------------------
// Validation: length caps
// ---------------------------------------------------------------------------

test('POST /api/trials: rejects a message beyond the 3000-char cap with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/trials').set(csrf).send({
    name: 'Ali', email: 'ali@example.com', message: 'x'.repeat(3001),
  });
  assert.equal(res.status, 422);
});

test('POST /api/trials: rejects a name beyond the 100-char cap with 422', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/trials').set(csrf).send({
    name: 'x'.repeat(101), email: 'ali@example.com',
  });
  assert.equal(res.status, 422);
});

test('POST /api/trials: a valid, within-cap submission still succeeds (regression guard — the fix does not over-reject)', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  const res = await agent.post('/api/trials').set(csrf).send({
    name: 'Ali', email: 'ali@example.com', message: 'Looking forward to a trial class.',
  });
  assert.equal(res.status, 201);
});

// ---------------------------------------------------------------------------
// Dedicated rate limiting (not just the shared 300/15min apiLimiter)
// ---------------------------------------------------------------------------

test('POST /api/trials: the dedicated trialLimiter (max 5/15min) rejects the 6th submission with 429', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  let last;
  for (let i = 0; i < 6; i++) {
    last = await agent.post('/api/trials').set(csrf).send({
      name: 'Ali', email: `ali${i}@example.com`, message: 'Trial request',
    });
  }
  assert.equal(last.status, 429);
});

test('POST /api/contact: the dedicated contactLimiter (max 5/15min) rejects the 6th submission with 429', async () => {
  const { agent, csrf } = await agentWithCsrf(app);
  let last;
  for (let i = 0; i < 6; i++) {
    last = await agent.post('/api/contact').set(csrf).send({
      name: 'Ali', email: `ali${i}@example.com`, subject: 'Hello', message: 'This is a test message.',
    });
  }
  assert.equal(last.status, 429);
});
