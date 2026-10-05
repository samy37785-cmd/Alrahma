#!/usr/bin/env node
// SUPER_ADMIN_SAFETY_GATE: build and sign the approval manifest that
// carries the Super Admin bootstrap allowlist (lib/bootstrap-allowlist.mjs,
// lib/bootstrap-manifest.mjs).
//
//   collect  (read-only)  MIGRATION_DB_URL=<target> node bootstrap-manifest.mjs collect --out=<candidate.json>
//       Reads the target in a read-only session, inside a READ ONLY
//       transaction that is rolled back, and writes an UNSIGNED candidate:
//       the Super Admin UUID, the three plans and the bootstrap audit rows,
//       each with its row fingerprint. Refuses a target that holds anything
//       a bootstrap cannot leave. Only a local database or the one target
//       project (TARGET_SUPABASE_REF) is accepted. No email, name or secret
//       is read into the candidate or printed.
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
import readline from 'node:readline';
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

/** The Supabase project ref a Postgres URL belongs to (direct db.<ref> host or pooler user postgres.<ref>), else null. */
export function dbUrlProjectRef(uri) {
  const url = new URL(uri);
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (direct) return direct[1].toLowerCase();
  const pooler = /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(url.username));
  if (/\.pooler\.supabase\.com$/i.test(url.hostname) && pooler) return pooler[1].toLowerCase();
  return null;
}

export function assertCollectTarget(uri) {
  if (!uri) fail('MIGRATION_DB_URL must be set');
  if (isLocalHost(uri)) return 'local';
  const ref = dbUrlProjectRef(uri);
  if (ref !== TARGET_SUPABASE_REF) fail('MIGRATION_DB_URL is neither local nor the target Supabase project -- refusing to read it');
  return 'production';
}

function writeNewFile(filePath, value) {
  if (!filePath) fail('--out=<path> is required');
  if (fs.existsSync(filePath)) fail(`${filePath} already exists -- refusing to overwrite`);
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

async function collect(args) {
  if (git(['status', '--porcelain', '--untracked-files=no'])) fail('the working tree has uncommitted changes -- the candidate must name the exact commit that will run');
  const { candidate, summary } = await collectCandidate({ dbUrl: process.env.MIGRATION_DB_URL, gitSha: git(['rev-parse', 'HEAD']) });
  writeNewFile(args.out, candidate);
  console.log(JSON.stringify({ written: args.out, unsigned: true, approves: describeCandidate(candidate), targetState: summary }, null, 2));
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      process.stdout.write(question);
      rl._writeToOutput = () => {};
      rl.question('', (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
    } else {
      rl.question(question, (a) => { rl.close(); resolve(a); });
    }
  });
}

async function sign(args) {
  if (!process.stdin.isTTY) fail('sign is interactive only: run it yourself in a terminal');
  for (const flag of ['candidate', 'backup-manifest', 'scope', 'valid-hours', 'out']) {
    if (!args[flag]) fail(`--${flag} is required`);
  }
  const candidate = JSON.parse(fs.readFileSync(args.candidate, 'utf8'));
  const head = git(['rev-parse', 'HEAD']);
  if (candidate.gitSha !== head) fail(`the candidate names commit ${candidate.gitSha}, but this checkout is ${head}`);
  const backup = verifyFreshBackup(args['backup-manifest']);
  const scope = args.scope;
  const validHours = Number(args['valid-hours']);

  console.log(JSON.stringify({ youAreApproving: describeCandidate(candidate), scope, backupSha256: backup.sha256, backupAgeHours: Number(backup.ageHours.toFixed(1)), validHours }, null, 2));
  if (scope === 'execute') console.log('\nscope=execute authorizes REAL writes to the target. Only sign it after reviewing the plan report.');
  const approvedBy = await ask('\nApproved by (your name, not an email): ');
  const phrase = confirmationPhrase(candidate, scope);
  const typed = await ask(`Type exactly "${phrase}" to sign: `);
  if (typed.trim() !== phrase) fail('confirmation phrase did not match -- nothing was written');

  const signed = signManifestCandidate(candidate, { scope, backupHash: backup.sha256, approvedBy, validHours });
  verifyApprovalManifest(signed, { gitSha: head, backupHash: backup.sha256, requiredScope: scope });
  writeNewFile(args.out, signed);
  console.log(`signed ${scope} manifest written to ${args.out}, valid until ${signed.expiresAt}`);
}

async function main() {
  installRedactingConsole();
  const [command, ...rest] = process.argv.slice(2);
  const args = parseStrictCliArgs(rest, CLI_SPEC);
  if (command === 'collect') return collect(args);
  if (command === 'sign') return sign(args);
  fail('usage: bootstrap-manifest.mjs collect --out=<file> | sign --candidate=<file> --backup-manifest=<file> --scope=plan|execute --valid-hours=<n> --out=<file>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
