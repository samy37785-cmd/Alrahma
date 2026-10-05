// Plan mode (owner decision PLAN_MODE_DECISION=FIX): a --dry-run/--plan
// against an empty target has no real profiles/courses/plans rows to point
// at, yet every relation still has to be validated without writing one.
// A reference whose target exists in the SOURCE but has not been written
// yet resolves to a deterministic placeholder id instead: the same source
// document always gets the same planned id, so a plan is reproducible and
// two references to one document agree. A reference to a document that is
// not in the source at all is still a failure; planned ids never paper over
// a true orphan. They are never written anywhere.
import crypto from 'node:crypto';

/** Deterministic UUID-shaped id for `kind`/`sourceId` (RFC 9562 version 8 layout). */
export function plannedId(kind, sourceId) {
  const hex = crypto.createHash('sha256').update(`planned:${kind}:${String(sourceId)}`).digest('hex').slice(0, 32).split('');
  hex[12] = '8';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
