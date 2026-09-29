import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  planRotation,
  applyRotation,
  isValidHexKey,
  MFA_FIELDS,
} from '../scripts/ops/lib/rotate-admin-mfa-encryption-core.mjs';
import {
  CLI_SPEC,
  validateCliArgs,
  resolveRunConfig,
} from '../scripts/ops/rotate-admin-mfa-encryption.mjs';
import { parseStrictCliArgs } from '../scripts/migration/lib/cli-args.mjs';
import { encrypt } from '../config/encryption.js';

// Ops tooling for rotating ADMIN_ENCRYPTION_KEY without breaking existing
// encrypted AdminUser._mfaSecret / _mfaPendingSecret values. Every test
// here uses plain in-memory objects/arrays as Mongo stand-ins — no
// mongoose, no mongodb-memory-server, no real or local database connection
// anywhere in this file, matching the task's "Mongo mock/stubs only" rule.
// This tool is never actually run against any database as part of this
// change — see docs/admin-encryption-key-rotation-runbook.md.

const ORIGINAL_CURRENT  = process.env.ADMIN_ENCRYPTION_KEY;
const ORIGINAL_PREVIOUS = process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS;

function randomHexKey() {
  return crypto.randomBytes(32).toString('hex');
}

// encrypt() reads ADMIN_ENCRYPTION_KEY from process.env on every call, so
// this helper temporarily swaps it to produce a fixture ciphertext under an
// arbitrary key, then restores whatever was there before.
function encryptUnderKey(plaintext, keyHex) {
  const before = process.env.ADMIN_ENCRYPTION_KEY;
  process.env.ADMIN_ENCRYPTION_KEY = keyHex;
  try {
    return encrypt(plaintext);
  } finally {
    if (before === undefined) delete process.env.ADMIN_ENCRYPTION_KEY;
    else process.env.ADMIN_ENCRYPTION_KEY = before;
  }
}

beforeEach(() => {
  delete process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS;
});

afterEach(() => {
  if (ORIGINAL_CURRENT === undefined) delete process.env.ADMIN_ENCRYPTION_KEY;
  else process.env.ADMIN_ENCRYPTION_KEY = ORIGINAL_CURRENT;
  if (ORIGINAL_PREVIOUS === undefined) delete process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS;
  else process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS = ORIGINAL_PREVIOUS;
});

// ── CLI safety gate (section 4's protections) ──────────────────────────────

test('validateCliArgs: --apply without --confirm-rotation is rejected', () => {
  assert.throws(() => validateCliArgs({ apply: true }), /--confirm-rotation/);
});

test('validateCliArgs: --apply with --confirm-rotation is accepted', () => {
  assert.doesNotThrow(() => validateCliArgs({ apply: true, 'confirm-rotation': true }));
});

test('validateCliArgs: --confirm-rotation without --apply is rejected', () => {
  assert.throws(() => validateCliArgs({ 'confirm-rotation': true }), /only has meaning together with --apply/);
});

test('validateCliArgs: bare dry-run (no flags) and explicit --dry-run are both accepted', () => {
  assert.doesNotThrow(() => validateCliArgs({}));
  assert.doesNotThrow(() => validateCliArgs({ 'dry-run': true }));
});

test('resolveRunConfig: --apply without ALLOW_ADMIN_MFA_KEY_ROTATION=1 is rejected', () => {
  const args = parseStrictCliArgs(['--apply', '--confirm-rotation'], CLI_SPEC);
  const env = {
    MONGO_URI: 'mongodb://127.0.0.1:27017/test',
    ADMIN_ENCRYPTION_KEY: randomHexKey(),
    ADMIN_ENCRYPTION_KEY_PREVIOUS: randomHexKey(),
    // ALLOW_ADMIN_MFA_KEY_ROTATION deliberately absent
  };
  assert.throws(() => resolveRunConfig({ args, env }), /ALLOW_ADMIN_MFA_KEY_ROTATION/);
});

test('resolveRunConfig: --apply with authorization but no previous key is rejected', () => {
  const args = parseStrictCliArgs(['--apply', '--confirm-rotation'], CLI_SPEC);
  const env = {
    MONGO_URI: 'mongodb://127.0.0.1:27017/test',
    ADMIN_ENCRYPTION_KEY: randomHexKey(),
    ALLOW_ADMIN_MFA_KEY_ROTATION: '1',
    // ADMIN_ENCRYPTION_KEY_PREVIOUS deliberately absent
  };
  assert.throws(() => resolveRunConfig({ args, env }), /ADMIN_ENCRYPTION_KEY_PREVIOUS/);
});

test('resolveRunConfig: fully authorized --apply is accepted', () => {
  const args = parseStrictCliArgs(['--apply', '--confirm-rotation'], CLI_SPEC);
  const env = {
    MONGO_URI: 'mongodb://127.0.0.1:27017/test',
    ADMIN_ENCRYPTION_KEY: randomHexKey(),
    ADMIN_ENCRYPTION_KEY_PREVIOUS: randomHexKey(),
    ALLOW_ADMIN_MFA_KEY_ROTATION: '1',
  };
  const config = resolveRunConfig({ args, env });
  assert.equal(config.apply, true);
});

test('resolveRunConfig: dry-run needs no authorization variable and no previous key', () => {
  const args = parseStrictCliArgs([], CLI_SPEC);
  const env = { MONGO_URI: 'mongodb://127.0.0.1:27017/test', ADMIN_ENCRYPTION_KEY: randomHexKey() };
  const config = resolveRunConfig({ args, env });
  assert.equal(config.apply, false);
  assert.equal(config.previousKeyHex, null);
});

// ── planRotation / applyRotation (core logic) ──────────────────────────────

test('dry-run (planRotation alone) never writes: no write function exists in its signature, and it returns a plan only', () => {
  const currentKeyHex = randomHexKey();
  const previousKeyHex = randomHexKey();
  const ciphertext = encryptUnderKey('a-totp-seed', previousKeyHex);

  const { counts, recordPlans } = planRotation(
    [{ id: 'admin-1', _mfaSecret: ciphertext, _mfaPendingSecret: null }],
    { currentKeyHex, previousKeyHex }
  );

  assert.equal(counts.recordsRotatable, 1);
  assert.equal(recordPlans.length, 1);
  // planRotation's own signature has no writeFn parameter at all -- there
  // is structurally no way for it to perform a write.
  assert.equal(planRotation.length, 2);
});

test('a record encrypted under the previous key is re-encrypted under the current key on apply', async () => {
  const currentKeyHex = randomHexKey();
  const previousKeyHex = randomHexKey();
  const oldCiphertext = encryptUnderKey('rotate-me', previousKeyHex);

  const { recordPlans } = planRotation(
    [{ id: 'admin-1', _mfaSecret: oldCiphertext, _mfaPendingSecret: null }],
    { currentKeyHex, previousKeyHex }
  );

  const writes = [];
  process.env.ADMIN_ENCRYPTION_KEY = currentKeyHex; // encrypt() reads this
  const result = await applyRotation(recordPlans, {
    encryptFn: encrypt,
    writeFn: async (id, patch) => { writes.push({ id, patch }); },
  });

  assert.equal(result.written, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, 'admin-1');
  const newCiphertext = writes[0].patch._mfaSecret;
  assert.notEqual(newCiphertext, oldCiphertext);

  // The new ciphertext must decrypt under the CURRENT key alone.
  const verify = planRotation([{ id: 'admin-1', _mfaSecret: newCiphertext, _mfaPendingSecret: null }], {
    currentKeyHex,
    previousKeyHex: null,
  });
  assert.equal(verify.counts.fieldsAlreadyCurrent, 1);
});

test('a record already encrypted under the current key is never rewritten', async () => {
  const currentKeyHex = randomHexKey();
  const previousKeyHex = randomHexKey();
  const ciphertext = encryptUnderKey('already-current', currentKeyHex);

  const { counts, recordPlans } = planRotation(
    [{ id: 'admin-1', _mfaSecret: ciphertext, _mfaPendingSecret: null }],
    { currentKeyHex, previousKeyHex }
  );
  assert.equal(counts.recordsClean, 1);

  let writeCalled = false;
  const result = await applyRotation(recordPlans, {
    encryptFn: encrypt,
    writeFn: async () => { writeCalled = true; },
  });

  assert.equal(writeCalled, false);
  assert.equal(result.skippedClean, 1);
  assert.equal(result.written, 0);
});

test('_mfaPendingSecret is classified and rotated the same way as _mfaSecret', async () => {
  const currentKeyHex = randomHexKey();
  const previousKeyHex = randomHexKey();
  const oldPending = encryptUnderKey('pending-setup-seed', previousKeyHex);

  assert.ok(MFA_FIELDS.includes('_mfaPendingSecret'));

  const { recordPlans } = planRotation(
    [{ id: 'admin-1', _mfaSecret: null, _mfaPendingSecret: oldPending }],
    { currentKeyHex, previousKeyHex }
  );
  assert.equal(recordPlans[0].fields._mfaPendingSecret.status, 'rotatable');

  const writes = [];
  process.env.ADMIN_ENCRYPTION_KEY = currentKeyHex;
  await applyRotation(recordPlans, {
    encryptFn: encrypt,
    writeFn: async (id, patch) => { writes.push(patch); },
  });

  assert.ok(writes[0]._mfaPendingSecret);
  assert.equal(writes[0]._mfaSecret, undefined); // untouched field never in the patch
});

test('a forged/unreadable ciphertext is never written, even when other fields on the same record would rotate', async () => {
  const currentKeyHex = randomHexKey();
  const previousKeyHex = randomHexKey();
  const goodOld = encryptUnderKey('legit-secret', previousKeyHex);
  const forged = `${crypto.randomBytes(16).toString('hex')}:${crypto.randomBytes(16).toString('hex')}:${crypto.randomBytes(32).toString('hex')}`;

  const { counts, recordPlans } = planRotation(
    [{ id: 'admin-1', _mfaSecret: forged, _mfaPendingSecret: goodOld }],
    { currentKeyHex, previousKeyHex }
  );
  assert.equal(counts.recordsFailed, 1);
  assert.equal(recordPlans[0].recordStatus, 'failed');

  let writeCalled = false;
  const result = await applyRotation(recordPlans, {
    encryptFn: encrypt,
    writeFn: async () => { writeCalled = true; },
  });

  assert.equal(writeCalled, false);
  assert.equal(result.skippedFailed, 1);
  assert.equal(result.written, 0);
});

test('isValidHexKey rejects malformed/short/non-hex values', () => {
  assert.equal(isValidHexKey(randomHexKey()), true);
  assert.equal(isValidHexKey('too-short'), false);
  assert.equal(isValidHexKey(null), false);
  assert.equal(isValidHexKey(undefined), false);
  assert.equal(isValidHexKey('g'.repeat(64)), false); // right length, not hex
});

test('no secret, plaintext, or ciphertext ever reaches stdout/stderr during a full plan+apply run', async () => {
  const currentKeyHex = randomHexKey();
  const previousKeyHex = randomHexKey();
  const secretPlaintext = 'JBSWY3DPEHPK3PXP-super-secret-totp-seed';
  const oldCiphertext = encryptUnderKey(secretPlaintext, previousKeyHex);

  const captured = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...a) => captured.push(a.join(' '));
  console.error = (...a) => captured.push(a.join(' '));

  try {
    const { recordPlans } = planRotation(
      [{ id: 'admin-1', _mfaSecret: oldCiphertext, _mfaPendingSecret: null }],
      { currentKeyHex, previousKeyHex }
    );
    process.env.ADMIN_ENCRYPTION_KEY = currentKeyHex;
    const result = await applyRotation(recordPlans, {
      encryptFn: encrypt,
      writeFn: async () => {},
    });
    // Exercise something that DOES log, to prove the capture actually works.
    console.log('scan complete', JSON.stringify({ written: result.written }));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.ok(captured.length > 0, 'sanity check: logging capture actually captured something');
  const joined = captured.join('\n');
  assert.doesNotMatch(joined, /admin-1/);
  assert.doesNotMatch(joined, new RegExp(secretPlaintext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(joined, new RegExp(oldCiphertext));
  assert.doesNotMatch(joined, new RegExp(currentKeyHex));
  assert.doesNotMatch(joined, new RegExp(previousKeyHex));
});
