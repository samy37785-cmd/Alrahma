// PR #70 review round 11, item 3 -- one centralized canonical content-hash
// representation, shared by every caller that needs a stable, deterministic
// hash of a document/row for ledger/checkpoint content-change detection.
//
// Bug being fixed: mongo-to-supabase.mjs's per-domain loop hashed the
// TRANSFORMED row (contentHashOf(row) / hashOf(row)) via a bare
// `JSON.stringify`. Several domains' transform() sets a generated fallback
// field via `doc.X ?? new Date()` when the Mongo source document genuinely
// has no original value for that field -- correctly exempted from
// read-back's VALUE comparison (see read-back-verify.mjs, round 10, item 1)
// via row.__generatedFields. But nothing exempted it from the CONTENT HASH:
// `new Date()` produces a different wall-clock value on every single run,
// so a document needing this fallback got a different `source_content_hash`
// every time it was processed -- the reconciled-fast-path skip
// (`existing.source_content_hash === fullHash`) could then never match on a
// second run, defeating idempotency: this migration would re-derive a FRESH
// `new Date()` and re-upsert the row on every single rerun forever, even
// when the real Mongo source never changed at all.
//
// Fixed here with one shared, exported `stableContentHash()`:
//   - object keys are recursively sorted (order must never matter -- a
//     plain JS object literal's own insertion order is not part of its
//     actual content);
//   - array order is preserved exactly (order DOES matter for an array);
//   - Date instances are normalized to their ISO string before hashing
//     (so the same instant hashes identically regardless of whether it
//     arrived as a JS Date or an equivalent ISO string);
//   - the `__generatedFields` marker key itself is excluded from the hash
//     (it is bookkeeping ABOUT the row, never part of the row's own
//     content);
//   - for each field NAME listed in the row's own `__generatedFields`
//     array, that field's VALUE is excluded from the hash entirely (this
//     is the actual fix -- the field that is inherently unstable
//     run-to-run, and ONLY that field, is left out; every genuinely
//     source-derived/transformed field is still hashed exactly, so a real
//     content change is still caught).
//
// This exclusion only ever applies to the TOP-LEVEL object being hashed
// (row.__generatedFields names real columns of `row` itself) -- nested
// objects/arrays are canonicalized in full, with no exclusion, since
// `__generatedFields` never names a nested path.
import crypto from 'node:crypto';

function canonicalizeValue(value, excludeKeys) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => canonicalizeValue(item, null));
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value).sort();
    const out = {};
    for (const key of sortedKeys) {
      if (key === '__generatedFields') continue; // bookkeeping about the row, never part of its content
      if (excludeKeys && excludeKeys.has(key)) continue; // this exact field's value is a generated fallback with no real source value this run
      out[key] = canonicalizeValue(value[key], null);
    }
    return out;
  }
  return value;
}

/**
 * A deterministic, canonical sha256 hex digest of `value`, stable across
 * object-key reordering and across a generated-fallback field's inherently
 * varying value (see this file's own header comment). Always a 64-character
 * lowercase hex string, the same shape every other content-hash consumer in
 * this codebase already expects (e.g. production-import-orchestrator.mjs's
 * `^[0-9a-f]{64}$` validation).
 *
 * @param {unknown} value - typically a transformed row (may carry a
 *   `__generatedFields: string[]` marker naming its own generated-fallback
 *   fields) or a raw Mongo source document (never carries that marker, so
 *   this reduces to plain canonical hashing for those callers).
 */
export function stableContentHash(value) {
  const excludeKeys =
    value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.__generatedFields)
      ? new Set(value.__generatedFields)
      : null;
  const canonical = canonicalizeValue(value, excludeKeys);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
