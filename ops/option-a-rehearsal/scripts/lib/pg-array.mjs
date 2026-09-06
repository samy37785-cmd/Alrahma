// node-postgres has no built-in type parser registered for `name[]`
// (an uncommon array type — `pg_policies.roles` is one) — it comes back
// as the raw Postgres text literal ("{authenticated,anon}"), not a
// parsed JS array. Found by actually checking it directly against a
// live connection while generating fixtures/new-schema-rls-policies.json
// for this task, not by inspection: the existing pattern this codebase
// used everywhere a policy's `roles` needed comparing —
// `[...(r.roles || [])].sort()` — silently spreads that STRING into
// individual characters instead of role names when `roles` comes back
// this way, which restore-bundle.mjs's own "full policy definitions"
// check has been doing since it was written. It still worked in
// practice (both sides of every comparison go through the identical
// transformation, so a real mismatch still shows up as a different
// character-sorted string in most cases) but it was never actually
// comparing role names. This function parses the real Postgres array
// literal correctly; every NEW comparison added by this corrective
// review uses it instead of perpetuating the bug.
export function parsePgTextArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1);
    return inner.length === 0 ? [] : inner.split(",");
  }
  return value;
}
