// Account import rules for migrate-users-to-supabase-auth.mjs. Pure, no
// I/O, so plan mode and the tests run exactly the same checks.
//
// PASSWORD_DECISION=IMPORT_BCRYPT_HASHES: each account is created in
// GoTrue with the source document's own bcrypt hash (admin createUser
// `password_hash`), so the person signs in with the password they already
// have. Nothing is generated, nothing is reset, no email is sent. A source
// document without a usable bcrypt hash is a validation failure that stops
// the run before any write -- it never falls back to a random password.

// $2a$/$2b$/$2y$, cost 04-31, 22-char salt + 31-char digest. The old
// backend writes bcryptjs `$2a$12$` hashes.
const BCRYPT_HASH_RE = /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;

/** True when `value` is a bcrypt hash GoTrue can verify a password against. */
export function isBcryptHash(value) {
  return typeof value === 'string' && BCRYPT_HASH_RE.test(value);
}

/**
 * Every user/admin document whose `password` is not a usable bcrypt hash.
 * Problems carry the source id and a reason -- never the email or hash.
 */
export function computePasswordHashProblems(users, admins) {
  const problems = [];
  const check = (kind, doc, index) => {
    const id = String(doc?._id ?? `${kind}#${index}`);
    const value = doc?.password;
    if (value === undefined || value === null || value === '') {
      problems.push({ kind, id, reason: 'missing password hash' });
    } else if (!isBcryptHash(value)) {
      problems.push({ kind, id, reason: 'password is not a bcrypt hash GoTrue can import' });
    }
  };
  users.forEach((u, i) => check('user', u, i));
  admins.forEach((a, i) => check('admin', a, i));
  return problems;
}

// Explicit verification flags a source document might carry. The current
// Mongo User model has none of them; they are honored if present so the
// contract below never overrides real source data.
const SOURCE_VERIFICATION_FIELDS = ['emailVerified', 'isEmailVerified', 'isVerified'];

/**
 * Email-confirmation contract, decided from source data only:
 *   1. an explicit boolean verification field on the document wins;
 *   2. a Google-linked account (googleId) is confirmed: the old backend
 *      only linked or created it after Google reported email_verified;
 *   3. otherwise confirmed, because the old system had no verification
 *      step at all -- register() signed the user in immediately -- so a
 *      confirmed GoTrue account keeps exactly the sign-in the person has
 *      today. Leaving it unconfirmed would lock every migrated user out.
 * The basis is returned so the run report can count each one.
 */
export function emailConfirmationFor(doc) {
  for (const field of SOURCE_VERIFICATION_FIELDS) {
    if (typeof doc?.[field] === 'boolean') {
      return { confirm: doc[field], basis: doc[field] ? 'source_field_verified' : 'source_field_unverified' };
    }
  }
  if (doc?.googleId) return { confirm: true, basis: 'google_verified_email' };
  return { confirm: true, basis: 'source_had_no_verification_step' };
}
