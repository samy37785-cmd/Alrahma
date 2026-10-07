// Core of supabase-state-report.mjs: a READ-ONLY report of what a Supabase
// project's database actually holds, for the owner to run (hidden database
// URL) and paste back. It answers, with no PII:
//   - which migrations the project has applied, compared with this
//     checkout's lib/db/drizzle journal (count, exact match, first
//     divergence), plus structural probes that still work when the project
//     has no drizzle journal at all;
//   - which public tables and views are missing/unexpected, which have RLS
//     off, which hold rows;
//   - what state the auth accounts are in (an invited account's timestamps,
//     whether its invite token is still pending, confirmed, signed in, has a
//     password, MFA factors, sessions) and the admin role rows.
//
// It never selects an email, a name, a password hash, a token or an IP. An
// account is identified by the first 8 hex characters of its id only. It
// runs in BEGIN READ ONLY (verified with `show transaction_read_only`) and
// always ROLLBACKs; every statement it sends is a SELECT/SHOW. I/O is
// injected so the whole run is testable on fakes and on a real local stack.
import fs from 'node:fs';
import path from 'node:path';
import { parseStrictCliArgs } from '../../migration/lib/cli-args.mjs';
import { acceptedMigrationHashes, migrationHashMatches } from '../../migration/lib/migration-file-identity.mjs';
import { EXPECTED_NEW_TABLES, EXPECTED_NEW_VIEWS } from '../../../../ops/option-a-rehearsal/scripts/lib/new-schema-fingerprint.mjs';
import {
  OperatorError,
  assertDbUrlTarget,
  assertNoRemoteTargetInCi,
  parseTarget,
  registerDbUrl,
  requireInteractive,
  resolveSupabaseApi,
  secretInput,
} from './operator-io.mjs';

export const TOOL = 'supabase-state-report';

export const CLI_SPEC = { flags: { target: { type: 'string' } } };

/** Supabase's default email OTP lifetime. The project's real setting is a dashboard value this tool cannot read. */
export const DEFAULT_OTP_EXPIRY_MINUTES = 60;
export const MAX_ACCOUNTS_LISTED = 5;

const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

// ── Migration journal ───────────────────────────────────────────────────────

/** Same identity the orchestrator and drizzle use: sha256 of the whole .sql file + the journal's `when`. */
export function readExpectedJournal(repoRoot) {
  const dir = path.join(repoRoot, 'lib', 'db', 'drizzle');
  const journal = JSON.parse(fs.readFileSync(path.join(dir, 'meta', '_journal.json'), 'utf8'));
  return journal.entries.map((entry) => {
    const acceptedHashes = acceptedMigrationHashes(fs.readFileSync(path.join(dir, `${entry.tag}.sql`)));
    return {
      tag: entry.tag,
      hash: acceptedHashes[0],
      acceptedHashes,
      createdAt: String(entry.when),
    };
  });
}

/**
 * applied: null when the project has no drizzle.__drizzle_migrations table,
 * else rows [{hash, created_at}] in application order.
 */
export function compareJournal(applied, expected) {
  if (applied === null) {
    return { status: 'ABSENT', appliedCount: 0, expectedCount: expected.length, matchingPrefix: 0, lineEndingVariantMatches: 0, firstDivergence: null };
  }
  let matchingPrefix = 0;
  let lineEndingVariantMatches = 0;
  while (
    matchingPrefix < applied.length &&
    matchingPrefix < expected.length &&
    String(applied[matchingPrefix].created_at) === expected[matchingPrefix].createdAt &&
    migrationHashMatches(applied[matchingPrefix].hash, expected[matchingPrefix])
  ) {
    if (applied[matchingPrefix].hash !== expected[matchingPrefix].hash) lineEndingVariantMatches++;
    matchingPrefix++;
  }
  let status;
  if (matchingPrefix === expected.length && applied.length === expected.length) status = 'EXACT';
  else if (matchingPrefix === applied.length && applied.length < expected.length) status = 'INCOMPLETE';
  else if (matchingPrefix === expected.length && applied.length > expected.length) status = 'AHEAD';
  else status = 'DIVERGED';
  const firstDivergence = status === 'DIVERGED' ? { position: matchingPrefix, tag: expected[matchingPrefix]?.tag ?? null } : null;
  return { status, appliedCount: applied.length, expectedCount: expected.length, matchingPrefix, lineEndingVariantMatches, firstDivergence };
}

// ── Invite state ────────────────────────────────────────────────────────────

const toMs = (value) => (value ? Date.parse(value) : null);

/**
 * What the account's own timestamps say about its invite. No guess is made
 * about WHO consumed a used link: GoTrue records the same fields whether a
 * person, a browser prefetch or a mail scanner opened it.
 *
 * account: {createdAt, invitedAt, confirmationSentAt, emailConfirmedAt, lastSignInAt, hasPassword,
 *           pendingConfirmationTokens, legacyConfirmationToken, banned}
 */
export function classifyInvite(account, now) {
  if (!account) return { state: 'NO_ACCOUNT', consumed: null, ageMinutes: null, likelyExpired: null };
  const sentMs = toMs(account.confirmationSentAt) ?? toMs(account.invitedAt) ?? toMs(account.createdAt);
  const ageMinutes = sentMs === null ? null : Math.max(0, Math.round((now - sentMs) / 60000));
  const confirmed = Boolean(account.emailConfirmedAt);
  const signedIn = Boolean(account.lastSignInAt);
  const tokenPending = account.pendingConfirmationTokens > 0 || account.legacyConfirmationToken === true;
  let state;
  if (!confirmed && !signedIn) state = tokenPending ? 'INVITE_PENDING_NOT_USED' : 'INVITE_NOT_USED_NO_TOKEN_ROW';
  else if (confirmed && signedIn) state = account.hasPassword ? 'INVITE_CONSUMED_PASSWORD_SET' : 'INVITE_CONSUMED_NO_PASSWORD';
  else if (confirmed) state = 'CONFIRMED_NEVER_SIGNED_IN';
  else state = 'SIGNED_IN_NOT_CONFIRMED';
  const consumed = confirmed || signedIn;
  const likelyExpired = !consumed && ageMinutes !== null ? ageMinutes > DEFAULT_OTP_EXPIRY_MINUTES : null;
  return { state, consumed, ageMinutes, likelyExpired };
}

// ── The read ────────────────────────────────────────────────────────────────

function sqlIsReadOnly(sql) {
  return /^\s*(select|show)\b/i.test(sql);
}

/** Wraps a client so that anything but a SELECT/SHOW is refused before it is sent. */
export function selectOnly(client) {
  return {
    query: (sql, params) => {
      if (!sqlIsReadOnly(sql)) throw new OperatorError('NOT_READ_ONLY', 'this tool only ever sends SELECT/SHOW statements');
      return client.query(sql, params);
    },
  };
}

async function exists(client, regclass) {
  const { rows } = await client.query('select to_regclass($1) is not null as present', [regclass]);
  return rows[0].present === true;
}

async function readAccount(client, row, authTables) {
  const id = row.id;
  const account = {
    idPrefix: String(id).slice(0, 8),
    createdAt: row.created_at,
    invitedAt: row.invited_at,
    confirmationSentAt: row.confirmation_sent_at,
    emailConfirmedAt: row.email_confirmed_at,
    lastSignInAt: row.last_sign_in_at,
    updatedAt: row.updated_at,
    banned: row.banned === true,
    anonymous: row.is_anonymous === 'true',
    hasPassword: row.has_password === true,
    provider: row.provider || null,
    legacyConfirmationToken: row.legacy_confirmation_token === true,
    identities: null,
    mfaFactors: null,
    sessions: null,
    oneTimeTokens: null,
    pendingConfirmationTokens: 0,
    auditActions: null,
    profileRole: null,
    adminRoles: [],
  };
  if (authTables.identities) {
    account.identities = (await client.query('select count(*)::int as n from auth.identities where user_id = $1', [id])).rows[0].n;
  }
  if (authTables.mfa_factors) {
    const { rows } = await client.query('select f.status::text as status, count(*)::int as n from auth.mfa_factors f where f.user_id = $1 group by 1', [id]);
    account.mfaFactors = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
  if (authTables.sessions) {
    account.sessions = (await client.query('select count(*)::int as n from auth.sessions where user_id = $1', [id])).rows[0].n;
  }
  if (authTables.one_time_tokens) {
    const { rows } = await client.query(
      `select token_type::text as type, count(*)::int as n, min(created_at)::text as oldest
         from auth.one_time_tokens where user_id = $1 group by 1 order by 1`,
      [id]
    );
    account.oneTimeTokens = rows.map((r) => ({ type: r.type, count: r.n, oldest: r.oldest }));
    account.pendingConfirmationTokens = rows.filter((r) => r.type === 'confirmation_token').reduce((a, r) => a + r.n, 0);
  }
  if (authTables.audit_log_entries) {
    // Action names and times only: the payload also carries the email and the IP.
    const { rows } = await client.query(
      `select payload->>'action' as action, created_at::text as at
         from auth.audit_log_entries
        where payload->>'actor_id' = $1 or payload->'traits'->>'user_id' = $1
        order by created_at limit 50`,
      [id]
    );
    account.auditActions = rows.map((r) => ({ action: r.action, at: r.at }));
  }
  account.profileRole = (await client.query('select role::text as role from public.profiles where id = $1', [id])).rows[0]?.role ?? null;
  account.adminRoles = (await client.query('select role::text as role from public.admin_role_assignments where user_id = $1 order by 1', [id])).rows.map((r) => r.role);
  return account;
}

/** Every read the report needs, as plain SELECTs on `client` (already inside a read-only transaction). */
export async function collectStateReport(rawClient, { expectedJournal, now = Date.now() }) {
  const client = selectOnly(rawClient);
  const report = { collectedAt: new Date(now).toISOString() };

  // Migration journal.
  let applied = null;
  if (await exists(client, 'drizzle.__drizzle_migrations')) {
    applied = (await client.query('select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by id asc')).rows;
  }
  report.journal = compareJournal(applied, expectedJournal);

  // Public relations.
  const rels = (await client.query(
    `select c.relname as name, c.relkind::text as kind, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v','m') order by 1`
  )).rows;
  const tables = rels.filter((r) => r.kind === 'r' || r.kind === 'p');
  const views = rels.filter((r) => r.kind === 'v' || r.kind === 'm');
  const tableNames = new Set(tables.map((t) => t.name));
  const viewNames = new Set(views.map((v) => v.name));
  report.schema = {
    tableCount: tables.length,
    viewCount: views.length,
    tablesMissing: EXPECTED_NEW_TABLES.filter((t) => !tableNames.has(t)),
    tablesUnexpected: [...tableNames].filter((t) => !EXPECTED_NEW_TABLES.includes(t)).sort(),
    viewsMissing: EXPECTED_NEW_VIEWS.filter((v) => !viewNames.has(v)),
    rlsDisabled: tables.filter((t) => t.rls !== true).map((t) => t.name),
  };

  // Structural probes: one per migration whose effect is easy to see, so the
  // schema level can be estimated even with no drizzle journal.
  const col = async (table, column) =>
    (await client.query(
      `select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [table, column]
    )).rows[0].n > 0;
  const paymob = (await client.query(
    `select count(*)::int as n from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'payment_gateway' and e.enumlabel = 'paymob'`
  )).rows[0].n > 0;
  report.probes = {
    '0013_admin_rbac': tableNames.has('admin_role_assignments'),
    '0016_reviews_public_view': viewNames.has('reviews_public'),
    '0019_teachers_public_view': viewNames.has('teachers_public'),
    '0022_migration_ledger': tableNames.has('migration_source_ledger'),
    '0028_payment_gateway_paymob': paymob,
    '0029_preserved_dates': await col('trial_requests', 'updated_at'),
  };

  // Rows per public table (only tables that hold any).
  report.rows = {};
  for (const t of tables) {
    if (!TABLE_NAME_RE.test(t.name)) {
      report.rows[`(unusual table name, length ${t.name.length})`] = null;
      continue;
    }
    const n = (await client.query(`select count(*)::int as n from public."${t.name}"`)).rows[0].n;
    if (n > 0) report.rows[t.name] = n;
  }

  // Auth accounts.
  const authTables = {};
  for (const name of ['identities', 'mfa_factors', 'sessions', 'one_time_tokens', 'audit_log_entries']) {
    authTables[name] = await exists(client, `auth.${name}`);
  }
  const userCount = (await client.query('select count(*)::int as n from auth.users')).rows[0].n;
  report.auth = { userCount, listed: false, accounts: [] };
  if (userCount > 0 && userCount <= MAX_ACCOUNTS_LISTED) {
    const users = (await client.query(
      `select u.id::text as id,
              to_jsonb(u)->>'created_at' as created_at, to_jsonb(u)->>'invited_at' as invited_at,
              to_jsonb(u)->>'confirmation_sent_at' as confirmation_sent_at, to_jsonb(u)->>'email_confirmed_at' as email_confirmed_at,
              to_jsonb(u)->>'last_sign_in_at' as last_sign_in_at, to_jsonb(u)->>'updated_at' as updated_at,
              (to_jsonb(u)->>'banned_until') is not null as banned,
              to_jsonb(u)->>'is_anonymous' as is_anonymous,
              coalesce(to_jsonb(u)->>'encrypted_password', '') <> '' as has_password,
              to_jsonb(u)->'raw_app_meta_data'->>'provider' as provider,
              coalesce(to_jsonb(u)->>'confirmation_token', '') <> '' as legacy_confirmation_token
         from auth.users u order by u.created_at, u.id`
    )).rows;
    report.auth.listed = true;
    for (const row of users) report.auth.accounts.push(await readAccount(client, row, authTables));
  }
  report.invite = report.auth.accounts.map((a) => classifyInvite(a, now));

  // Admin / bootstrap rows.
  report.admin = {
    roleRows: (await client.query('select count(*)::int as n from public.admin_role_assignments')).rows[0].n,
    adminProfiles: (await client.query(`select count(*)::int as n from public.profiles where role = 'admin'`)).rows[0].n,
  };
  return report;
}

// ── Rendering ───────────────────────────────────────────────────────────────

const list = (items) => (items.length ? items.join(',') : 'none');
const ts = (v) => v ?? 'null';

/** The report as key=value lines. Nothing here can carry an email, a token, a hash or a full id. */
export function renderReport(report, { target, projectRef, git }) {
  const j = report.journal;
  const s = report.schema;
  const lines = [
    `[${TOOL}] READ-ONLY report target=${target} projectRef=${projectRef} collectedAt=${report.collectedAt}`,
    `GIT_SHA=${git?.sha ?? 'unknown'} GIT_DIRTY=${git?.dirty ?? 'unknown'} GIT_BEHIND_ORIGIN_MAIN=${git?.behindMain ?? 'unknown'}`,
    `MIGRATION_JOURNAL=${j.status}`,
    `MIGRATION_COUNT=${j.appliedCount}`,
    `EXPECTED_MIGRATION_COUNT=${j.expectedCount}`,
    `JOURNAL_MATCHING_PREFIX=${j.matchingPrefix}`,
    `JOURNAL_LINE_ENDING_VARIANT_MATCHES=${j.lineEndingVariantMatches}`,
  ];
  if (j.firstDivergence) lines.push(`JOURNAL_FIRST_DIVERGENCE=position ${j.firstDivergence.position} (${j.firstDivergence.tag})`);
  lines.push(
    `PUBLIC_TABLES=${s.tableCount} PUBLIC_VIEWS=${s.viewCount}`,
    `TABLES_MISSING=${list(s.tablesMissing)}`,
    `TABLES_UNEXPECTED=${list(s.tablesUnexpected)}`,
    `VIEWS_MISSING=${list(s.viewsMissing)}`,
    `RLS_DISABLED=${list(s.rlsDisabled)}`
  );
  for (const [name, present] of Object.entries(report.probes)) lines.push(`PROBE ${name}=${present ? 'present' : 'absent'}`);
  const rowEntries = Object.entries(report.rows).map(([name, n]) => `${name}:${n ?? '?'}`);
  lines.push(`PUBLIC_TABLES_WITH_ROWS=${list(rowEntries)}`);
  lines.push(`AUTH_USERS=${report.auth.userCount}${report.auth.listed ? '' : ` (more than ${MAX_ACCOUNTS_LISTED}: not listed)`}`);
  report.auth.accounts.forEach((a, i) => {
    const inv = report.invite[i];
    const n = i + 1;
    lines.push(
      `ACCOUNT[${n}] id_prefix=${a.idPrefix} provider=${a.provider ?? 'none'} anonymous=${a.anonymous} banned=${a.banned}`,
      `ACCOUNT[${n}] created_at=${ts(a.createdAt)} invited_at=${ts(a.invitedAt)} confirmation_sent_at=${ts(a.confirmationSentAt)}`,
      `ACCOUNT[${n}] EMAIL_CONFIRMED=${a.emailConfirmedAt ? 'YES' : 'NO'} email_confirmed_at=${ts(a.emailConfirmedAt)}`,
      `ACCOUNT[${n}] LAST_SIGN_IN_PRESENT=${a.lastSignInAt ? 'YES' : 'NO'} last_sign_in_at=${ts(a.lastSignInAt)} updated_at=${ts(a.updatedAt)}`,
      `ACCOUNT[${n}] has_password=${a.hasPassword} identities=${a.identities ?? 'n/a'} sessions=${a.sessions ?? 'n/a'} mfa_factors=${a.mfaFactors ? list(Object.entries(a.mfaFactors).map(([k, v]) => `${k}:${v}`)) : 'n/a'}`,
      `ACCOUNT[${n}] one_time_tokens=${a.oneTimeTokens ? list(a.oneTimeTokens.map((t) => `${t.type}:${t.count}(oldest ${t.oldest})`)) : 'n/a'} legacy_confirmation_token=${a.legacyConfirmationToken}`,
      `ACCOUNT[${n}] auth_audit=${a.auditActions ? list(a.auditActions.map((x) => `${x.action}(${x.at})`)) : 'n/a'}`,
      `ACCOUNT[${n}] profile_role=${a.profileRole ?? 'none'} admin_roles=${list(a.adminRoles)}`,
      `ACCOUNT[${n}] INVITE_STATE=${inv.state} INVITE_CONSUMED=${inv.consumed} INVITE_AGE_MINUTES=${inv.ageMinutes ?? 'unknown'} ` +
        `INVITE_LIKELY_EXPIRED=${inv.likelyExpired ?? 'n/a'}`
    );
  });
  if (report.invite.some((i) => i.likelyExpired !== null)) {
    lines.push(
      `NOTE expiry is judged against Supabase's default ${DEFAULT_OTP_EXPIRY_MINUTES} min email OTP lifetime; ` +
        'the project\'s real value is in Dashboard > Authentication (not readable here)'
    );
  }
  lines.push(`SUPER_ADMIN_ASSIGNMENT_COUNT=${report.admin.roleRows} ADMIN_PROFILES=${report.admin.adminProfiles}`);
  return lines;
}

// ── The whole run ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  try {
    return parseStrictCliArgs(argv, CLI_SPEC);
  } catch (err) {
    throw new OperatorError('BAD_ARGS', err.message);
  }
}

/**
 * @param {object} p
 * @param {string[]} p.argv
 * @param {object} p.env
 * @param {object} p.io - interactive, print, promptHidden
 * @param {object} p.redactor
 * @param {object} p.deps
 * @param {() => {sha, dirty, behindMain}} p.deps.gitState
 * @param {(dbUrl: string) => {readOnly: (fn) => Promise<any>, end: () => Promise<void>}} p.deps.createDb
 * @param {() => Array} p.deps.expectedJournal
 * @param {() => number} [p.deps.now]
 */
export async function runStateReportCli({ argv, env, io, redactor, deps }) {
  const args = parseArgs(argv);
  if (args.target === undefined) throw new OperatorError('BAD_ARGS', '--target=<local|production> is required');
  const target = parseTarget(args.target);
  assertNoRemoteTargetInCi({ env, target });
  io.print(`[${TOOL}] read-only: SELECT/SHOW inside BEGIN READ ONLY, always rolled back. Nothing is written, no email/secret/token is read or printed.`);
  requireInteractive(io);

  const git = deps.gitState();
  const { projectRef } = resolveSupabaseApi({ target, env });
  const dbUrl = await secretInput({ env, key: 'SUPABASE_DB_URL', label: 'Database URL', io, redactor });
  registerDbUrl(dbUrl, redactor);
  assertDbUrlTarget(dbUrl, target);

  const expectedJournal = deps.expectedJournal();
  const db = deps.createDb(dbUrl);
  try {
    const report = await db.readOnly((client) => collectStateReport(client, { expectedJournal, now: (deps.now ?? Date.now)() }));
    if (git.behindMain > 0) io.print(`WARNING this checkout is ${git.behindMain} commit(s) behind origin/main -- git fetch, then check it out again before using any other tool`);
    if (git.dirty) io.print('WARNING this checkout has uncommitted changes');
    for (const line of renderReport(report, { target, projectRef, git })) io.print(line);
    return { status: 'ok', report };
  } finally {
    await db.end();
  }
}
