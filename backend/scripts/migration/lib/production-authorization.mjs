// Stage 2J-B — Production Enablement.
//
// This module is the ONLY way any script in backend/scripts/migration/
// can ever be told "it is acceptable to target a non-local host" — and
// even then, only after this module has ITSELF independently re-derived
// and verified every one of the real preconditions the orchestrator's own
// runPreflight() already requires, from the same two real artifacts on
// disk (an approval manifest, a backup manifest) and the current git SHA.
// There is no bare boolean flag, no opaque token, nothing a caller could
// set to `true` by mistake or by a typo — every field this returns is the
// direct result of a real cryptographic check against real files.
//
// Closed by default: if MIGRATION_PRODUCTION_MODE is not exactly '1',
// loadAndVerifyProductionAuthorization() returns null immediately, and
// every caller in this directory treats a null authorization exactly like
// "no production access was ever requested" — i.e. the existing,
// unconditional localhost-only behavior (lib/host-guard.mjs's
// assertLocalHostOrProductionAuthorized()) is completely unchanged for
// every existing invocation that has never heard of this env var.
//
// When MIGRATION_PRODUCTION_MODE=1, EVERY one of the following must hold,
// or this function throws (never returns a partially-verified result):
//   1. MIGRATION_APPROVAL_MANIFEST and MIGRATION_BACKUP_MANIFEST env vars
//      are both set and point at real files.
//   2. The approval manifest's own projectRef, gitSha, backupHash, and
//      confirmToken are all independently re-verified via lib/production-
//      approval.mjs's verifyApprovalManifest() -- the exact same function
//      the orchestrator itself uses, imported, never re-implemented.
//   3. The backup manifest is independently re-verified fresh (<24h by
//      default) and its recorded sha256 is re-hashed from the real file
//      on disk, via the same verifyFreshBackup().
//   4. SUPABASE_URL's own hostname is checked to genuinely be the target
//      Supabase project's own real hostname
//      (`<TARGET_SUPABASE_REF>.supabase.co`) -- a manifest approving the
//      right projectRef string is not proof this RUN's own SUPABASE_URL
//      env var actually points at that same real project.
//
// This module never reads MIGRATION_DB_URL/MIGRATION_MONGO_URI itself and
// never decides what counts as "local" -- that stays lib/host-guard.mjs's
// job. This module answers exactly one question: "has a genuine,
// independently-verifiable production approval been presented for THIS
// process, right now" -- yes (with the verified facts) or a thrown error,
// never a silent maybe.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET_SUPABASE_REF, verifyApprovalManifest, verifyFreshBackup } from './production-approval.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function fail(msg) {
  throw new Error(`[production-authorization] ${msg}`);
}

function currentGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

/**
 * Extracts the Supabase project ref from a real Supabase URL
 * (`https://<ref>.supabase.co`) -- deliberately strict: anything else
 * (a bare IP, a non-Supabase domain, a malformed URL) fails closed rather
 * than guessing.
 */
export function extractSupabaseProjectRef(supabaseUrl) {
  let hostname;
  try {
    hostname = new URL(supabaseUrl).hostname;
  } catch {
    fail(`SUPABASE_URL "${supabaseUrl}" is not a valid URL`);
  }
  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (!match) {
    fail(`SUPABASE_URL hostname "${hostname}" does not look like a real Supabase project URL (expected "<ref>.supabase.co")`);
  }
  return match[1];
}

/**
 * @returns {null | {
 *   verified: true,
 *   projectRef: string,
 *   gitSha: string,
 *   backupHash: string,
 *   approvalManifestPath: string,
 *   backupManifestPath: string,
 * }}
 */
export function loadAndVerifyProductionAuthorization({
  env = process.env,
  verifyApprovalManifestFn = verifyApprovalManifest,
  verifyFreshBackupFn = verifyFreshBackup,
  currentGitShaFn = currentGitSha,
} = {}) {
  if (env.MIGRATION_PRODUCTION_MODE !== '1') return null;

  const approvalManifestPath = env.MIGRATION_APPROVAL_MANIFEST;
  const backupManifestPath = env.MIGRATION_BACKUP_MANIFEST;
  if (!approvalManifestPath) fail('MIGRATION_PRODUCTION_MODE=1 requires MIGRATION_APPROVAL_MANIFEST to be set');
  if (!backupManifestPath) fail('MIGRATION_PRODUCTION_MODE=1 requires MIGRATION_BACKUP_MANIFEST to be set');
  if (!fs.existsSync(approvalManifestPath)) fail(`MIGRATION_APPROVAL_MANIFEST does not exist: ${approvalManifestPath}`);

  const supabaseUrl = env.SUPABASE_URL;
  if (!supabaseUrl) fail('MIGRATION_PRODUCTION_MODE=1 requires SUPABASE_URL to be set');
  const projectRef = extractSupabaseProjectRef(supabaseUrl);
  if (projectRef !== TARGET_SUPABASE_REF) {
    fail(`SUPABASE_URL's own project ref "${projectRef}" does not match the hardcoded target "${TARGET_SUPABASE_REF}"`);
  }

  const gitSha = currentGitShaFn();
  const backup = verifyFreshBackupFn(backupManifestPath);
  const manifest = JSON.parse(fs.readFileSync(approvalManifestPath, 'utf8'));
  verifyApprovalManifestFn(manifest, { gitSha, backupHash: backup.sha256 });

  return {
    verified: true,
    projectRef,
    gitSha,
    backupHash: backup.sha256,
    approvalManifestPath,
    backupManifestPath,
  };
}
