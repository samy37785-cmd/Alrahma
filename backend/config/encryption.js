import crypto from 'crypto';

const ALGORITHM       = 'aes-256-gcm';
const IV_LENGTH       = 16;  // bytes
const AUTH_TAG_LENGTH = 16;  // bytes
const KEY_LENGTH      = 32;  // bytes (256 bits)
const HEX_KEY_RE       = /^[0-9a-fA-F]{64}$/; // 32 bytes, hex-encoded

// `required: true` (ADMIN_ENCRYPTION_KEY) throws if unset — unchanged
// behavior. `required: false` (ADMIN_ENCRYPTION_KEY_PREVIOUS) returns null
// if unset; if SET but malformed, still throws (a present-but-invalid
// rotation key is a configuration error, not "no previous key"). Error
// messages never include the env var's value.
function parseKey(envVar, { required }) {
  const hex = process.env[envVar];
  if (!hex) {
    if (required) {
      throw new Error(`${envVar} is not set — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
    }
    return null;
  }
  if (!HEX_KEY_RE.test(hex)) {
    throw new Error(`${envVar} must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`);
  }
  return Buffer.from(hex, 'hex');
}

function getKey() {
  return parseKey('ADMIN_ENCRYPTION_KEY', { required: true });
}

// Optional key accepted only during a deliberate, operator-controlled
// rotation window (see docs/adr or .env.example for the rotation
// procedure). decrypt() falls back to this ONLY when ADMIN_ENCRYPTION_KEY
// fails AES-GCM verification for a given ciphertext — encrypt() never
// reads this at all, so every newly-encrypted value always uses the
// current key. Left unset, decrypt() behaves exactly as it did before
// this function existed: one key, fail closed on any verification error.
function getPreviousKey() {
  return parseKey('ADMIN_ENCRYPTION_KEY_PREVIOUS', { required: false });
}

function decryptWithKey(key, iv, authTag, encrypted) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Encrypts plaintext with AES-256-GCM (authenticated encryption).
 * Returns a colon-separated string:  ivHex:authTagHex:ciphertextHex
 * The auth tag prevents ciphertext tampering (integrity guarantee).
 * Always uses ADMIN_ENCRYPTION_KEY — never ADMIN_ENCRYPTION_KEY_PREVIOUS.
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a value produced by encrypt(). Tries ADMIN_ENCRYPTION_KEY
 * first; only if that fails AES-GCM verification, and
 * ADMIN_ENCRYPTION_KEY_PREVIOUS is set and valid, retries with the
 * previous key — supporting a rotation window during which old ciphertext
 * (encrypted under the previous key) and new ciphertext (encrypted under
 * the current key) coexist. Throws if both keys fail (or if only the
 * current key exists and fails), same as before this fallback existed.
 */
export function decrypt(ciphertext) {
  const parts = String(ciphertext).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format — expected iv:authTag:ciphertext');
  const [ivHex, authTagHex, encHex] = parts;
  const iv        = Buffer.from(ivHex, 'hex');
  const authTag   = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');

  const currentKey = getKey();
  try {
    return decryptWithKey(currentKey, iv, authTag, encrypted);
  } catch (verifyErr) {
    const previousKey = getPreviousKey();
    if (!previousKey) throw verifyErr;
    return decryptWithKey(previousKey, iv, authTag, encrypted);
  }
}

/**
 * Anonymizes an IP address per GDPR Article 4(1):
 * masks the last octet of IPv4, or the last 4 groups of IPv6.
 */
export function anonymizeIp(ip) {
  if (!ip) return null;
  // Strip IPv4-mapped IPv6 prefix
  const raw = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (raw.includes(':')) {
    // IPv6 — keep first 4 groups
    const groups = raw.split(':');
    return `${groups.slice(0, 4).join(':')}:xxxx:xxxx:xxxx:xxxx`;
  }
  // IPv4 — mask last octet
  const parts = raw.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  return 'unknown';
}
