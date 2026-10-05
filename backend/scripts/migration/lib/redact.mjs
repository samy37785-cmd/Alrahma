// Output redaction for the migration tools (owner decision LOGGING_DECISION=
// REDACT). Nothing these tools print, write to a report file, or store in
// migration_source_ledger.error_reason may carry an email address, a
// password hash, a connection string or an access token. Identifiers are
// replaced by a short, stable fingerprint so an operator can still match
// the same value across lines without ever seeing it.
//
// Two layers, deliberately both:
//   1. Messages are written without values in the first place (field
//      names, source ids and counts only).
//   2. redactText()/redactDeep() run over every string on its way out, so
//      a value that slips into a message anyway (a GoTrue error text, a
//      driver error) is still caught.
import crypto from 'node:crypto';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BCRYPT_RE = /\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const URI_RE = /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp)s?:\/\/[^\s'"`)]+/gi;
const BEARER_RE = /\b(Bearer|apikey)\s+[A-Za-z0-9._~+/=-]{16,}/gi;

/** Stable, non-reversible short fingerprint of a value (case/space-insensitive). */
export function fingerprint(value) {
  const normalized = String(value).toLowerCase().trim();
  return `fp:${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12)}`;
}

/** Redacts every sensitive pattern in one string. Non-strings pass through. */
export function redactText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(URI_RE, '<connection-string>')
    .replace(BCRYPT_RE, '<password-hash>')
    .replace(JWT_RE, '<token>')
    .replace(BEARER_RE, '$1 <token>')
    .replace(EMAIL_RE, (m) => `<email ${fingerprint(m)}>`);
}

/** Deep copy of `value` with every string redacted. Dates become ISO strings. */
export function redactDeep(value) {
  if (typeof value === 'string') return redactText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}

function redactArg(arg) {
  if (typeof arg === 'string') return redactText(arg);
  if (arg instanceof Error) return redactText(arg.stack || arg.message);
  if (arg && typeof arg === 'object') return redactDeep(arg);
  return arg;
}

/**
 * Wraps console.log/info/warn/error so everything a CLI run prints is
 * redacted. Called from each tool's main() only, never at import time, so
 * tests that import a module keep the real console. Returns a restore fn.
 */
export function installRedactingConsole() {
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const level of Object.keys(original)) {
    console[level] = (...args) => original[level](...args.map(redactArg));
  }
  return () => Object.assign(console, original);
}
