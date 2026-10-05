#!/usr/bin/env node
// SUPER_ADMIN_SAFETY_GATE: build and sign the approval manifest that
// carries the Super Admin bootstrap allowlist (lib/bootstrap-allowlist.mjs,
// lib/bootstrap-manifest.mjs).
//
//   collect  (read-only)  node bootstrap-manifest.mjs collect --out=<private folder>/candidate.json
//       Reads the target in a read-only session, inside a READ ONLY
//       transaction that is rolled back, and writes an UNSIGNED candidate:
//       the Super Admin UUID, the three plans and the bootstrap audit rows,
//       each with its row fingerprint. Refuses a target that holds anything
//       a bootstrap cannot leave. Only a local database or the one target
//       project (TARGET_SUPABASE_REF) is accepted. No email, name or secret
//       is read into the candidate or printed.
//       MIGRATION_DB_URL is taken from the environment if set, otherwise
//       asked for in a hidden prompt, so it never has to be typed into a
//       PowerShell command (history) or passed as an argument. --out must
//       be a new file in an existing folder outside every git repository.
//       It never signs a manifest and never runs a plan.
//
//   sign     (owner only, interactive)  node bootstrap-manifest.mjs sign --candidate=<file>
//            --backup-manifest=<file> --scope=plan|execute --valid-hours=<n> --out=<manifest.json>
//       Shows what the candidate approves, asks who approves, and requires
//       typing "APPROVE <scope> <first 12 hex of the allowlist sha256>".
//       Refuses without an interactive terminal: it can never be scripted.
//
// Neither command ever writes to the database.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildPgPoolConfig } from '../../data/supabase/client.js';
import { parseStrictCliArgs } from './lib/cli-args.mjs';
import { isLocalHost } from './lib/host-guard.mjs';
import { TARGET_SUPABASE_REF, verifyApprovalManifest, verifyFreshBackup } from './lib/production-approval.mjs';
import { collectBootstrapAllowlist } from './lib/bootstrap-allowlist.mjs';
import { buildManifestCandidate, confirmationPhrase, describeCandidate, signManifestCandidate } from './lib/bootstrap-manifest.mjs';
import { assertSessionReadOnly, makePoolReadOnly } from './lib/read-only-session.mjs';
import { installRedactingConsole } from './lib/redact.mjs';
import {
  assertPrivateOutPath,
  dbUrlProjectRef,
  describeError,
  makeRedactor,
  makeTerminalIo,
  registerDbUrl,
} from '../ops/lib/operator-io.mjs';

export { dbUrlProjectRef };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const CLI_SPEC = {
  flags: {
    out: { type: 'string' },
    candidate: { type: 'string' },
    'backup-manifest': { type: 'string' },
    scope: { type: 'string' },
    'valid-hours': { type: 'string' },
  },
};

function fail(msg) {
  throw new Error(`[bootstrap-manifest] ${msg}`);
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

export function assertCollectTarget(uri) {
  if (!uri) fail('MIGRATION_DB_URL must be set');
  if (isLocalHost(uri)) return 'local';
  const ref = dbUrlProjectRef(uri);
  if (ref !== TARGET_SUPABASE_REF) fail('MIGRATION_DB_URL is neither local nor the target Supabase project -- refusing to read it');
  return 'production';
}

function writeNewFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

/** Read-only collection; returns the unsigned candidate. */
export async function collectCandidate({ dbUrl, gitSha }) {
  assertCollectTarget(dbUrl);
  const pool = makePoolReadOnly(new pg.Pool(buildPgPoolConfig(dbUrl)));
  const client = await pool.connect();
  try {
    await assertSessionReadOnly(client);
    await client.query('BEGIN READ ONLY');
    try {
      const { allowlist, summary } = await collectBootstrapAllowlist(client);
      return { candidate: buildManifestCandidate({ gitSha, bootstrapAllowlist: allowlist }), summary };
    } finally {
      await client.query('ROLLBACK');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * MIGRATION_DB_URL from the environment, else a hidden prompt (interactive
 * terminals only). Registered with the redactor; a non-local URL is refused
 * under CI before anything connects.
 */
export async function resolveCollectDbUrl({ env, io, redactor }) {
  let dbUrl = env.MIGRATION_DB_URL;
  if (!dbUrl) {
    if (!io.interactive) fail('MIGRATION_DB_URL is not set, and there is no interactive terminal to ask for it (hidden)');
    dbUrl = String(await io.promptHidden('MIGRATION_DB_URL (hidden): ')).trim();
  }
  if (!dbUrl) fail('MIGRATION_DB_URL was not provided');
  registerDbUrl(dbUrl, redactor);
  let local;
  try {
    local = isLocalHost(dbUrl);
  } catch {
    fail('MIGRATION_DB_URL is not a parseable URL');
  }
  if (env.CI && !local) fail('refusing a non-local MIGRATION_DB_URL under CI: CI may only ever reach a local database');
  return dbUrl;
}

export async function collect(args, { env = process.env, io, redactor }) {
  const out = assertPrivateOutPath(args.out);
  const dbUrl = await resolveCollectDbUrl({ env, io, redactor });
  if (git(['status', '--porcelain', '--untracked-files=no'])) fail('the working tree has uncommitted changes -- the candidate must name the exact commit that will run');
  const { candidate, summary } = await collectCandidate({ dbUrl, gitSha: git(['rev-parse', 'HEAD']) });
  writeNewFile(out, candidate);
  io.print(JSON.stringify({ written: out, unsigned: true, approves: describeCandidate(candidate), targetState: summary }, null, 2));
  return { out, candidate };
}

async function sign(args, { io }) {
  if (!io.interactive) fail('sign is interactive only: run it yourself in a terminal');
  for (const flag of ['candidate', 'backup-manifest', 'scope', 'valid-hours', 'out']) {
    if (!args[flag]) fail(`--${flag} is required`);
  }
  const out = assertPrivateOutPath(args.out);
  const candidate = JSON.parse(fs.readFileSync(args.candidate, 'utf8'));
  const head = git(['rev-parse', 'HEAD']);
  if (candidate.gitSha !== head) fail(`the candidate names commit ${candidate.gitSha}, but this checkout is ${head}`);
  const backup = verifyFreshBackup(args['backup-manifest']);
  const scope = args.scope;
  const validHours = Number(args['valid-hours']);

  console.log(JSON.stringify({ youAreApproving: describeCandidate(candidate), scope, backupSha256: backup.sha256, backupAgeHours: Number(backup.ageHours.toFixed(1)), validHours }, null, 2));
  if (scope === 'execute') console.log('\nscope=execute authorizes REAL writes to the target. Only sign it after reviewing the plan report.');
  const approvedBy = await io.promptVisible('\nApproved by (your name, not an email): ');
  const phrase = confirmationPhrase(candidate, scope);
  const typed = await io.promptVisible(`Type exactly "${phrase}" to sign: `);
  if (typed.trim() !== phrase) fail('confirmation phrase did not match -- nothing was written');

  const signed = signManifestCandidate(candidate, { scope, backupHash: backup.sha256, approvedBy, validHours });
  verifyApprovalManifest(signed, { gitSha: head, backupHash: backup.sha256, requiredScope: scope });
  writeNewFile(out, signed);
  console.log(`signed ${scope} manifest written to ${out}, valid until ${signed.expiresAt}`);
}

async function main({ io, redactor }) {
  installRedactingConsole();
  const [command, ...rest] = process.argv.slice(2);
  const args = parseStrictCliArgs(rest, CLI_SPEC);
  if (command === 'collect') return collect(args, { io, redactor });
  if (command === 'sign') return sign(args, { io });
  fail('usage: bootstrap-manifest.mjs collect --out=<file> | sign --candidate=<file> --backup-manifest=<file> --scope=plan|execute --valid-hours=<n> --out=<file>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const redactor = makeRedactor();
  const io = makeTerminalIo(redactor);
  main({ io, redactor }).catch((err) => {
    console.error(`[bootstrap-manifest] STOPPED ${describeError(err, redactor)}`);
    process.exitCode = 1;
  });
}
