// A single advisory-lock key shared by BOTH the cutover and rollback
// orchestrators, derived only from the project ref — never from a
// per-tool string like "cutover"/"rollback".
//
// Fixed by a corrective review of Stage 2D: the original design used
// TWO DIFFERENT keys ("option-a-cutover:<ref>" vs
// "option-a-rollback:<ref>"), which meant a cutover run and a rollback
// run could both acquire their own lock and proceed concurrently
// without ever seeing each other — the mutex only worked within one
// tool, not across the two. A single shared key closes that gap: only
// one of {cutover, rollback} can hold the lock against a given project
// at any moment, regardless of which tool is trying.
import crypto from "node:crypto";

export function sharedAdvisoryLockKey(projectRef) {
  return BigInt(
    "0x" + crypto.createHash("sha256").update(`option-a-production-critical-section:${projectRef}`).digest("hex").slice(0, 15)
  ).toString();
}
