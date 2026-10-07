import crypto from 'node:crypto';

const sha256 = (contents) => crypto.createHash('sha256').update(contents).digest('hex');

/**
 * Drizzle records a sha256 of the migration file bytes. Git may check the
 * same committed SQL out with LF or CRLF line endings, so byte-for-byte
 * comparison alone can report false drift across operating systems.
 *
 * Return only the raw, LF-normalized and CRLF-normalized hashes. No other
 * content difference is accepted.
 */
export function acceptedMigrationHashes(contents) {
  const raw = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  const text = raw.toString('utf8');
  const lf = text.replace(/\r\n?/g, '\n');
  const crlf = lf.replace(/\n/g, '\r\n');
  return [...new Set([sha256(raw), sha256(lf), sha256(crlf)])];
}

export function migrationHashMatches(actualHash, expected) {
  const allowed = expected.acceptedHashes ?? [expected.hash];
  return allowed.includes(actualHash);
}
