// Stage 2I-D — semantic identity lookup for the RLS-auto-enable event
// trigger, shared by every tool that needs to find/verify it.
//
// Why this exists: every piece of this tooling used to hard-code the
// literal trigger name "rls_auto_enable_trigger" (production-preflight-
// gate.mjs, 03-surgical-reset.mjs, scripts/lib/new-schema-fingerprint.mjs).
// A real production backup taken in Stage 2I-C proved the REAL Alrahma
// project's own trigger is actually named "ensure_rls" — same event
// (ddl_command_end), same tags (CREATE TABLE / CREATE TABLE AS / SELECT
// INTO), same handler function (rls_auto_enable()), same owner
// (postgres), just a different literal name. Every hardcoded-name check
// would have failed against the real project despite the trigger being
// entirely correct and healthy — a documentation/constant drift bug, not
// a real defect in production. This module fixes the ROOT CAUSE: find
// the trigger by its semantic identity (what it DOES), never by what it
// happens to be NAMED.
//
// Stable identity anchor: the HANDLER FUNCTION's name (rls_auto_enable)
// is the one thing that has never varied across every environment this
// project has ever inspected (local rehearsal fixtures, the real
// production project) — Surgical Reset/Inverse Reset both deliberately
// never touch this function, and neither tool has ever renamed it. The
// EVENT TRIGGER's own name, by contrast, is proven NOT stable (it is
// platform/environment-specific: "ensure_rls" for real Supabase-hosted
// projects historically, "rls_auto_enable_trigger" for this project's own
// local rehearsal fixtures) — so it is never used as a matching key here,
// only ever reported back for logging/diagnostics once a real match is
// found by shape.
import { parsePgTextArray } from "./pg-array.mjs";

export const EXPECTED_HANDLER_FUNCTION = "rls_auto_enable";
export const EXPECTED_EVENT = "ddl_command_end";
export const EXPECTED_TAGS = ["CREATE TABLE", "CREATE TABLE AS", "SELECT INTO"].sort();

export class EventTriggerIdentityError extends Error {}

function sortedTags(tags) {
  return parsePgTextArray(tags || []).slice().sort();
}
function tagsEqual(a, b) {
  return JSON.stringify(sortedTags(a)) === JSON.stringify(sortedTags(b));
}

/**
 * Finds the event trigger matching rls_auto_enable's full semantic
 * identity — regardless of what it happens to be named.
 *
 * @param {import('pg').Client} client
 * @param {{ expectedOwner?: string }} [opts]
 *   expectedOwner: when given, the trigger's evtowner must equal this
 *   exact role name to count as a full match (used by callers that have
 *   an independent, pinned expectation of who should own it — e.g.
 *   production-preflight-gate.mjs's "postgres", matching the real
 *   project). When OMITTED, owner is not part of the match criteria at
 *   all — the caller gets back whatever owner the real match actually
 *   has (used by 03-surgical-reset.mjs, which only needs to prove the
 *   SAME owner survives before/after, not any particular literal value —
 *   the local rehearsal harness legitimately runs as different actors
 *   across different tests, e.g. `supabase_admin` in some, and forcing a
 *   single hardcoded owner here would fail those for a reason that has
 *   nothing to do with what Surgical Reset itself is supposed to prove).
 *
 * @returns {Promise<{oid: string, evtname: string, evtevent: string, evtenabled: string, owner: string, tags: string[], handler: string}>}
 * @throws {EventTriggerIdentityError} fail-closed on zero matches,
 *   multiple ambiguous full matches, or a single near-miss candidate
 *   whose shape is wrong in some specific, reported way.
 */
export async function findRlsAutoEnableEventTrigger(client, opts = {}) {
  const { expectedOwner } = opts;

  const { rows } = await client.query(`
    select oid::text as oid, evtname, evtevent, evtenabled, evtowner::regrole::text as owner,
      (select array_agg(x::text) from unnest(evttags) as x) as tags,
      evtfoid::regproc::text as handler
    from pg_event_trigger
    order by evtname;
  `);

  const matchesFully = (r) =>
    r.handler === EXPECTED_HANDLER_FUNCTION &&
    r.evtevent === EXPECTED_EVENT &&
    tagsEqual(r.tags, EXPECTED_TAGS) &&
    r.evtenabled !== "D" &&
    (expectedOwner === undefined || r.owner === expectedOwner);

  const fullMatches = rows.filter(matchesFully);

  if (fullMatches.length === 1) {
    const m = fullMatches[0];
    return { oid: m.oid, evtname: m.evtname, evtevent: m.evtevent, evtenabled: m.evtenabled, owner: m.owner, tags: sortedTags(m.tags), handler: m.handler };
  }

  if (fullMatches.length > 1) {
    throw new EventTriggerIdentityError(
      `ambiguous: ${fullMatches.length} event trigger(s) all match rls_auto_enable's full expected identity ` +
      `(handler=${EXPECTED_HANDLER_FUNCTION}(), event=${EXPECTED_EVENT}, tags=${JSON.stringify(EXPECTED_TAGS)}, enabled` +
      `${expectedOwner !== undefined ? `, owner=${expectedOwner}` : ""}) — refusing to pick one: ${fullMatches.map((r) => r.evtname).join(", ")}`
    );
  }

  // Zero full matches. Look for near-miss candidates so the failure names
  // the SPECIFIC wrong field(s) instead of a bare "not found" — a
  // candidate is anything that resembles rls_auto_enable's identity on at
  // least one axis (right handler, OR right event+tags independent of
  // handler/owner).
  const handlerMatches = rows.filter((r) => r.handler === EXPECTED_HANDLER_FUNCTION);
  const shapeMatches = rows.filter((r) => r.evtevent === EXPECTED_EVENT && tagsEqual(r.tags, EXPECTED_TAGS));
  const candidatesByName = new Map();
  for (const r of [...handlerMatches, ...shapeMatches]) candidatesByName.set(r.evtname, r);
  const candidates = [...candidatesByName.values()];

  if (candidates.length === 0) {
    throw new EventTriggerIdentityError(
      `no event trigger found matching rls_auto_enable's expected identity at all ` +
      `(handler=${EXPECTED_HANDLER_FUNCTION}(), event=${EXPECTED_EVENT}, tags=${JSON.stringify(EXPECTED_TAGS)}` +
      `${expectedOwner !== undefined ? `, owner=${expectedOwner}` : ""}) — rls_auto_enable's safety net appears to be missing entirely`
    );
  }

  if (candidates.length > 1) {
    throw new EventTriggerIdentityError(
      `${candidates.length} event trigger(s) partially resemble rls_auto_enable's expected identity but none match it fully, ` +
      `and it is ambiguous which (if any) is the real one: ${candidates.map((r) => r.evtname).join(", ")}`
    );
  }

  const r = candidates[0];
  const problems = [];
  if (r.handler !== EXPECTED_HANDLER_FUNCTION) problems.push(`handler is "${r.handler}", expected "${EXPECTED_HANDLER_FUNCTION}"`);
  if (r.evtevent !== EXPECTED_EVENT) problems.push(`evtevent is "${r.evtevent}", expected "${EXPECTED_EVENT}"`);
  if (!tagsEqual(r.tags, EXPECTED_TAGS)) problems.push(`evttags are ${JSON.stringify(sortedTags(r.tags))}, expected ${JSON.stringify(EXPECTED_TAGS)}`);
  if (r.evtenabled === "D") problems.push(`is disabled (evtenabled="D")`);
  if (expectedOwner !== undefined && r.owner !== expectedOwner) problems.push(`owner is "${r.owner}", expected "${expectedOwner}"`);
  throw new EventTriggerIdentityError(
    `event trigger "${r.evtname}" resembles rls_auto_enable's expected identity but does not match fully: ${problems.join("; ")}`
  );
}
