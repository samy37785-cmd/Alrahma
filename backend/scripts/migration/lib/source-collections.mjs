// Every collection of the Mongo source database, accounted for by name.
//
// The two worker tools only ever READ the collections they know. A document
// sitting in any other collection would therefore be left behind without a
// word: no error, no report line, no row in the target. Between the backup
// that was reviewed and the one an execute run reads, a collection that was
// empty could fill (or a new one appear), so "all of them are empty today"
// is not a property the tools can rely on. This registry closes it: a source
// database is only accepted when every collection in it is either
//   - migrated (read by the user tool or by a mongo-to-supabase domain),
//   - security-ephemeral (counted, never migrated: lib/security-ephemeral.mjs), or
//   - retired (no live model, no target table) and EMPTY,
// and an unknown collection is accepted only while it holds no document.
// Output is collection names and counts only -- never a value.
import { SECURITY_EPHEMERAL_COLLECTIONS } from './security-ephemeral.mjs';

/** Read by migrate-users-to-supabase-auth.mjs. */
export const USER_TOOL_COLLECTIONS = Object.freeze(['users', 'adminusers']);

/** Read by a mongo-to-supabase.mjs domain (DOMAINS[*].export()). */
export const DOMAIN_TOOL_COLLECTIONS = Object.freeze([
  'blogs', 'certificates', 'contactmessages', 'counters', 'coupons', 'courseprogresses', 'courses', 'enrollments',
  'hifzprogresses', 'invoices', 'liveclasses', 'manualpayments', 'messages', 'notifications', 'payments',
  'quranbookmarks', 'quranmemorizationstats', 'quranreadingprogresses', 'referrals', 'reviews', 'studentrecords',
  'subscribers', 'systemauditlogs', 'systemconfigs', 'trialrequests', 'wishlists',
]);

/**
 * Features that were retired: no live Mongoose model and no target table
 * (docs/product-scope-audit.md, docs/stage-2j-b-lossless-mapping-contract.md
 * section 14). Allowed in the source only while empty.
 */
export const RETIRED_COLLECTIONS = Object.freeze(['posts', 'comments', 'tutorconversations']);

export const SOURCE_COLLECTIONS_NOT_COVERED = 'SOURCE_COLLECTIONS_NOT_COVERED';

const MIGRATED = new Set([...USER_TOOL_COLLECTIONS, ...DOMAIN_TOOL_COLLECTIONS]);
const EPHEMERAL = new Set(SECURITY_EPHEMERAL_COLLECTIONS);
const RETIRED = new Set(RETIRED_COLLECTIONS);

/** MongoDB's own bookkeeping collections are not data. */
const isInternal = (name) => name.startsWith('system.');

/**
 * Pure. `counts` is { collectionName: documentCount } for every collection
 * present in the source. Returns what is not covered; empty arrays mean the
 * source is acceptable.
 */
export function classifySourceCollections(counts) {
  const out = { retiredWithData: [], unmappedWithData: [], unmappedEmpty: [], covered: 0 };
  for (const [name, n] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    if (isInternal(name)) continue;
    if (!Number.isInteger(n) || n < 0) throw new Error(`source collection ${name} has no usable document count`);
    if (MIGRATED.has(name) || EPHEMERAL.has(name)) {
      out.covered += 1;
    } else if (RETIRED.has(name)) {
      out.covered += 1;
      if (n > 0) out.retiredWithData.push({ name, count: n });
    } else if (n > 0) {
      out.unmappedWithData.push({ name, count: n });
    } else {
      out.unmappedEmpty.push(name);
    }
  }
  return out;
}

/**
 * Throws SOURCE_COLLECTIONS_NOT_COVERED, naming collections and counts only,
 * when a retired or unknown collection holds data. Read-only: it lists the
 * collections and counts their documents.
 * @param {import('mongodb').Db} db
 * @returns {Promise<{covered: number, unmappedEmpty: string[]}>}
 */
export async function assertSourceCollectionsCovered(db) {
  const infos = await db.listCollections({}, { nameOnly: true }).toArray();
  const counts = {};
  for (const { name } of infos) {
    if (!isInternal(name)) counts[name] = await db.collection(name).countDocuments({});
  }
  const result = classifySourceCollections(counts);
  const problems = [
    ...result.retiredWithData.map((c) => `${c.name} (retired, no target) holds ${c.count} document(s)`),
    ...result.unmappedWithData.map((c) => `${c.name} (no mapping) holds ${c.count} document(s)`),
  ];
  if (problems.length > 0) {
    const err = new Error(
      `${SOURCE_COLLECTIONS_NOT_COVERED}: the Mongo source has data the migration would silently leave behind:\n  - ${problems.join('\n  - ')}\n` +
      'Nothing was written. Decide per collection (map it, or confirm it is intentionally dropped) before running again.'
    );
    err.code = SOURCE_COLLECTIONS_NOT_COVERED;
    err.problems = problems;
    throw err;
  }
  return { covered: result.covered, unmappedEmpty: result.unmappedEmpty };
}
