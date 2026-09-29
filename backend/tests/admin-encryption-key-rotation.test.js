import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encrypt, decrypt } from '../config/encryption.js';

// Dual-key rotation support for ADMIN_ENCRYPTION_KEY: decrypt() tries the
// current key first and, only on AES-GCM verification failure, falls back
// to ADMIN_ENCRYPTION_KEY_PREVIOUS when it is set — letting a key rotation
// deploy without breaking MFA secrets/SystemConfig values already encrypted
// under the old key. encrypt() always uses only the current key.
//
// process.env is read fresh on every encrypt()/decrypt() call (no
// module-level key caching), so each test can freely set/unset both vars
// without re-importing the module.

const ORIGINAL_CURRENT  = process.env.ADMIN_ENCRYPTION_KEY;
const ORIGINAL_PREVIOUS = process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS;

function randomHexKey() {
  return crypto.randomBytes(32).toString('hex');
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

test('new plaintext encrypted with the current key decrypts successfully', () => {
  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey();
  const ciphertext = encrypt('super-secret-totp-seed');
  assert.equal(decrypt(ciphertext), 'super-secret-totp-seed');
});

test('old ciphertext encrypted under the previous key decrypts via fallback', () => {
  const oldKey = randomHexKey();
  const newKey = randomHexKey();

  process.env.ADMIN_ENCRYPTION_KEY = oldKey;
  const oldCiphertext = encrypt('value-from-before-rotation');

  // Rotate: current becomes the new key, previous becomes the old key.
  process.env.ADMIN_ENCRYPTION_KEY = newKey;
  process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS = oldKey;

  assert.equal(decrypt(oldCiphertext), 'value-from-before-rotation');
});

test('ciphertext already under the current key needs no fallback (works even with a bogus previous key present)', () => {
  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey();
  const ciphertext = encrypt('already-current-key');

  // An invalid previous key must never be consulted when the current key
  // already succeeds -- if it were, this would throw instead of returning.
  process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS = 'not-valid-hex-at-all';

  assert.equal(decrypt(ciphertext), 'already-current-key');
});

test('absent ADMIN_ENCRYPTION_KEY_PREVIOUS preserves the original single-key behavior exactly', () => {
  const keyA = randomHexKey();
  const keyB = randomHexKey();

  process.env.ADMIN_ENCRYPTION_KEY = keyA;
  const ciphertext = encrypt('only-one-key-in-play');

  // Rotate to a different current key with no previous key configured at all.
  process.env.ADMIN_ENCRYPTION_KEY = keyB;
  delete process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS;

  assert.throws(() => decrypt(ciphertext));
});

test('a wrong current key with no previous key fails closed', () => {
  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey();
  const ciphertext = encrypt('value');
  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey(); // different key, no previous set
  assert.throws(() => decrypt(ciphertext));
});

test('both current and previous keys wrong fails closed', () => {
  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey();
  const ciphertext = encrypt('value');
  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey();
  process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS = randomHexKey(); // neither matches
  assert.throws(() => decrypt(ciphertext));
});

test('a forged/tampered ciphertext fails closed even with a valid previous key configured', () => {
  const oldKey = randomHexKey();
  process.env.ADMIN_ENCRYPTION_KEY = oldKey;
  const ciphertext = encrypt('value');
  const [iv, authTag, enc] = ciphertext.split(':');
  const tampered = `${iv}:${authTag}:${enc.slice(0, -2)}${enc.slice(-2) === '00' ? '11' : '00'}`;

  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey();
  process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS = oldKey;

  assert.throws(() => decrypt(tampered));
});

test('a present but malformed ADMIN_ENCRYPTION_KEY_PREVIOUS fails closed with a safe, value-free message', () => {
  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey();
  const ciphertext = encrypt('value');
  process.env.ADMIN_ENCRYPTION_KEY = randomHexKey(); // force fallback to be attempted
  process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS = 'too-short';

  assert.throws(() => decrypt(ciphertext), (err) => {
    assert.match(err.message, /ADMIN_ENCRYPTION_KEY_PREVIOUS must be 64 hex characters/);
    assert.doesNotMatch(err.message, /too-short/);
    return true;
  });
});

test('encrypt() never uses ADMIN_ENCRYPTION_KEY_PREVIOUS, even when it is set', () => {
  const currentKey = randomHexKey();
  const previousKey = randomHexKey();
  process.env.ADMIN_ENCRYPTION_KEY = currentKey;
  process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS = previousKey;

  const ciphertext = encrypt('freshly-encrypted-value');

  // Decrypting with ONLY the current key (no previous key at all) must
  // succeed -- proving the ciphertext was produced with the current key,
  // not the previous one.
  delete process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS;
  assert.equal(decrypt(ciphertext), 'freshly-encrypted-value');
});
