import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail, mailProvider } from '../config/mailer.js';
import logger from '../config/logger.js';

// Render's Free plan blocks outbound SMTP, so every Gmail SMTP send on
// Production timed out (2026-10-14). With RESEND_API_KEY set, sendMail posts to
// Resend's HTTPS API instead. fetch is mocked: nothing is sent.

const ENV_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'ADMIN_EMAIL', 'SMTP_USER', 'SMTP_PASS'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  mock.restoreAll();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

function mockFetch(status = 200) {
  return mock.method(globalThis, 'fetch', async () => ({ ok: status < 300, status, json: async () => ({ id: 'x' }) }));
}

test('provider: Resend when RESEND_API_KEY is set (even with SMTP vars), else SMTP, else none', () => {
  assert.equal(mailProvider(), null);
  process.env.SMTP_USER = 'a@gmail.com'; process.env.SMTP_PASS = 'p';
  assert.equal(mailProvider(), 'smtp');
  process.env.RESEND_API_KEY = 're_test';
  assert.equal(mailProvider(), 'resend');
});

test('Resend: one POST with the key, the default no-reply sender and the academy inbox as reply-to', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.SMTP_USER = 'academy@gmail.com'; // ADMIN_EMAIL falls back to it
  process.env.SMTP_PASS = 'p';
  const fetchMock = mockFetch();
  await sendMail({ to: 'student@example.com', subject: 'Hi', html: '<p>x</p>', text: 'x' });

  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, init] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer re_test_key');
  assert.deepEqual(JSON.parse(init.body), {
    from: 'AL-Rahma Academy <no-reply@al-rahmaacademy.com>',
    to: 'student@example.com',
    subject: 'Hi',
    html: '<p>x</p>',
    text: 'x',
    reply_to: 'academy@gmail.com',
  });
  assert.ok(init.signal, 'the request has a timeout');
});

test('Resend: EMAIL_FROM and EMAIL_REPLY_TO override the defaults; a caller reply-to wins', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.EMAIL_FROM = 'Al-Rahma <hello@al-rahmaacademy.com>';
  process.env.EMAIL_REPLY_TO = 'office@al-rahmaacademy.com';
  const fetchMock = mockFetch();
  await sendMail({ to: 'a@example.com', subject: 's', html: 'h' });
  await sendMail({ to: 'a@example.com', subject: 's', html: 'h', replyTo: 'parent@example.com' });
  const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c.arguments[1].body));
  assert.equal(bodies[0].from, 'Al-Rahma <hello@al-rahmaacademy.com>');
  assert.equal(bodies[0].reply_to, 'office@al-rahmaacademy.com');
  assert.equal(bodies[1].reply_to, 'parent@example.com');
  assert.equal('text' in bodies[0], false);
});

test('Resend failure: never throws, logs only the status code, never the recipient', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  mockFetch(422);
  const errorSpy = mock.method(logger, 'error', () => {});
  await sendMail({ to: 'secret-recipient@example.com', subject: 's', html: 'h', requestId: 'r1' });
  assert.equal(errorSpy.mock.callCount(), 1);
  const [message, meta] = errorSpy.mock.calls[0].arguments;
  assert.equal(message, 'Failed to send email');
  assert.deepEqual(meta, { requestId: 'r1', code: 'HTTP_422' });
  assert.doesNotMatch(JSON.stringify(errorSpy.mock.calls.map((c) => c.arguments)), /secret-recipient/);
});

test('a network error is logged the same way, without throwing', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  mock.method(globalThis, 'fetch', async () => { throw Object.assign(new Error('boom'), { name: 'TimeoutError' }); });
  const errorSpy = mock.method(logger, 'error', () => {});
  await sendMail({ to: 'a@example.com', subject: 's', html: 'h' });
  assert.deepEqual(errorSpy.mock.calls[0].arguments[1], { requestId: null, code: 'TimeoutError' });
});

test('nodemailer-style { name, address } recipients and reply-to become "Name <address>" strings', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  const fetchMock = mockFetch();
  await sendMail({
    to: { name: '', address: 'admin@example.com' },
    replyTo: { name: 'Amina <x>', address: 'amina@example.com' },
    subject: 's', html: 'h',
  });
  const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
  assert.equal(body.to, 'admin@example.com');
  assert.equal(body.reply_to, 'Amina x <amina@example.com>');
});

test('no provider: skipped with a warning, nothing sent', async () => {
  const fetchMock = mockFetch();
  const warnSpy = mock.method(logger, 'warn', () => {});
  await sendMail({ to: 'a@example.com', subject: 's', html: 'h' });
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(warnSpy.mock.calls[0].arguments[0], 'Skipped email — no email provider configured');
});
