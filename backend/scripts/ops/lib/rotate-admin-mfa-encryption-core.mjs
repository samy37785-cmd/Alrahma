// Pure, dependency-injected core logic for the AdminUser MFA-secret
// re-encryption tool (see ../rotate-admin-mfa-encryption.mjs for the real
// CLI entrypoint, and docs/admin-encryption-key-rotation-runbook.md for the
// operational procedure). No Mongoose/Mongo import anywhere in this file --
// the CLI wires up real data access; tests inject plain in-memory stubs.
//
// Nothing in this module ever logs a secret, ciphertext, id, or email --
// every exported function returns/consumes only status strings, counts,
// and opaque per-record write patches. A decrypted plaintext value is held
// only in memory, only long enough to be re-encrypted, and is never part
// of anything this module prints.
import crypto from 'node:crypto';

const ALGORITHM        = 'aes-256-gcm';
const AUTH_TAG_LENGTH   = 16; // bytes
const HEX_KEY_RE        = /^[0-9a-fA-F]{64}$/; // 32 bytes, hex-encoded

// The only two AdminUser fields this tool ever reads or writes — both
// AES-256-GCM ciphertext produced by backend/config/encryption.js's
// encrypt(), same iv:authTag:ciphertext format decrypted here directly
// (not via that module) so this tool can tell WHICH key decrypted a given
// value, which encrypt()/decrypt() deliberately don't expose.
export const MFA_FIELDS = ['_mfaSecret', '_mfaPendingSecret'];

export function isValidHexKey(hex) {
  return typeof hex === 'string' && HEX_KEY_RE.test(hex);
}

function decryptWithKeyHex(ciphertext, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const parts = String(ciphertext).split(':');
  if (parts.length !== 3) throw new Error('malformed ciphertext');
  const [ivHex, authTagHex, encHex] = parts;
  const iv        = Buffer.from(ivHex, 'hex');
  const authTag   = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher  = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// Classifies one field's ciphertext:
//   'absent'     - field is null/unset, nothing to do
//   'current'    - already decrypts under currentKeyHex, no rotation needed
//   'rotatable'  - fails currentKeyHex but decrypts under previousKeyHex
//   'unreadable' - fails both (or previousKeyHex isn't available) --
//                  forged, corrupt, or encrypted under neither known key
function classifyField(ciphertext, { currentKeyHex, previousKeyHex }) {
  if (ciphertext == null) return { status: 'absent' };
  try {
    decryptWithKeyHex(ciphertext, currentKeyHex);
    return { status: 'current' };
  } catch {
    if (!previousKeyHex) return { status: 'unreadable' };
    try {
      const plaintext = decryptWithKeyHex(ciphertext, previousKeyHex);
      return { status: 'rotatable', plaintext };
    } catch {
      return { status: 'unreadable' };
    }
  }
}

/**
 * Scans candidate records and classifies each MFA field. Never writes
 * anything — this is the shared logic behind both --dry-run's report and
 * --apply's plan, so a dry-run and a subsequent apply run see identical
 * classification for identical input.
 *
 * @param candidates - array of { id, _mfaSecret, _mfaPendingSecret }
 * @returns {{ counts: object, recordPlans: Array<{id, fields, recordStatus}> }}
 *   recordStatus is one of:
 *     'clean'     - nothing on this record needs rotation (all fields
 *                   already current or absent)
 *     'rotatable' - at least one field needs rotation, none unreadable
 *     'failed'    - at least one field is unreadable — the WHOLE record is
 *                   skipped on --apply, even fields on it that would
 *                   otherwise have rotated cleanly, per the "never
 *                   partially trust a record with a corrupt field" rule.
 */
export function planRotation(candidates, { currentKeyHex, previousKeyHex }) {
  const counts = {
    recordsScanned:    0,
    recordsClean:      0,
    recordsRotatable:  0,
    recordsFailed:     0,
    fieldsAlreadyCurrent: 0,
    fieldsRotatable:      0,
    fieldsUnreadable:     0,
    fieldsAbsent:         0,
  };
  const recordPlans = [];

  for (const doc of candidates) {
    counts.recordsScanned += 1;
    const fields = {};
    let hasUnreadable = false;
    let hasRotatable = false;

    for (const fieldName of MFA_FIELDS) {
      const result = classifyField(doc[fieldName], { currentKeyHex, previousKeyHex });
      fields[fieldName] = result;
      if (result.status === 'current') counts.fieldsAlreadyCurrent += 1;
      else if (result.status === 'rotatable') { counts.fieldsRotatable += 1; hasRotatable = true; }
      else if (result.status === 'unreadable') { counts.fieldsUnreadable += 1; hasUnreadable = true; }
      else counts.fieldsAbsent += 1;
    }

    const recordStatus = hasUnreadable ? 'failed' : hasRotatable ? 'rotatable' : 'clean';
    if (recordStatus === 'failed') counts.recordsFailed += 1;
    else if (recordStatus === 'rotatable') counts.recordsRotatable += 1;
    else counts.recordsClean += 1;

    recordPlans.push({ id: doc.id, fields, recordStatus });
  }

  return { counts, recordPlans };
}

/**
 * Applies a plan produced by planRotation(): for every record with
 * recordStatus 'rotatable', re-encrypts each 'rotatable' field with
 * encryptFn (callers MUST pass a function that only ever uses the current
 * key, e.g. config/encryption.js's encrypt() — this module never re-derives
 * or accepts a key for encryption itself) and writes the resulting patch
 * via writeFn in one call per record — a single atomic Mongo update
 * touching only the field(s) that actually changed. Records with
 * recordStatus 'failed' or 'clean' are never passed to writeFn at all.
 *
 * A writeFn rejection for one record is caught and counted, never thrown —
 * one record's write failure must not abort the rest of the run, and the
 * tool is safe to re-run afterward (a record whose write failed is still
 * exactly as it was before, so the next run classifies it the same way).
 *
 * @param writeFn - async (id, patch) => void, patch = { [fieldName]: newCiphertext }
 * @returns {{ written: number, skippedClean: number, skippedFailed: number, writeErrors: number }}
 */
export async function applyRotation(recordPlans, { encryptFn, writeFn }) {
  let written = 0;
  let skippedClean = 0;
  let skippedFailed = 0;
  let writeErrors = 0;

  for (const record of recordPlans) {
    if (record.recordStatus === 'failed') { skippedFailed += 1; continue; }
    if (record.recordStatus === 'clean') { skippedClean += 1; continue; }

    const patch = {};
    for (const [fieldName, result] of Object.entries(record.fields)) {
      if (result.status === 'rotatable') {
        patch[fieldName] = encryptFn(result.plaintext);
      }
    }

    try {
      await writeFn(record.id, patch);
      written += 1;
    } catch {
      writeErrors += 1;
    }
  }

  return { written, skippedClean, skippedFailed, writeErrors };
}
