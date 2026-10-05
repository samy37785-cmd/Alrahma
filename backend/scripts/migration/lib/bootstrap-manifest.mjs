// SUPER_ADMIN_SAFETY_GATE: the approval manifest's two stages.
//
//   1. candidate (unsigned): built by `bootstrap-manifest.mjs collect`
//      from what the target actually holds after the owner's Super Admin
//      bootstrap -- project ref, commit, bootstrap allowlist (UUIDs and
//      row fingerprints only) and its sha256. No scope, backup, expiry,
//      approver or token: it authorizes nothing.
//   2. signed: only the owner turns a candidate into a manifest, with
//      `bootstrap-manifest.mjs sign` in an interactive terminal, choosing
//      the scope ('plan' first; 'execute' only after reviewing the plan
//      report), the backup and how long it stays valid. The tooling never
//      signs on anyone's behalf.
//
// verifyApprovalManifest() (production-approval.mjs) is the single check
// every reader applies to the signed result.
import { MANIFEST_MAX_VALIDITY_HOURS, MANIFEST_SCOPES, TARGET_SUPABASE_REF, computeConfirmToken } from './production-approval.mjs';
import { bootstrapAllowlistSha256, validateBootstrapAllowlist } from './bootstrap-allowlist.mjs';

const EMAIL_SHAPE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function buildManifestCandidate({ gitSha, bootstrapAllowlist }) {
  if (!/^[0-9a-f]{40}$/.test(String(gitSha))) throw new Error('candidate: gitSha must be a full commit SHA');
  validateBootstrapAllowlist(bootstrapAllowlist);
  return {
    projectRef: TARGET_SUPABASE_REF,
    scope: null,
    gitSha,
    backupHash: null,
    expiresAt: null,
    bootstrapAllowlist,
    bootstrapAllowlistSha256: bootstrapAllowlistSha256(bootstrapAllowlist),
    approvedBy: null,
    approvedAt: null,
    confirmToken: null,
  };
}

/** The candidate with the owner's decisions filled in and confirmToken computed. */
export function signManifestCandidate(candidate, { scope, backupHash, approvedBy, validHours, now = new Date() }) {
  if (!candidate || candidate.projectRef !== TARGET_SUPABASE_REF) throw new Error('sign: not a manifest candidate for the target project');
  for (const field of ['scope', 'backupHash', 'expiresAt', 'approvedBy', 'approvedAt', 'confirmToken']) {
    if (candidate[field] !== null) throw new Error(`sign: the candidate already has "${field}" set -- start from an unsigned candidate`);
  }
  validateBootstrapAllowlist(candidate.bootstrapAllowlist);
  if (candidate.bootstrapAllowlistSha256 !== bootstrapAllowlistSha256(candidate.bootstrapAllowlist)) {
    throw new Error('sign: the candidate allowlist does not match its sha256 -- it was edited after collection');
  }
  if (!MANIFEST_SCOPES.includes(scope)) throw new Error(`sign: scope must be ${MANIFEST_SCOPES.join(' or ')}`);
  if (!/^[0-9a-f]{64}$/.test(String(backupHash))) throw new Error('sign: backupHash must be the backup archive sha256');
  if (typeof approvedBy !== 'string' || approvedBy.trim().length < 2 || EMAIL_SHAPE.test(approvedBy)) {
    throw new Error('sign: approvedBy must be a name, not an email address');
  }
  if (!(Number.isFinite(validHours) && validHours > 0 && validHours <= MANIFEST_MAX_VALIDITY_HOURS)) {
    throw new Error(`sign: validHours must be between 1 and ${MANIFEST_MAX_VALIDITY_HOURS}`);
  }
  const approvedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + validHours * 3_600_000).toISOString();
  const signed = { ...candidate, scope, backupHash, expiresAt, approvedBy: approvedBy.trim(), approvedAt };
  signed.confirmToken = computeConfirmToken(signed);
  return signed;
}

/** The exact phrase the owner types to sign: scope + the first 12 hex of the allowlist sha256. */
export function confirmationPhrase(candidate, scope) {
  return `APPROVE ${scope} ${candidate.bootstrapAllowlistSha256.slice(0, 12)}`;
}

/** A PII-free description of what a candidate approves, for the owner to review. */
export function describeCandidate(candidate) {
  const a = candidate.bootstrapAllowlist;
  return {
    projectRef: candidate.projectRef,
    gitSha: candidate.gitSha,
    superAdminUserId: a.superAdmin?.userId ?? null,
    plans: a.plans.map((p) => `${p.slug} ${p.id}`),
    auditRows: a.auditRows.map((r) => `${r.action} ${r.id}`),
    bootstrapAllowlistSha256: candidate.bootstrapAllowlistSha256,
  };
}
