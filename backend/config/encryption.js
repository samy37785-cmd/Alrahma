import crypto from 'crypto';

const ALGORITHM       = 'aes-256-gcm';
const IV_LENGTH       = 16;  // bytes
const AUTH_TAG_LENGTH = 16;  // bytes
const KEY_LENGTH      = 32;  // bytes (256 bits)

function getKey() {
  const hex = process.env.ADMIN_ENCRYPTION_KEY;
  if (!hex) throw new Error('ADMIN_ENCRYPTION_KEY is not set — generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ADMIN_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`);
  }
  return key;
}

/**
 * Encrypts plaintext with AES-256-GCM (authenticated encryption).
 * Returns a colon-separated string:  ivHex:authTagHex:ciphertextHex
 * The auth tag prevents ciphertext tampering (integrity guarantee).
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
 * Decrypts a value produced by encrypt().
 * Throws if the auth tag is invalid (tampered data).
 */
export function decrypt(ciphertext) {
  const key   = getKey();
  const parts = String(ciphertext).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format — expected iv:authTag:ciphertext');
  const [ivHex, authTagHex, encHex] = parts;
  const iv        = Buffer.from(ivHex, 'hex');
  const authTag   = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher  = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
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
