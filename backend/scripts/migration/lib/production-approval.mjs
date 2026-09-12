// Stage 2J-B — Production Enablement. Shared, independently-verifiable
// approval/backup primitives, extracted out of production-import-
// orchestrator.mjs so BOTH that orchestrator AND the two worker scripts
// (mongo-to-supabase.mjs, migrate-users-to-supabase-auth.mjs) can perform
// the exact same cryptographic verification independently, rather than
// one process trusting a bare token/flag from another.
//
// Why this exists: the orchestrator has always fully validated a
// prospective production run (approval manifest tied to the exact git SHA
// and backup hash, backup freshness, schema/migration-journal identity,
// Signups-off, bidirectional ledger integrity, an advisory lock) before
// ever invoking a real write -- but the two worker scripts it spawns as
// child processes have their own, SEPARATE `assertLocalHost()` guard that
// unconditionally refuses any non-local MIGRATION_DB_URL, with no way to
// ever lift it. That is deliberate (see each worker's own header comment)
// and is NOT weakened here: this module adds a narrow, structurally-gated
// exception, not a way to disable the guard generally.
//
// The exception requires the CALLER (whichever process — orchestrator or
// worker — is about to touch a non-local host) to independently perform
// the SAME full verification this module defines, from the SAME two real
// artifacts on disk (the approval manifest, the backup manifest) — never
// a single opaque token passed down that a compromised/buggy intermediate
// process could fabricate cheaply. See lib/production-authorization.mjs
// for the actual gate built on top of these primitives.
import crypto from 'node:crypto';
import fs from 'node:fs';

// Hardcoded, not read from any CLI flag or env var — this is the ONE real
// Supabase project this entire migration tooling may ever target, no
// matter what an operator or a compromised config passes it.
export const TARGET_SUPABASE_REF = 'difzynyphojgisrfvrkd';

function fail(msg) {
  throw new Error(`[production-approval] ${msg}`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// ---------------------------------------------------------------------
// Approval Manifest — the ONLY thing that can turn --plan into --execute.
// ---------------------------------------------------------------------

export function computeConfirmToken({ projectRef, gitSha, backupHash }) {
  return crypto.createHash('sha256').update(`${projectRef}:${gitSha}:${backupHash}`).digest('hex');
}

/**
 * A valid manifest proves three things happened together, deliberately,
 * for THIS exact run: (1) it targets the one real project ref, (2) it was
 * approved against the exact commit actually checked out right now — not
 * some other commit's reviewed code silently running against a later
 * change, and (3) a specific backup's hash was known and approved,
 * so nobody can swap in a different (or no) backup after approval.
 */
export function verifyApprovalManifest(manifest, { gitSha, backupHash }) {
  if (!manifest || typeof manifest !== 'object') fail('approval manifest is missing or not an object');
  const required = ['projectRef', 'gitSha', 'backupHash', 'confirmToken', 'approvedBy', 'approvedAt'];
  for (const field of required) {
    if (!manifest[field]) fail(`approval manifest missing required field "${field}"`);
  }
  if (manifest.projectRef !== TARGET_SUPABASE_REF) {
    fail(`approval manifest projectRef "${manifest.projectRef}" does not match the hardcoded target "${TARGET_SUPABASE_REF}"`);
  }
  if (manifest.gitSha !== gitSha) {
    fail(`approval manifest was approved for git SHA ${manifest.gitSha}, but HEAD is currently ${gitSha} — re-approve against the exact commit being run`);
  }
  if (manifest.backupHash !== backupHash) {
    fail(`approval manifest backupHash does not match the backup actually present — a different or newer backup exists than what was approved`);
  }
  const expectedToken = computeConfirmToken({ projectRef: manifest.projectRef, gitSha: manifest.gitSha, backupHash: manifest.backupHash });
  if (manifest.confirmToken !== expectedToken) {
    fail('approval manifest confirmToken does not match sha256(projectRef:gitSha:backupHash) — manifest is malformed or was hand-edited');
  }
  return true;
}

// ---------------------------------------------------------------------
// Fresh-backup verification.
// ---------------------------------------------------------------------

/**
 * `backupManifestPath` points at a small JSON sidecar (produced by
 * whatever this project's backup step writes, NOT re-derived here):
 * { filePath, sha256, createdAt }. This function re-hashes the actual
 * file (never trusts the sidecar's own claimed hash alone) and checks
 * recency.
 */
export function verifyFreshBackup(backupManifestPath, { maxAgeHours = 24 } = {}) {
  if (!fs.existsSync(backupManifestPath)) fail(`no backup manifest at ${backupManifestPath} — a fresh Mongo backup must exist before any real import`);
  const sidecar = JSON.parse(fs.readFileSync(backupManifestPath, 'utf8'));
  for (const field of ['filePath', 'sha256', 'createdAt']) {
    if (!sidecar[field]) fail(`backup manifest missing required field "${field}"`);
  }
  if (!fs.existsSync(sidecar.filePath)) fail(`backup manifest references ${sidecar.filePath}, which does not exist`);
  const actualHash = sha256File(sidecar.filePath);
  if (actualHash !== sidecar.sha256) {
    fail(`backup file at ${sidecar.filePath} does not match its manifest's recorded sha256 — it was modified or replaced after the manifest was written`);
  }
  const ageHours = (Date.now() - new Date(sidecar.createdAt).getTime()) / 3_600_000;
  if (!(ageHours >= 0) || ageHours > maxAgeHours) {
    fail(`backup at ${sidecar.filePath} is ${ageHours.toFixed(1)}h old (or has an invalid createdAt) — max allowed is ${maxAgeHours}h`);
  }
  return { filePath: sidecar.filePath, sha256: actualHash, ageHours };
}
