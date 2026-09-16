import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Corrective revision (see docs/current-project-status.md): an independent
// review found that config/mailer.js's sendMail() caught every SMTP error
// internally and returned `undefined` on EVERY path — skipped, sent, or a
// genuine transport failure — indistinguishable to any caller. Every test
// that previously exercised "a failed booking notification" mocked
// config/mailer.js's OWN sendMail export to reject directly — that is NOT
// what the real function does (it never rejects), so those tests were
// proving nothing about the real failure path at all. This file mocks
// `nodemailer` itself (one level below config/mailer.js) so sendMail()'s
// REAL try/catch and REAL returned `{ ok, error }` shape are the thing
// under test, exactly the contract a genuine SMTP outage would exercise.

async function importMailerWithFakeTransport(sendMailImpl) {
  mock.module('nodemailer', {
    exports: { default: { createTransport: () => ({ sendMail: sendMailImpl }) } },
  });
  process.env.SMTP_USER = 'ops@example.com';
  process.env.SMTP_PASS = 'app-password';
  return import(`../config/mailer.js?t=${Date.now()}-${Math.random()}`);
}

test('sendMail(): a real transport success returns { ok: true }', async () => {
  try {
    const { sendMail } = await importMailerWithFakeTransport(async () => ({ messageId: 'abc' }));
    const result = await sendMail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' });
    assert.deepEqual(result, { ok: true });
  } finally {
    mock.reset();
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  }
});

test('sendMail(): a real transport rejection is caught and returns { ok: false, error } — never throws', async () => {
  try {
    const { sendMail } = await importMailerWithFakeTransport(async () => { throw new Error('Connection timeout to smtp.gmail.com'); });
    const result = await sendMail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' });
    assert.equal(result.ok, false);
    assert.match(result.error, /Connection timeout/);
  } finally {
    mock.reset();
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  }
});

test('sendMail(): with no SMTP_USER/SMTP_PASS configured, returns { ok: false, skipped: true } without ever touching the transport', async () => {
  const prevEnv = { ...process.env };
  try {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    let transportCalled = false;
    mock.module('nodemailer', {
      exports: { default: { createTransport: () => ({ sendMail: async () => { transportCalled = true; } }) } },
    });
    const { sendMail } = await import(`../config/mailer.js?t=${Date.now()}-${Math.random()}`);
    const result = await sendMail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' });
    assert.deepEqual(result, { ok: false, error: 'SMTP_NOT_CONFIGURED', skipped: true });
    assert.equal(transportCalled, false, 'the transport must never be constructed/called when SMTP is not configured');
  } finally {
    mock.reset();
    process.env = prevEnv;
  }
});
