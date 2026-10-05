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
import { bootstrapAllowlistSha256, validateBootstrapAllowlist } from './bootstrap-allowlist.mjs';

// Hardcoded, not read from any CLI flag or env var — this is the ONE real
// Supabase project this entire migration tooling may ever target, no
// matter what an operator or a compromised config passes it.
export const TARGET_SUPABASE_REF = 'difzynyphojgisrfvrkd';

// SUPER_ADMIN_SAFETY_GATE: a manifest authorizes one scope. 'plan' only
// ever allows read-only plan runs (the connection is forced read-only);
// 'execute' allows writes, and plan runs too.
export const MANIFEST_SCOPES = ['plan', 'execute'];
export const MANIFEST_MAX_VALIDITY_HOURS = 7 * 24;
const MANIFEST_FIELDS = [
  'projectRef', 'scope', 'gitSha', 'backupHash', 'expiresAt',
  'bootstrapAllowlist', 'bootstrapAllowlistSha256', 'approvedBy', 'approvedAt', 'confirmToken',
];
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function fail(msg) {
  throw new Error(`[production-approval] ${msg}`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// ---------------------------------------------------------------------
// Approval Manifest — the ONLY thing that can turn --plan into --execute.
// ---------------------------------------------------------------------

export function computeConfirmToken({ projectRef, scope, gitSha, backupHash, expiresAt, bootstrapAllowlistSha256: allowlistSha }) {
  return crypto.createHash('sha256')
    .update(`${projectRef}:${scope}:${gitSha}:${backupHash}:${expiresAt}:${allowlistSha}`)
    .digest('hex');
}

// No email address and no secret may sit in a manifest (owner rule: UUIDs
// and row fingerprints only). Checked over every string value.
const FORBIDDEN_MANIFEST_CONTENT = [
  [/[^\s@"]+@[^\s@"]+\.[^\s@"]+/, 'an email address'],
  [/eyJ[A-Za-z0-9_-]{10,}/, 'a JWT'],
  [/\b(postgres(ql)?|mongodb(\+srv)?):\/\//i, 'a connection string'],
  [/\bsb_(secret|publishable)_/i, 'a Supabase API key'],
];

function assertNoSensitiveContent(value, where = 'manifest') {
  if (typeof value === 'string') {
    for (const [pattern, what] of FORBIDDEN_MANIFEST_CONTENT) {
      if (pattern.test(value)) fail(`approval manifest ${where} contains ${what} -- only UUIDs and fingerprints may identify rows`);
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoSensitiveContent(v, `${where}.${k}`);
  }
}

/**
 * A valid manifest proves, for THIS exact run: (1) it targets the one real
 * project ref, (2) it was approved against the exact commit checked out
 * now, (3) a specific backup's hash was approved, (4) it is not expired and
 * was approved for the scope being run, and (5) it carries the exact
 * bootstrap allowlist (lib/bootstrap-allowlist.mjs) the owner approved --
 * every one of these is bound into confirmToken, so changing any of them
 * after approval invalidates the manifest. `requiredScope` 'execute' needs
 * an execute manifest; 'plan' accepts either.
 */
export function verifyApprovalManifest(manifest, { gitSha, backupHash, requiredScope = 'execute', now = Date.now() }) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('approval manifest is missing or not an object');
  for (const field of MANIFEST_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') fail(`approval manifest missing required field "${field}"`);
  }
  const unknown = Object.keys(manifest).filter((k) => !MANIFEST_FIELDS.includes(k));
  if (unknown.length > 0) fail(`approval manifest has unknown field(s): ${unknown.join(', ')}`);
  assertNoSensitiveContent(manifest);

  if (manifest.projectRef !== TARGET_SUPABASE_REF) {
    fail(`approval manifest projectRef "${manifest.projectRef}" does not match the hardcoded target "${TARGET_SUPABASE_REF}"`);
  }
  if (!MANIFEST_SCOPES.includes(manifest.scope)) fail(`approval manifest scope must be one of ${MANIFEST_SCOPES.join('/')}`);
  if (!MANIFEST_SCOPES.includes(requiredScope)) fail(`unknown required scope "${requiredScope}"`);
  if (requiredScope === 'execute' && manifest.scope !== 'execute') {
    fail(`approval manifest scope is "${manifest.scope}" -- it only authorizes read-only plan runs, not --execute`);
  }
  if (manifest.gitSha !== gitSha) {
    fail(`approval manifest was approved for git SHA ${manifest.gitSha}, but HEAD is currently ${gitSha} — re-approve against the exact commit being run`);
  }
  if (manifest.backupHash !== backupHash) {
    fail(`approval manifest backupHash does not match the backup actually present — a different or newer backup exists than what was approved`);
  }

  const approvedAt = Date.parse(manifest.approvedAt);
  const expiresAt = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt)) fail('approval manifest approvedAt/expiresAt must be ISO timestamps');
  if (approvedAt > now + CLOCK_SKEW_MS) fail('approval manifest approvedAt is in the future');
  if (expiresAt <= approvedAt) fail('approval manifest expiresAt must be after approvedAt');
  if (expiresAt - approvedAt > MANIFEST_MAX_VALIDITY_HOURS * 3_600_000) fail(`approval manifest is valid for more than ${MANIFEST_MAX_VALIDITY_HOURS}h`);
  if (now >= expiresAt) fail(`approval manifest expired at ${manifest.expiresAt} -- approve a new one`);

  try {
    validateBootstrapAllowlist(manifest.bootstrapAllowlist);
  } catch (err) {
    fail(`approval manifest ${err.message}`);
  }
  if (manifest.bootstrapAllowlistSha256 !== bootstrapAllowlistSha256(manifest.bootstrapAllowlist)) {
    fail('approval manifest bootstrapAllowlistSha256 does not match its bootstrapAllowlist -- the allowlist was changed after approval');
  }

  const expectedToken = computeConfirmToken(manifest);
  if (manifest.confirmToken !== expectedToken) {
    fail('approval manifest confirmToken does not match sha256(projectRef:scope:gitSha:backupHash:expiresAt:bootstrapAllowlistSha256) — manifest is malformed or was hand-edited');
  }
  return true;
}

/** sha256 of the manifest file's exact bytes -- used to prove two readers saw the same manifest. */
export function manifestFileSha256(filePath) {
  return sha256File(filePath);
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
