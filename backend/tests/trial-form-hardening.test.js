import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDb, clearTestDb, teardownTestDb } from './helpers/db.js';
import { agentWithCsrf } from './helpers/csrf.js';

// POST /api/trials hardening: one bare email address only, no control
// characters, length limits, HTML-escaped templates with a separate
// plain-text part, a dedicated rate limiter on both backends, and mailer logs
// without personal data. No SMTP, network or Production connection is ever
// made: config/mailer.js is replaced by an in-memory recorder, nodemailer
// (used only by the real mailer loaded in the logging tests) by a fake
// transport, and the Supabase client by an in-memory query recorder. The
// Mongo route runs against the local in-memory replica set (helpers/db.js).
// Mocks need --experimental-test-module-mocks (enabled by `npm test`).

const sent = [];
mock.module('../config/mailer.js', {
  namedExports: {
    sendMail: async (args) => { sent.push(args); },
    ADMIN_EMAIL: () => 'admin-inbox@example.test',
  },
});

const fakeTransportCalls = [];
let fakeTransportError = null;
mock.module('nodemailer', {
  defaultExport: {
    createTransport: () => ({
      sendMail: async (msg) => {
        fakeTransportCalls.push(msg);
        if (fakeTransportError) throw fakeTransportError;
      },
    }),
  },
});

const supabaseInserts = [];
const notUsed = (name) => () => { throw new Error(`${name} is not used by these tests`); };
mock.module('../data/supabase/client.js', {
  namedExports: {
    buildPgPoolConfig: notUsed('buildPgPoolConfig'),
    getPool: notUsed('getPool'),
    withUserContext: notUsed('withUserContext'),
    withServiceRole: notUsed('withServiceRole'),
    closePool: async () => {},
    withAnonContext: async (fn) => fn({
      query: async (_sql, params) => { supabaseInserts.push(params); return { rows: [] }; },
    }),
  },
});

const { default: app } = await import('../app.js');
const { default: TrialRequest } = await import('../models/TrialRequest.js');
const { default: logger } = await import('../config/logger.js');
const { default: mongoTrialRoutes } = await import('../routes/trialRoutes.js');
const { default: supabaseTrialRoutes } = await import('../data/supabase/routes/trialRoutes.js');
const { createTrial: mongoCreateTrial } = await import('../controllers/trialController.js');
const { createTrial: supabaseCreateTrial } = await import('../data/supabase/trialController.js');
const { trialLimiter } = await import('../config/rateLimit.js');
const {
  trialValidation, rejectInvalidTrial, isSingleBareAddress,
  TRIAL_LIMITS, INVALID_TRIAL_MESSAGE, MISSING_TRIAL_MESSAGE,
} = await import('../utils/trialValidation.js');
const { escapeHtml } = await import('../utils/escapeHtml.js');
const {
  trialRequestAdminEmail, trialRequestAdminText,
  trialRequestStudentEmail, trialRequestStudentText,
} = await import('../config/emailTemplates.js');

// The Supabase router is mounted on a minimal app with the same proxy trust
// as app.js, so the shared limiter keys requests the same way on both paths.
const supabaseApp = express();
supabaseApp.set('trust proxy', 1);
supabaseApp.use(express.json());
supabaseApp.use('/api/trials', supabaseTrialRoutes);
supabaseApp.use((err, _req, res, _next) => res.status(500).json({ message: 'test app error' }));

before(async () => { await setupTestDb(); }, { timeout: 60_000 });
after(async () => { await teardownTestDb(); });
beforeEach(async () => {
  await clearTestDb();
  sent.length = 0;
  supabaseInserts.length = 0;
  fakeTransportCalls.length = 0;
  fakeTransportError = null;
});

// Each request gets its own documentation-range client address so the
// shared limiter budget never leaks between tests. With `trust proxy = 1`
// the right-most X-Forwarded-For entry is the address the limiter keys on.
let clientSeq = 0;
const nextClient = () => `198.51.100.${(clientSeq++ % 250) + 1}`;

async function postMongo(body, { client = nextClient() } = {}) {
  const { agent, csrf } = await agentWithCsrf(app);
  return agent.post('/api/trials').set(csrf).set('X-Forwarded-For', client).send(body);
}

async function postSupabase(body, { client = nextClient() } = {}) {
  return request(supabaseApp).post('/api/trials').set('X-Forwarded-For', client).send(body);
}

const VALID = {
  name: 'Amina Student',
  email: 'amina.trial@example.com',
  phone: '+44 7700 900123',
  course: 'Quran Recitation',
  message: 'Weekday evenings work best.',
};

const repeat = (ch, n) => ch.repeat(n);

// A syntactically valid address of exactly `len` characters (len >= 70):
// a 64-char local part and DNS labels of at most 62 chars before ".com".
function emailOfLength(len) {
  const local = repeat('a', 64);
  const tld = '.com';
  let remaining = len - local.length - 1 - tld.length;
  const labels = [];
  const label = (size) => repeat(String.fromCharCode(98 + labels.length), size);
  while (remaining > 62) {
    labels.push(label(61));
    remaining -= 62;
  }
  labels.push(label(remaining));
  return `${local}@${labels.join('.')}${tld}`;
}

// ── Routing: limiter + validation run before the controller on both paths ──

function postStack(router) {
  const layer = router.stack.find((l) => l.route?.path === '/' && l.route.methods.post);
  assert.ok(layer, 'POST / route must exist');
  return layer.route.stack.map((s) => s.handle);
}

for (const [label, router, controller] of [
  ['mongo', mongoTrialRoutes, mongoCreateTrial],
  ['supabase', supabaseTrialRoutes, supabaseCreateTrial],
]) {
  test(`${label} route: trialLimiter, then validation, then the controller (last)`, () => {
    const handles = postStack(router);
    assert.deepEqual(handles, [trialLimiter, ...trialValidation, rejectInvalidTrial, controller]);
  });
}

// ── Single bare address ────────────────────────────────────────────────────

test('isSingleBareAddress: accepts exactly one plain address', () => {
  assert.equal(isSingleBareAddress('amina.trial@example.com'), true);
  assert.equal(isSingleBareAddress('first+tag@sub.example.org'), true);
});

test('isSingleBareAddress: rejects lists, display names, groups and non-strings', () => {
  for (const value of [
    'a@example.com,b@example.com',
    'a@example.com;b@example.com',
    'a@example.com b@example.com',
    'Someone <a@example.com>',
    '"a" <a@example.com>',
    'team: a@example.com, b@example.com;',
    'a@example.com (note)',
    '',
    ['a@example.com'],
    null,
    undefined,
    42,
  ]) {
    assert.equal(isSingleBareAddress(value), false, `expected rejection for ${JSON.stringify(value)}`);
  }
});

test('mongo route: accepts one valid address, stores it, and sends two emails', async () => {
  const res = await postMongo(VALID);
  assert.equal(res.status, 201);
  assert.equal(res.body.message, 'Trial request received');
  assert.equal(res.body.trial.email, VALID.email);
  assert.equal(await TrialRequest.countDocuments(), 1);
  assert.equal(sent.length, 2);
});

test('both routes: more than one recipient is rejected with 400, nothing stored or sent', async () => {
  for (const email of [
    'a@example.com,b@example.com',
    'a@example.com; b@example.com',
    'Someone <a@example.com>',
    'team: a@example.com, b@example.com;',
    ['a@example.com', 'b@example.com'],
  ]) {
    const body = { ...VALID, email };
    const mongo = await postMongo(body);
    const supa = await postSupabase(body);
    assert.equal(mongo.status, 400);
    assert.equal(supa.status, 400);
    assert.equal(mongo.body.message, INVALID_TRIAL_MESSAGE);
    assert.equal(supa.body.message, INVALID_TRIAL_MESSAGE);
  }
  assert.equal(await TrialRequest.countDocuments(), 0);
  assert.equal(supabaseInserts.length, 0);
  assert.equal(sent.length, 0);
});

// ── Line breaks and control characters ────────────────────────────────────

test('both routes: line breaks and control characters are rejected', async () => {
  const cases = [
    { email: 'a@example.com\r\nX: y' },
    { email: 'a@example.com\n' + 'b@example.com' },
    { email: 'a@exam\u0000ple.com' },
    { name: 'Amina\r\nStudent' },
    { name: 'Amina Student' },
    { name: 'Amina\u0007' },
    { phone: '+44\n7700' },
    { phone: '+44\t7700' },
    { course: 'Quran\u001b[0m' },
    { course: 'Qu ran' },
    { message: 'hello\u0000world' },
    { message: 'hello\u000bworld' },
  ];
  for (const patch of cases) {
    const body = { ...VALID, ...patch };
    assert.equal((await postMongo(body)).status, 400, `mongo should reject ${Object.keys(patch)[0]}`);
    assert.equal((await postSupabase(body)).status, 400, `supabase should reject ${Object.keys(patch)[0]}`);
  }
  assert.equal(await TrialRequest.countDocuments(), 0);
  assert.equal(supabaseInserts.length, 0);
  assert.equal(sent.length, 0);
});

test('both routes: CR/LF, tab or a line separator at the edge of a single-line field is rejected, not stripped', async () => {
  const cases = [
    { email: `${VALID.email}\r\n` },
    { email: `\n${VALID.email}` },
    { email: `\t${VALID.email}` },
    { name: `${VALID.name}\n` },
    { name: `\r${VALID.name}` },
    { phone: `${VALID.phone}\r\n` },
    { course: 'Quran ' },
    { course: ' Quran' },
  ];
  for (const patch of cases) {
    const body = { ...VALID, ...patch };
    assert.equal((await postMongo(body)).status, 400, `mongo should reject edge char in ${Object.keys(patch)[0]}`);
    assert.equal((await postSupabase(body)).status, 400, `supabase should reject edge char in ${Object.keys(patch)[0]}`);
  }
  assert.equal(await TrialRequest.countDocuments(), 0);
  assert.equal(supabaseInserts.length, 0);
  assert.equal(sent.length, 0);
});

test('ordinary edge spaces are trimmed; edge line breaks in message are trimmed', async () => {
  const res = await postMongo({ ...VALID, email: `  ${VALID.email} `, course: ' Quran ', message: '\r\nHello\n' });
  assert.equal(res.status, 201);
  const stored = await TrialRequest.findOne().lean();
  assert.equal(stored.email, VALID.email);
  assert.equal(stored.course, 'Quran');
  assert.equal(stored.message, 'Hello');
  assert.deepEqual(sent[1].to, { name: '', address: VALID.email });

  const supa = await postSupabase({ ...VALID, email: ` ${VALID.email}  ` });
  assert.equal(supa.status, 201);
  assert.equal(supabaseInserts[0][1], VALID.email);
});

test('message keeps ordinary multi-line text (tab, LF, CR)', async () => {
  const message = 'Line one\r\nLine two\n\tindented';
  const res = await postMongo({ ...VALID, message });
  assert.equal(res.status, 201);
  assert.equal(sent.length, 2);
  assert.ok(sent[0].text.includes('Line two'));
});

// ── Length limits ──────────────────────────────────────────────────────────

test('length limits: values at the limit pass, one over is rejected (both routes)', async () => {
  assert.equal(emailOfLength(TRIAL_LIMITS.email).length, TRIAL_LIMITS.email);
  assert.equal(emailOfLength(TRIAL_LIMITS.email + 1).length, TRIAL_LIMITS.email + 1);

  const atLimit = {
    name: repeat('n', TRIAL_LIMITS.name),
    email: emailOfLength(TRIAL_LIMITS.email),
    phone: repeat('1', TRIAL_LIMITS.phone),
    course: repeat('c', TRIAL_LIMITS.course),
    message: repeat('m', TRIAL_LIMITS.message),
  };
  assert.equal((await postMongo(atLimit)).status, 201);
  assert.equal((await postSupabase(atLimit)).status, 201);

  for (const field of Object.keys(TRIAL_LIMITS)) {
    const over = {
      ...atLimit,
      [field]: field === 'email' ? emailOfLength(TRIAL_LIMITS.email + 1) : atLimit[field] + 'x',
    };
    assert.equal((await postMongo(over)).status, 400, `mongo: ${field} over limit`);
    assert.equal((await postSupabase(over)).status, 400, `supabase: ${field} over limit`);
  }
  assert.equal(await TrialRequest.countDocuments(), 1);
  assert.equal(supabaseInserts.length, 1);
});

test('missing name or email keeps the original 400 message (API contract)', async () => {
  for (const body of [{ email: VALID.email }, { name: VALID.name }, {}]) {
    const mongo = await postMongo(body);
    const supa = await postSupabase(body);
    assert.equal(mongo.status, 400);
    assert.equal(supa.status, 400);
    assert.equal(mongo.body.message, MISSING_TRIAL_MESSAGE);
    assert.equal(supa.body.message, MISSING_TRIAL_MESSAGE);
  }
});

test('non-string optional fields are rejected; unknown extra fields are ignored', async () => {
  assert.equal((await postMongo({ ...VALID, phone: ['1', '2'] })).status, 400);
  assert.equal((await postMongo({ ...VALID, course: { a: 1 } })).status, 400);

  const res = await postMongo({ name: VALID.name, email: VALID.email, source: 'exit-intent', whatsapp: '+1 555' });
  assert.equal(res.status, 201);
  const stored = await TrialRequest.findOne().lean();
  assert.equal(stored.source, undefined);
  assert.equal(stored.whatsapp, undefined);
});

// ── HTML escaping ──────────────────────────────────────────────────────────

const MARKUP = {
  name: 'Tom <b>&</b> "Jerry"',
  phone: "+1 <i>555</i> 'x'",
  course: 'Arabic <u>101</u> & more',
  message: 'Hi <span class="x">there</span> & \'friends\'',
};

test('escapeHtml: escapes the five HTML-significant characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(7), '7');
});

test('admin HTML template escapes every dynamic field', () => {
  const html = trialRequestAdminEmail({ ...MARKUP, email: VALID.email });
  for (const value of Object.values(MARKUP)) {
    assert.ok(!html.includes(value), 'raw value must not appear in HTML');
    assert.ok(html.includes(escapeHtml(value)), 'escaped value must appear in HTML');
  }
  assert.ok(!/<(b|i|u|span)[\s>]/.test(html), 'no user-supplied tag may survive');
  assert.ok(html.includes(`mailto:${VALID.email}`));
});

test('admin template: mailto: link percent-encodes query syntax in a valid local part', async () => {
  const email = 'first?cc=other&x=1%2#y@example.com';
  assert.equal(isSingleBareAddress(email), true, 'precondition: this is one valid bare address');
  const html = trialRequestAdminEmail({ name: 'A', email });
  const hrefs = [...html.matchAll(/href="mailto:([^"]*)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 1);
  assert.equal(hrefs[0], 'first%3Fcc%3Dother%26x%3D1%252%23y@example.com');
  assert.ok(!/[?&#]/.test(hrefs[0]), 'no raw mailto: query/fragment characters');

  // End to end: accepted by the route, and the sent HTML carries the encoded link.
  const res = await postMongo({ ...VALID, email });
  assert.equal(res.status, 201);
  assert.ok(sent[0].html.includes('href="mailto:first%3Fcc%3Dother%26x%3D1%252%23y@example.com"'));
  assert.deepEqual(sent[0].replyTo, { name: '', address: email });
});

test('student HTML template escapes the name', () => {
  const html = trialRequestStudentEmail({ name: MARKUP.name });
  assert.ok(!html.includes(MARKUP.name));
  assert.ok(html.includes(escapeHtml(MARKUP.name)));
  assert.ok(!/<b[\s>]/.test(html));
});

test('route: markup in every text field reaches the emails escaped', async () => {
  const res = await postMongo({ ...MARKUP, email: VALID.email });
  assert.equal(res.status, 201);
  assert.equal(sent.length, 2);
  const [admin, student] = sent;
  for (const value of Object.values(MARKUP)) {
    assert.ok(!admin.html.includes(value));
    assert.ok(admin.html.includes(escapeHtml(value)));
  }
  assert.ok(!student.html.includes(MARKUP.name));
  assert.ok(student.html.includes(escapeHtml(MARKUP.name)));
});

// ── Plain-text part ────────────────────────────────────────────────────────

test('plain-text parts are built separately and contain no HTML', () => {
  const fields = { ...MARKUP, email: VALID.email };
  const adminText = trialRequestAdminText(fields);
  const studentText = trialRequestStudentText({ name: MARKUP.name });
  for (const text of [adminText, studentText]) {
    assert.ok(!/<(table|tr|td|a|div|p|h2|html|body)[\s>]/i.test(text), 'no template markup in text');
    assert.ok(!/&(amp|lt|gt|quot|#39);/.test(text), 'text must not be HTML-escaped');
  }
  for (const value of Object.values(MARKUP)) assert.ok(adminText.includes(value));
  assert.ok(adminText.includes(VALID.email));
  assert.ok(studentText.includes(MARKUP.name));
});

test('route: both emails carry an html and a separate text part', async () => {
  await postMongo(VALID);
  assert.equal(sent.length, 2);
  for (const mail of sent) {
    assert.equal(typeof mail.html, 'string');
    assert.equal(typeof mail.text, 'string');
    assert.notEqual(mail.text, mail.html);
    assert.ok(!mail.text.includes('<'));
  }
});

// ── Recipients, Reply-To and subject ───────────────────────────────────────

test('route: Reply-To and the student recipient are exactly the validated address', async () => {
  const res = await postMongo({ ...VALID, email: `  ${VALID.email}  ` });
  assert.equal(res.status, 201);
  const [admin, student] = sent;
  assert.equal(admin.to, 'admin-inbox@example.test');
  assert.deepEqual(admin.replyTo, { name: '', address: VALID.email });
  assert.deepEqual(student.to, { name: '', address: VALID.email });
  assert.equal(student.replyTo, undefined);
  for (const mail of sent) {
    for (const key of ['from', 'cc', 'bcc', 'sender', 'headers']) {
      assert.equal(mail[key], undefined, `${key} must never be set from user input`);
    }
  }
});

test('route: subjects are fixed and never include submitted data', async () => {
  await postMongo(VALID);
  const [admin, student] = sent;
  assert.equal(admin.subject, 'New Trial Request');
  assert.equal(student.subject, 'We received your trial request — AL-Rahma Academy');
  for (const mail of sent) assert.ok(!mail.subject.includes(VALID.name));
});

// ── Rate limit on both paths ───────────────────────────────────────────────

test('mongo route: the 6th request from one client in the window gets 429', async () => {
  const client = '203.0.113.10';
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await postMongo({ ...VALID, email: `limit${i}@example.com` }, { client })).status);
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  assert.equal(await TrialRequest.countDocuments(), 5);
});

test('supabase route: the 6th request from one client in the window gets 429', async () => {
  const client = '203.0.113.20';
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await postSupabase({ ...VALID, email: `limit${i}@example.com` }, { client })).status);
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  assert.equal(supabaseInserts.length, 5);
});

test('limiter keys on the proxy-appended address, not client-supplied entries to its left', async () => {
  const client = '203.0.113.30';
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await postSupabase(
      { ...VALID, email: `spoof${i}@example.com` },
      { client: `192.0.2.${i + 1}, ${client}` },
    )).status);
  }
  assert.equal(statuses[5], 429);
});

test('invalid submissions also count toward the limit', async () => {
  const client = '203.0.113.40';
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await postSupabase({ ...VALID, email: 'a@example.com,b@example.com' }, { client })).status);
  }
  assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429]);
});

// ── Mongo / Supabase parity ────────────────────────────────────────────────

test('parity: same input gives the same status and stored values on both backends', async () => {
  const inputs = [
    { ...VALID, name: `  ${VALID.name}  ` },
    { name: VALID.name, email: VALID.email },
    { name: VALID.name, email: VALID.email, phone: '', course: '', message: '' },
    { ...VALID, email: 'two@example.com,three@example.com' },
    { ...VALID, message: 'a\u0000b' },
    { email: VALID.email },
  ];
  for (const body of inputs) {
    await clearTestDb();
    supabaseInserts.length = 0;
    const mongo = await postMongo(body);
    const supa = await postSupabase(body);
    assert.equal(mongo.status, supa.status, `status parity for ${JSON.stringify(Object.keys(body))}`);
    assert.equal(mongo.body.message, supa.body.message);
    if (mongo.status !== 201) {
      assert.equal(supabaseInserts.length, 0);
      continue;
    }
    const stored = await TrialRequest.findOne().lean();
    const [name, email, phone, course, message] = supabaseInserts[0];
    assert.equal(name, stored.name);
    assert.equal(email, stored.email);
    assert.equal(phone, stored.phone ?? null);
    assert.equal(course, stored.course ?? null);
    assert.equal(message, stored.message ?? null);
    for (const k of ['name', 'email']) assert.equal(supa.body.trial[k], mongo.body.trial[k]);
    for (const k of ['phone', 'course', 'message']) {
      assert.equal(supa.body.trial[k], mongo.body.trial[k] ?? null);
    }
    assert.equal(supa.body.trial.status, mongo.body.trial.status);
  }
});

// ── Mailer logs (real config/mailer.js, fake transport) ────────────────────

async function loadRealMailer() {
  // A distinct URL bypasses this file's module mock of config/mailer.js;
  // nodemailer itself stays mocked, so no connection can be opened.
  return import(`../config/mailer.js?real=${Date.now()}-${Math.random()}`);
}

function captureLogs(t) {
  const lines = [];
  for (const level of ['error', 'warn', 'info', 'http', 'debug']) {
    t.mock.method(logger, level, (...args) => { lines.push(args); return logger; });
  }
  return lines;
}

test('real mailer: SMTP not configured — skip log carries only requestId', async (t) => {
  const saved = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  t.after(() => {
    if (saved.user === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = saved.user;
    if (saved.pass === undefined) delete process.env.SMTP_PASS; else process.env.SMTP_PASS = saved.pass;
  });
  const { sendMail } = await loadRealMailer();
  const lines = captureLogs(t);
  await sendMail({ to: VALID.email, subject: `Hello ${VALID.name}`, html: '<p>x</p>', requestId: 'req-1' });
  assert.equal(fakeTransportCalls.length, 0);
  const skip = lines.find(([msg]) => /Skipped email/.test(msg));
  assert.ok(skip);
  assert.deepEqual(skip[1], { requestId: 'req-1' });
  const dump = JSON.stringify(lines);
  assert.ok(!dump.includes(VALID.email) && !dump.includes(VALID.name));
});

test('real mailer: transport failure logs only requestId and error code', async (t) => {
  const saved = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  process.env.SMTP_USER = 'sender@example.test';
  process.env.SMTP_PASS = 'test-only-placeholder';
  t.after(() => {
    if (saved.user === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = saved.user;
    if (saved.pass === undefined) delete process.env.SMTP_PASS; else process.env.SMTP_PASS = saved.pass;
  });
  const { sendMail } = await loadRealMailer();
  const err = new Error(`Recipient rejected: ${VALID.email}`);
  err.code = 'EENVELOPE';
  fakeTransportError = err;
  const lines = captureLogs(t);

  await sendMail({
    to: { name: '', address: VALID.email },
    replyTo: { name: '', address: VALID.email },
    subject: 'New Trial Request',
    html: '<p>x</p>',
    text: 'x',
    requestId: 'req-2',
  });

  assert.equal(fakeTransportCalls.length, 1);
  const msg = fakeTransportCalls[0];
  assert.equal(msg.from, '"AL-Rahma Academy" <sender@example.test>');
  assert.deepEqual(msg.replyTo, { name: '', address: VALID.email });
  assert.equal(msg.text, 'x');
  assert.equal(msg.cc, undefined);
  assert.equal(msg.bcc, undefined);

  const failure = lines.find(([m]) => /Failed to send email/.test(m));
  assert.ok(failure);
  assert.deepEqual(failure[1], { requestId: 'req-2', code: 'EENVELOPE' });
  const dump = JSON.stringify(lines);
  assert.ok(!dump.includes(VALID.email), 'recipient must not be logged');
  assert.ok(!dump.includes('Recipient rejected'), 'raw transport error text must not be logged');
});

test('real mailer: optional text/replyTo are omitted when not provided', async (t) => {
  const saved = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  process.env.SMTP_USER = 'sender@example.test';
  process.env.SMTP_PASS = 'test-only-placeholder';
  t.after(() => {
    if (saved.user === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = saved.user;
    if (saved.pass === undefined) delete process.env.SMTP_PASS; else process.env.SMTP_PASS = saved.pass;
  });
  const { sendMail } = await loadRealMailer();
  captureLogs(t);
  await sendMail({ to: 'someone@example.com', subject: 's', html: '<p>x</p>' });
  assert.equal(fakeTransportCalls.length, 1);
  assert.ok(!('text' in fakeTransportCalls[0]));
  assert.ok(!('replyTo' in fakeTransportCalls[0]));
});

test('route request: no submitted personal data appears in any log line', async (t) => {
  const lines = captureLogs(t);
  const rejected = await postMongo({ ...VALID, email: 'x@example.com,y@example.com' });
  const accepted = await postMongo(VALID);
  assert.equal(rejected.status, 400);
  assert.equal(accepted.status, 201);
  const dump = JSON.stringify(lines);
  for (const value of [VALID.email, VALID.name, VALID.phone, VALID.message, 'x@example.com']) {
    assert.ok(!dump.includes(value), 'submitted value leaked into logs');
  }
});
