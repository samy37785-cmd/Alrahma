// Owner decision DECISION_RESET_TOKEN_EXPIRY: short-lived credentials and
// their state are never migrated, and the report says so by name -- an
// intentional exclusion, never a silent omission.
//
//   users.resetToken / users.resetTokenExpiry: a pending password-reset
//     link of the old system. Migrated accounts sign in with their imported
//     bcrypt hash; Supabase Auth issues its own reset links, and no reset
//     is ever sent by the migration.
//   refreshtokens (whole collection): the old system's refresh-token
//     families. Supabase Auth issues its own sessions; every old session
//     ends at cutover.
//
// The tools only ever COUNT these (presence, never the value). Nothing
// reads a token's value into anything that is written, logged or reported;
// lib/security-ephemeral.test.mjs guards that structurally.

export const SECURITY_EPHEMERAL_CLASSIFICATION = 'INTENTIONALLY_NOT_MIGRATED_SECURITY_EPHEMERAL_DATA';
export const SECURITY_EPHEMERAL_USER_FIELDS = Object.freeze(['resetToken', 'resetTokenExpiry']);
export const SECURITY_EPHEMERAL_COLLECTIONS = Object.freeze(['refreshtokens']);

const present = (value) => value !== null && value !== undefined && value !== '';

/**
 * The report section: how many source values fall under the
 * classification, by field and collection. Counts only.
 *
 * @param {object[]} users - source users documents
 * @param {Record<string, number>} collectionCounts - document count per SECURITY_EPHEMERAL_COLLECTIONS entry
 */
export function securityEphemeralReport(users, collectionCounts) {
  const fields = {};
  for (const field of SECURITY_EPHEMERAL_USER_FIELDS) {
    fields[`users.${field}`] = users.filter((u) => present(u?.[field])).length;
  }
  const collections = {};
  for (const name of SECURITY_EPHEMERAL_COLLECTIONS) {
    const n = collectionCounts?.[name];
    if (!Number.isInteger(n) || n < 0) throw new Error(`securityEphemeralReport: no document count for ${name}`);
    collections[name] = n;
  }
  return { classification: SECURITY_EPHEMERAL_CLASSIFICATION, migrated: false, fields, collections };
}
