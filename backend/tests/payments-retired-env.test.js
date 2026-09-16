import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Scope correction (see docs/current-project-status.md): proves that
// payment-gateway env vars (Stripe/PayPal gateway secrets, plus the
// manual-transfer display fields no route requires at startup) are absent
// from operational validation (config/validateEnv.js) and that nothing in
// the codebase still silently depends on them being present at boot.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, '..');

const PAYMENT_GATEWAY_ENV_VAR_NAMES = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'PAYPAL_MODE', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID',
  'PAYPAL_RECEIVER_EMAIL', 'PAYPAL_ME_LINK',
  'WU_RECEIVER_NAME', 'WU_RECEIVER_COUNTRY', 'WU_RECEIVER_CITY',
  'MG_RECEIVER_NAME', 'MG_RECEIVER_COUNTRY', 'MG_RECEIVER_CITY',
  'PAYONEER_EMAIL',
  'BANK_IBAN', 'BANK_ACCOUNT_NAME', 'BANK_SWIFT', 'BANK_NAME', 'BANK_COUNTRY', 'BANK_CURRENCY',
];

test('static: config/validateEnv.js no longer references any payment-gateway environment variable', () => {
  const source = readFileSync(path.join(BACKEND_ROOT, 'config/validateEnv.js'), 'utf8');
  for (const name of PAYMENT_GATEWAY_ENV_VAR_NAMES) {
    assert.doesNotMatch(source, new RegExp(name), `validateEnv.js must not reference ${name} any more`);
  }
});

test('validateEnv() does not exit, and warns about nothing payment-related, when every payment-gateway env var is absent (Mongo mode)', async () => {
  const prevEnv = { ...process.env };
  try {
    for (const name of PAYMENT_GATEWAY_ENV_VAR_NAMES) delete process.env[name];
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-payments-retired-env';
    process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:1/unused-placeholder';
    process.env.DATA_BACKEND = 'mongodb';
    delete process.env.NODE_ENV;

    const exitMock = mock.method(process, 'exit', () => {
      throw new Error('process.exit should not have been called');
    });
    const warnedTopics = [];
    const loggerUrl = new URL('../config/logger.js', import.meta.url).href;
    const realLoggerModule = await import(loggerUrl);
    mock.module(loggerUrl, {
      exports: {
        ...realLoggerModule,
        default: {
          ...realLoggerModule.default,
          warn: (msg, meta) => { warnedTopics.push({ msg, meta }); },
          error: realLoggerModule.default.error.bind(realLoggerModule.default),
        },
      },
    });

    try {
      const { validateEnv } = await import(`../config/validateEnv.js?t=${Date.now()}-${Math.random()}`);
      assert.doesNotThrow(() => validateEnv());
      assert.equal(exitMock.mock.calls.length, 0);
      // Whatever IS warned about (CRON_SECRET/SMTP_*/CLIENT_URL — unrelated,
      // pre-existing RECOMMENDED vars) must not mention any payment var.
      for (const { meta } of warnedTopics) {
        const absent = meta?.absent ?? [];
        for (const name of PAYMENT_GATEWAY_ENV_VAR_NAMES) {
          assert.ok(!absent.includes(name), `unexpected payment-gateway var in a startup warning: ${name}`);
        }
      }
    } finally {
      exitMock.mock.restore();
      mock.restoreAll();
    }
  } finally {
    process.env = prevEnv;
  }
});

test('end-to-end: with every payment-gateway env var absent, the app still boots and a card-gateway route still returns a clean 410 (no accidental runtime dependency on those vars)', async () => {
  const prevEnv = { ...process.env };
  try {
    for (const name of PAYMENT_GATEWAY_ENV_VAR_NAMES) delete process.env[name];

    const { setupTestDb, teardownTestDb } = await import(`./helpers/db.js?t=${Date.now()}-${Math.random()}`);
    const { agentWithCsrf } = await import('./helpers/csrf.js');
    await setupTestDb();
    try {
      const { default: app } = await import(`../app.js?t=${Date.now()}-${Math.random()}`);
      const { agent, csrf } = await agentWithCsrf(app);
      const res = await agent.post('/api/payments/stripe').set(csrf).send({ plan: 'Starter' });
      assert.equal(res.status, 410);
      assert.deepEqual(res.body, { error: 'ONLINE_CARD_PAYMENTS_DISABLED' });
    } finally {
      await teardownTestDb();
    }
  } finally {
    process.env = prevEnv;
  }
});
