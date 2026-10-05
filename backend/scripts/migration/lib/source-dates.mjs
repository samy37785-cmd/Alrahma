// Source-date preservation (owner decision DATES_DECISION=PRESERVE_EXACTLY).
//
// Every date a Mongo source document carries is either:
//   - mapped: written to its Postgres column with the exact source instant;
//   - derived: written from another date of the SAME document by a fixed,
//     documented rule (only `updated_at := createdAt` when the source has a
//     createdAt but no updatedAt -- the Mongoose `timestamps` meaning of a
//     document that was never updated after it was created);
//   - generated: the source genuinely has no value for a NOT NULL column,
//     so the migration time is used, the field is listed in the row's
//     `__generatedFields` (read-back and the content hash exempt only that
//     field) and the run report counts it by field name;
//   - kept NULL: a NULLABLE column whose source document has no value
//     (optionalSourceDate) stays NULL -- "not known" -- never the
//     migration time; counted as absentKeptNull. This is how the date
//     columns 0029 added (owner decision DATES_MUST_BE_PRESERVED) are
//     filled;
//   - unpreserved: the target table has no column for it at all. Declared
//     per domain, never inferred, and counted by field name in the report.
//   - excluded: deliberately not migrated, with a stated classification
//     (e.g. users.resetTokenExpiry is security-ephemeral data,
//     lib/security-ephemeral.mjs). Counted as intentionallyNotMigrated.
// A top-level Date field that is none of these fails the document: a new
// source date can never be dropped without a declaration.
//
// Precision: BSON dates are UTC milliseconds; timestamptz stores
// microseconds; node-postgres returns millisecond Dates. Every mapped
// value therefore round-trips exactly, with no rounding step anywhere.

/**
 * Returns the source value of `field` as a Date, or null when the document
 * has no value there. A value that is present but not a valid Date fails
 * closed: a corrupt date is reported, never replaced.
 */
export function sourceDate(doc, field) {
  const value = doc?.[field];
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`source field ${field} holds an invalid date`);
    return new Date(value.getTime());
  }
  throw new Error(`source field ${field} is not a BSON date (found ${typeof value}) -- refusing to guess its instant`);
}

function bump(stats, bucket, field) {
  if (!stats) return;
  stats[bucket] ??= {};
  stats[bucket][field] = (stats[bucket][field] ?? 0) + 1;
}

/**
 * Maps a document's createdAt/updatedAt onto created_at/updated_at.
 *
 * @param {object} doc - the Mongo source document
 * @param {{ createdAt?: string|null, updatedAt?: string|null }} columns -
 *   target column names; null/absent when the table has no such column
 * @param {object} [stats] - per-domain date counters (mutated)
 * @returns {{ fields: Record<string, Date>, generated: string[] }}
 */
export function sourceTimestamps(doc, { createdAt = 'created_at', updatedAt = null } = {}, stats) {
  const fields = {};
  const generated = [];
  const created = sourceDate(doc, 'createdAt');
  const updated = sourceDate(doc, 'updatedAt');

  if (createdAt) {
    if (created) {
      fields[createdAt] = created;
      bump(stats, 'preserved', createdAt);
    } else {
      fields[createdAt] = new Date();
      generated.push(createdAt);
      bump(stats, 'generated', createdAt);
    }
  }
  if (updatedAt) {
    if (updated) {
      fields[updatedAt] = updated;
      bump(stats, 'preserved', updatedAt);
    } else if (created) {
      fields[updatedAt] = new Date(created.getTime());
      bump(stats, 'derivedFromCreatedAt', updatedAt);
    } else {
      fields[updatedAt] = new Date();
      generated.push(updatedAt);
      bump(stats, 'generated', updatedAt);
    }
  }
  return { fields, generated };
}

/**
 * A domain-specific date (issuedAt, lastActivity, ...) for a NOT NULL
 * column. Returns the source instant, or the migration time recorded as
 * generated when the source has none.
 */
export function requiredSourceDate(doc, field, column, stats) {
  const value = sourceDate(doc, field);
  if (value) {
    bump(stats, 'preserved', column);
    return { value, generated: false };
  }
  bump(stats, 'generated', column);
  return { value: new Date(), generated: true };
}

/** A domain-specific date for a nullable column: the source instant or null, never a fallback. */
export function optionalSourceDate(doc, field, column, stats) {
  const value = sourceDate(doc, field);
  bump(stats, value ? 'preserved' : 'absentKeptNull', column);
  return value;
}

/**
 * The fail-closed accounting check. Every top-level Date field on `doc`
 * must be either consumed by the domain's transform (`mapped`), declared
 * as having no destination column (`unpreserved`), or deliberately
 * excluded with a classification (`excluded`: { field: classification }),
 * each counted in `stats`. Anything else throws, naming the field only
 * (never its value).
 */
export function accountForSourceDates(doc, { mapped = [], unpreserved = [], excluded = {} }, stats) {
  const known = new Set(mapped);
  const declaredLoss = new Set(unpreserved);
  for (const [field, value] of Object.entries(doc ?? {})) {
    if (!(value instanceof Date)) continue;
    if (known.has(field)) continue;
    if (Object.hasOwn(excluded, field)) {
      bump(stats, 'intentionallyNotMigrated', field);
      continue;
    }
    if (declaredLoss.has(field)) {
      bump(stats, 'unpreserved', field);
      continue;
    }
    throw new Error(
      `source date field "${field}" has no declared destination in this domain -- ` +
      'refusing to drop it silently (map it to a column or declare it unpreserved)'
    );
  }
}

/**
 * set_updated_at() (0001_functions_triggers.sql) is BEFORE UPDATE only, so
 * an INSERT keeps an explicit updated_at, but any later UPDATE of the row
 * (a resume, a changed source document) stamps now() over the source
 * value. This puts the source instant back with the trigger bypassed for
 * exactly one statement that touches nothing but the timestamp columns.
 *
 * `session_replication_role` is on Supabase's supautils allowlist for the
 * postgres role, so this works on a hosted project as well as locally.
 * SET LOCAL only has an effect inside a transaction: the caller's open
 * transaction is used when `inTransaction` is true, otherwise this opens
 * and commits its own. A role that may not set it fails here, loudly.
 */
export async function restoreSourceTimestamps(client, { table, idColumn = 'id', id, values, inTransaction }) {
  const columns = Object.keys(values);
  if (columns.length === 0) return;
  for (const col of columns) {
    if (!/^(created_at|updated_at)$/.test(col)) throw new Error(`restoreSourceTimestamps: refusing to write non-timestamp column ${col}`);
  }
  if (!/^[a-z_]+(\.[a-z_]+)?$/.test(table) || !/^[a-z_]+$/.test(idColumn)) {
    throw new Error('restoreSourceTimestamps: invalid table/column identifier');
  }
  const setSql = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
  const run = async () => {
    await client.query('SET LOCAL session_replication_role = replica');
    const r = await client.query(`UPDATE ${table} SET ${setSql} WHERE ${idColumn} = $1`, [id, ...columns.map((c) => values[c])]);
    await client.query('SET LOCAL session_replication_role = origin');
    if (r.rowCount !== 1) {
      throw new Error(`restoreSourceTimestamps: UPDATE ${table} affected ${r.rowCount} row(s), expected exactly 1`);
    }
  };
  if (inTransaction) return run();
  await client.query('BEGIN');
  try {
    await run();
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}
