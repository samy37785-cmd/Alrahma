// Super Admin email collision check (SUPER_ADMIN_SAFETY_GATE, phase 1).
//
// The owner's real Super Admin must use an email that appears NOWHERE in
// the Mongo source: not as an account, and not as a lead, subscriber,
// enrollment or payment contact. An account email that matches a source
// user also makes the user migration block that user
// (blocked_foreign_account_same_email). Everything here is pure; the CLI
// (../check-super-admin-email-collision.mjs) does the restore and I/O.
//
// Two levels of "same email", and either one is a conflict:
//   - exact: trimmed, Unicode NFKC, lowercased;
//   - same mailbox: additionally without a "+tag" in the local part and,
//     for gmail.com/googlemail.com, without dots in the local part (both
//     domains deliver to one mailbox).
// Nothing here ever returns or logs an email: callers get a boolean.

const EMAIL_IN_TEXT = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+/g;
const WHOLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function normalizeEmail(value) {
  return String(value).normalize('NFKC').trim().toLowerCase();
}

export function isEmailShaped(value) {
  return typeof value === 'string' && WHOLE_EMAIL.test(normalizeEmail(value));
}

/** The mailbox an address delivers to (see the header). Input must be email-shaped. */
export function mailboxKey(value) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf('@');
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

/**
 * Every email-looking substring of every string anywhere in `value`
 * (nested objects and arrays included; object keys too). Returned
 * normalized. Non-plain values (Dates, ObjectIds, binary) are skipped.
 */
export function extractEmailsDeep(value, out = new Set(), depth = 0) {
  if (depth > 64 || value === null || value === undefined) return out;
  if (typeof value === 'string') {
    for (const match of value.match(EMAIL_IN_TEXT) ?? []) out.add(normalizeEmail(match));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractEmailsDeep(item, out, depth + 1);
    return out;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      extractEmailsDeep(key, out, depth + 1);
      extractEmailsDeep(item, out, depth + 1);
    }
  }
  return out;
}

/** True when `candidate` equals, or shares a mailbox with, any source email. */
export function hasEmailConflict(candidate, sourceEmails) {
  if (!isEmailShaped(candidate)) throw new Error('the entered value is not an email address');
  const exact = normalizeEmail(candidate);
  const mailbox = mailboxKey(candidate);
  for (const source of sourceEmails) {
    if (source === exact) return true;
    if (isEmailShaped(source) && mailboxKey(source) === mailbox) return true;
  }
  return false;
}

/** The only line the checker ever prints on success. */
export function formatResult(conflict) {
  return `SUPER_ADMIN_EMAIL_CONFLICT=${conflict ? 'YES' : 'NO'}`;
}
