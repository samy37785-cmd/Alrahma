// Shared input, output and target-safety helpers for the owner-run Supabase
// operator tools:
//   - ../supabase-first-super-admin-bootstrap.mjs (one invite, one role)
//   - ../supabase-owner-bootstrap.mjs (invite acceptance, MFA, the 3 plans)
//   - ../../migration/bootstrap-manifest.mjs collect (read-only candidate)
//
// Rules every tool built on this module follows:
//   - A secret (email, password, connection string, API key, invite link,
//     TOTP code) is never a command-line flag, so it can never land in
//     PowerShell history or in the process arguments other programs can
//     read. It comes from the environment or, by default, from a hidden
//     prompt in an interactive terminal.
//   - Every value entered or received is registered with a redactor, and
//     every error is passed through it before it is printed.
//   - Only two targets exist: a local stack (loopback only) and the one
//     production project (TARGET_SUPABASE_REF). A remote target is refused
//     outright when CI is set, before anything connects.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { redactText } from '../../migration/lib/redact.mjs';
import { isLocalHost } from '../../migration/lib/host-guard.mjs';
import { TARGET_SUPABASE_REF } from '../../migration/lib/production-approval.mjs';

export const OPERATOR_TARGETS = ['local', 'production'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_ANYWHERE_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export class OperatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OperatorError';
    this.code = code;
  }
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Pattern-level redaction: connection strings, links, keys, tokens, emails. */
export function redactOperatorText(text) {
  return redactText(String(text).replace(/otpauth:\/\/\S+/gi, '<otpauth-uri>'))
    .replace(/\bhttps?:\/\/[^\s'"`)<>]+/gi, '<url>')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '<api-key>')
    .replace(/<email fp:[0-9a-f]+>/g, '<email>')
    .replace(EMAIL_ANYWHERE_RE, '<email>');
}

/**
 * Value-level redaction. Every secret a tool reads or receives is added, in
 * its raw and URL-encoded forms, and text() replaces each occurrence before
 * applying redactOperatorText().
 */
export function makeRedactor() {
  const values = new Set();
  return {
    add(...secrets) {
      for (const s of secrets) {
        if (typeof s !== 'string' || s.length < 4) continue;
        values.add(s);
        values.add(encodeURIComponent(s));
      }
    },
    text(value) {
      let out = String(value ?? '');
      for (const s of [...values].sort((a, b) => b.length - a.length)) out = out.split(s).join('<redacted>');
      return redactOperatorText(out);
    },
    get size() {
      return values.size;
    },
  };
}

/** What a run of a tool reports for an error: a code and a redacted message, nothing else. */
export function describeError(err, redactor) {
  if (err instanceof OperatorError) return `${err.code}: ${redactor.text(err.message)}`;
  return `UNEXPECTED (${err?.name ?? 'Error'}): ${redactor.text(err?.message ?? String(err))}`;
}

// ── Terminal ────────────────────────────────────────────────────────────────

/**
 * The real terminal. print() is the tool's log: every line goes through the
 * redactor. showSensitive() is for the TOTP enrollment QR and setup key
 * only: it goes to the screen and nowhere else, and clearSensitive() wipes
 * the screen and its scrollback afterwards.
 */
export function makeTerminalIo(redactor, { stdin = process.stdin, stdout = process.stdout } = {}) {
  const ask = (label, hidden) => new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true, historySize: 0 });
    let answered = false;
    rl.on('SIGINT', () => rl.close());
    rl.on('close', () => {
      if (!answered) {
        stdout.write('\n');
        reject(new OperatorError('ABORTED', 'stopped at a prompt -- nothing further was done'));
      }
    });
    const done = (answer) => {
      answered = true;
      rl.close();
      if (hidden) stdout.write('\n');
      resolve(answer);
    };
    if (hidden) {
      stdout.write(label);
      rl._writeToOutput = () => {};
      rl.question('', done);
    } else {
      rl.question(label, done);
    }
  });
  return {
    interactive: !!(stdin.isTTY && stdout.isTTY),
    print: (line) => stdout.write(`${redactor.text(line)}\n`),
    promptHidden: (label) => ask(label, true),
    promptVisible: (label) => ask(label, false),
    showSensitive: (text) => stdout.write(`${text}\n`),
    clearSensitive: () => stdout.write('\x1b[3J\x1b[2J\x1b[H'),
  };
}

export function requireInteractive(io) {
  if (!io.interactive) {
    throw new OperatorError(
      'NOT_INTERACTIVE',
      'run this yourself in an interactive PowerShell window: secrets are only ever read from the keyboard, ' +
      'and output may not be piped or redirected'
    );
  }
}

/** A value from the environment, else a hidden prompt. Registered with the redactor either way. */
export async function secretInput({ env, key, label, io, redactor }) {
  let value = env[key];
  if (!value) value = await io.promptHidden(`${label} (hidden): `);
  value = String(value ?? '').trim();
  if (!value) throw new OperatorError('MISSING_INPUT', `${key} was not provided`);
  redactor.add(value);
  return value;
}

/** Registers a Postgres URL and its password with the redactor. */
export function registerDbUrl(dbUrl, redactor) {
  redactor.add(dbUrl);
  try {
    const url = new URL(dbUrl);
    if (url.password) redactor.add(url.password, decodeURIComponent(url.password));
  } catch {
    // An unparseable value is refused by the target check that follows.
  }
}

// ── Targets ─────────────────────────────────────────────────────────────────

export function parseTarget(value) {
  if (!OPERATOR_TARGETS.includes(value)) {
    throw new OperatorError('BAD_TARGET', `--target must be ${OPERATOR_TARGETS.join(' or ')}`);
  }
  return value;
}

/** CI may only ever reach a local stack: a production target is refused before anything else happens. */
export function assertNoRemoteTargetInCi({ env, target }) {
  if (env.CI && target !== 'local') {
    throw new OperatorError('CI_REMOTE_REFUSED', `refusing --target=${target} under CI: CI may only ever reach a local stack`);
  }
}

/** The second channel: SUPABASE_BOOTSTRAP_TARGET_ENV must name the same target as --target. */
export function assertTargetEnvMatches({ env, target }) {
  if (env.SUPABASE_BOOTSTRAP_TARGET_ENV !== target) {
    throw new OperatorError(
      'TARGET_MISMATCH',
      `--target=${target} does not match SUPABASE_BOOTSTRAP_TARGET_ENV (${env.SUPABASE_BOOTSTRAP_TARGET_ENV ? 'set to something else' : 'unset'})`
    );
  }
}

/**
 * The Supabase API URL and project ref for a target. Production is always
 * https://<TARGET_SUPABASE_REF>.supabase.co, derived here, never typed;
 * local needs SUPABASE_URL on a loopback host.
 */
export function resolveSupabaseApi({ target, env }) {
  if (target === 'production') {
    const url = `https://${TARGET_SUPABASE_REF}.supabase.co`;
    if (env.SUPABASE_URL && env.SUPABASE_URL.replace(/\/+$/, '') !== url) {
      throw new OperatorError('TARGET_MISMATCH', 'SUPABASE_URL is set to something other than the production project');
    }
    return { url, projectRef: TARGET_SUPABASE_REF };
  }
  if (!env.SUPABASE_URL || !isLocalHost(env.SUPABASE_URL)) {
    throw new OperatorError('TARGET_MISMATCH', '--target=local needs SUPABASE_URL on localhost/127.0.0.1');
  }
  return { url: env.SUPABASE_URL.replace(/\/+$/, ''), projectRef: 'local' };
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

export function assertDbUrlTarget(dbUrl, target) {
  let local;
  try {
    local = isLocalHost(dbUrl);
  } catch {
    throw new OperatorError('BAD_DB_URL', 'the database URL is not a parseable URL');
  }
  if (target === 'local' ? !local : dbUrlProjectRef(dbUrl) !== TARGET_SUPABASE_REF) {
    throw new OperatorError('TARGET_MISMATCH', `the database URL does not belong to --target=${target}`);
  }
}

/**
 * What kind of Supabase API key this is, without returning any part of it:
 * a legacy JWT key carries its role (and, for a hosted project, its ref);
 * the newer keys say publishable/secret in their prefix.
 */
export function inspectApiKey(key) {
  if (/^sb_publishable_/.test(key)) return { kind: 'public', ref: null };
  if (/^sb_secret_/.test(key)) return { kind: 'service', ref: null };
  const parts = String(key).split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const kind = payload.role === 'anon' ? 'public' : payload.role === 'service_role' ? 'service' : 'unknown';
      return { kind, ref: typeof payload.ref === 'string' ? payload.ref : null };
    } catch {
      // fall through
    }
  }
  return { kind: 'unknown', ref: null };
}

/** `expected` is 'public' (anon/publishable) or 'service' (service_role/secret). */
export function assertApiKey(key, { expected, projectRef }) {
  const { kind, ref } = inspectApiKey(key);
  if (kind !== expected) {
    throw new OperatorError(
      'WRONG_KEY',
      expected === 'public'
        ? 'this tool only accepts the anon/publishable key -- a service_role or secret key is refused'
        : 'this step needs the service_role/secret key'
    );
  }
  if (projectRef !== 'local' && ref && ref !== projectRef) {
    throw new OperatorError('TARGET_MISMATCH', 'the API key belongs to a different Supabase project');
  }
}

// ── Private output files ───────────────────────────────────────────────────

/**
 * An output file must go to a private folder that already exists and is
 * outside every git repository (no .git in any ancestor), and must not
 * exist yet. Returns the absolute path.
 */
export function assertPrivateOutPath(filePath) {
  if (!filePath) throw new OperatorError('BAD_ARGS', '--out=<path> is required');
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) throw new OperatorError('BAD_OUT_PATH', 'the folder for --out does not exist');
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) {
      throw new OperatorError(
        'OUT_INSIDE_REPOSITORY',
        '--out is inside a git repository -- write it to a private folder outside every repository (for example next to the backups)'
      );
    }
    if (path.dirname(d) === d) break;
  }
  if (fs.existsSync(resolved)) throw new OperatorError('BAD_OUT_PATH', '--out already exists -- refusing to overwrite');
  return resolved;
}

// ── Repository state ────────────────────────────────────────────────────────

export function gitState(repoRoot) {
  const run = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  return { sha: run(['rev-parse', 'HEAD']), dirty: run(['status', '--porcelain', '--untracked-files=no']) !== '' };
}

export async function requireConfirmationPhrase(io, phrase, action) {
  const typed = await io.promptVisible(`Type exactly "${phrase}" to ${action}: `);
  if (String(typed).trim() !== phrase) {
    throw new OperatorError('NOT_CONFIRMED', 'the confirmation phrase did not match -- nothing was done');
  }
}
