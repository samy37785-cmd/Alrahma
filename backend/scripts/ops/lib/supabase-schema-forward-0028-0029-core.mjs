// Core for the narrowly-scoped owner-run schema-forward tool. It can only
// advance a database whose journal is the exact 0000-0027 prefix to exactly
// 0000-0029. It refuses a partial schema, unexpected data, another target,
// or a checkout that contains any migration beyond 0029.
import fs from 'node:fs';
import path from 'node:path';
import { parseStrictCliArgs } from '../../migration/lib/cli-args.mjs';
import { compareJournal } from './supabase-state-report-core.mjs';
import {
  OperatorError,
  assertDbUrlTarget,
  assertNoRemoteTargetInCi,
  parseTarget,
  registerDbUrl,
  requireConfirmationPhrase,
  requireInteractive,
  resolveSupabaseApi,
  secretInput,
} from './operator-io.mjs';
import { EXPECTED_NEW_TABLES, EXPECTED_NEW_VIEWS } from '../../../../ops/option-a-rehearsal/scripts/lib/new-schema-fingerprint.mjs';

export const TOOL = 'supabase-schema-forward-0028-0029';
export const REQUIRED_PREFIX_COUNT = 28;
export const FINAL_COUNT = 30;
export const FINAL_TAGS = ['0028_payment_gateway_paymob', '0029_preserve_source_dates'];
export const CONFIRM_FLAG = 'confirm-0028-0029';
export const ALLOW_ENV = 'ALLOW_SUPABASE_SCHEMA_FORWARD_0028_0029';
export const TARGET_ENV = 'SUPABASE_SCHEMA_TARGET_ENV';

export const CLI_SPEC = {
  flags: {
    apply: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    [CONFIRM_FLAG]: { type: 'boolean' },
    target: { type: 'string' },
  },
};

const DATE_COLUMNS = [
  ['trial_requests', 'updated_at'],
  ['subscribers', 'updated_at'],
  ['quran_bookmarks', 'updated_at'],
  ['quran_reading_progress', 'created_at'],
  ['quran_reading_progress', 'updated_at'],
  ['quran_memorization_stats', 'created_at'],
  ['quran_memorization_stats', 'updated_at'],
];

const DATE_TRIGGERS = [
  'trial_requests_set_updated_at',
  'subscribers_set_updated_at',
  'quran_bookmarks_set_updated_at',
  'quran_reading_progress_set_updated_at',
  'quran_memorization_stats_set_updated_at',
];

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

function fail(code, message) {
  throw new OperatorError(code, message);
}

export function parseArgs(argv) {
  try {
    return parseStrictCliArgs(argv, CLI_SPEC);
  } catch (err) {
    throw new OperatorError('BAD_ARGS', err.message);
  }
}

export function resolveRunConfig({ args, env }) {
  if (args.apply && args['dry-run']) fail('BAD_ARGS', '--apply and --dry-run cannot be combined.');
  if (!args.apply) {
    for (const flag of [CONFIRM_FLAG, 'target']) {
      if (args[flag] !== undefined) fail('BAD_ARGS', `--${flag} only has meaning together with --apply.`);
    }
    return { apply: false };
  }
  if (!args[CONFIRM_FLAG]) fail('BAD_ARGS', `--apply requires --${CONFIRM_FLAG}.`);
  const target = parseTarget(args.target);
  if (env[ALLOW_ENV] !== '1') fail('NOT_AUTHORIZED', `${ALLOW_ENV}=1 is required for this one run.`);
  assertNoRemoteTargetInCi({ env, target });
  if (env[TARGET_ENV] !== target) {
    fail('TARGET_MISMATCH', `--target=${target} does not match ${TARGET_ENV} (${env[TARGET_ENV] ? 'set to something else' : 'unset'}).`);
  }
  return { apply: true, target };
}

export function assertExpectedTail(expectedJournal) {
  if (expectedJournal.length !== FINAL_COUNT) {
    fail('UNEXPECTED_LOCAL_JOURNAL', `this tool is pinned to exactly ${FINAL_COUNT} migrations; this checkout has ${expectedJournal.length}`);
  }
  const tail = expectedJournal.slice(REQUIRED_PREFIX_COUNT).map((m) => m.tag);
  if (tail.length !== FINAL_TAGS.length || tail.some((tag, i) => tag !== FINAL_TAGS[i])) {
    fail('UNEXPECTED_LOCAL_JOURNAL', `the only permitted tail is ${FINAL_TAGS.join(' then ')}`);
  }
  return expectedJournal;
}

export function readTailMigrations(repoRoot, expectedJournal) {
  assertExpectedTail(expectedJournal);
  const dir = path.join(repoRoot, 'lib', 'db', 'drizzle');
  return expectedJournal.slice(REQUIRED_PREFIX_COUNT).map((entry) => ({
    ...entry,
    sql: fs.readFileSync(path.join(dir, `${entry.tag}.sql`), 'utf8'),
  }));
}

function names(rows) {
  return rows.map((r) => r.name).sort();
}

function sameNames(actual, expected) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  return a.length === e.length && a.every((value, i) => value === e[i]);
}

function quoteTable(name) {
  if (!IDENTIFIER_RE.test(name)) fail('UNEXPECTED_SCHEMA', 'an unexpected public table name was found');
  return `public."${name}"`;
}

/** Reads only non-sensitive schema, journal and row-count facts. */
export async function collectSchemaForwardState(client, expectedJournal) {
  const exists = await client.query(`select to_regclass('drizzle.__drizzle_migrations') is not null as present`);
  const applied = exists.rows[0]?.present
    ? (await client.query('select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by id asc')).rows
    : null;
  const relations = (await client.query(
    `select c.relname as name, c.relkind::text as kind, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v','m') order by 1`
  )).rows;
  const tables = relations.filter((r) => r.kind === 'r' || r.kind === 'p');
  const views = relations.filter((r) => r.kind === 'v' || r.kind === 'm');
  const paymob = Number((await client.query(
    `select count(*)::int as n from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'payment_gateway' and e.enumlabel = 'paymob'`
  )).rows[0].n);
  const dateColumns = (await client.query(
    `select table_name, column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (
          ('trial_requests','updated_at'), ('subscribers','updated_at'), ('quran_bookmarks','updated_at'),
          ('quran_reading_progress','created_at'), ('quran_reading_progress','updated_at'),
          ('quran_memorization_stats','created_at'), ('quran_memorization_stats','updated_at')
        ) order by table_name, column_name`
  )).rows;
  const dateTriggers = (await client.query(
    `select t.tgname as name from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal and t.tgname = any($1::text[]) order by 1`,
    [DATE_TRIGGERS]
  )).rows;
  const rowCounts = {};
  for (const table of EXPECTED_NEW_TABLES) {
    rowCounts[table] = Number((await client.query(`select count(*)::int as n from ${quoteTable(table)}`)).rows[0].n);
  }
  const authUsers = Number((await client.query('select count(*)::int as n from auth.users')).rows[0].n);
  return {
    journal: compareJournal(applied, expectedJournal),
    tables: names(tables),
    views: names(views),
    rlsDisabled: tables.filter((t) => t.rls !== true).map((t) => t.name).sort(),
    paymob,
    dateColumns,
    dateTriggers: names(dateTriggers),
    rowCounts,
    authUsers,
  };
}

function assertCommonState(state) {
  if (!sameNames(state.tables, EXPECTED_NEW_TABLES) || !sameNames(state.views, EXPECTED_NEW_VIEWS)) {
    fail('UNEXPECTED_SCHEMA', 'public tables/views do not exactly match the reviewed 0027 schema');
  }
  if (state.rlsDisabled.length) fail('RLS_NOT_ENABLED', 'one or more public tables do not have RLS enabled');
  if (state.authUsers !== 0) fail('TARGET_NOT_EMPTY', `auth.users must be 0, got ${state.authUsers}`);
  for (const [table, count] of Object.entries(state.rowCounts)) {
    const expected = table === 'role_permissions' ? 26 : 0;
    if (count !== expected) fail('TARGET_NOT_EMPTY', `${table} must contain ${expected} rows before this schema-only step, got ${count}`);
  }
}

/** Refuses unless the target is exactly the known production state before 0028. */
export function assertPreflightState(state) {
  assertCommonState(state);
  const j = state.journal;
  if (j.status !== 'INCOMPLETE' || j.appliedCount !== REQUIRED_PREFIX_COUNT || j.matchingPrefix !== REQUIRED_PREFIX_COUNT || j.expectedCount !== FINAL_COUNT) {
    fail('WRONG_MIGRATION_STATE', `expected the exact 0000-0027 prefix (${REQUIRED_PREFIX_COUNT}/${FINAL_COUNT}); got ${j.status} ${j.appliedCount}/${j.expectedCount} prefix=${j.matchingPrefix}`);
  }
  if (state.paymob !== 0 || state.dateColumns.length !== 0 || state.dateTriggers.length !== 0) {
    fail('PARTIAL_TARGET_SCHEMA', 'an effect of 0028 or 0029 already exists without its complete journal state');
  }
  return state;
}

/** Verifies the exact intended journal and all structural effects before COMMIT. */
export function assertPostflightState(state) {
  assertCommonState(state);
  const j = state.journal;
  if (j.status !== 'EXACT' || j.appliedCount !== FINAL_COUNT || j.matchingPrefix !== FINAL_COUNT) {
    fail('POST_WRITE_VERIFICATION_FAILED', `journal is not exact ${FINAL_COUNT}/${FINAL_COUNT}`);
  }
  if (state.paymob !== 1) fail('POST_WRITE_VERIFICATION_FAILED', 'payment_gateway.paymob is not present exactly once');
  if (state.dateColumns.length !== DATE_COLUMNS.length) fail('POST_WRITE_VERIFICATION_FAILED', 'not all seven preserved-date columns are present');
  const actualColumns = state.dateColumns.map((c) => `${c.table_name}.${c.column_name}`);
  const expectedColumns = DATE_COLUMNS.map(([table, column]) => `${table}.${column}`);
  if (!sameNames(actualColumns, expectedColumns)) fail('POST_WRITE_VERIFICATION_FAILED', 'the preserved-date column set is not exact');
  for (const col of state.dateColumns) {
    if (col.data_type !== 'timestamp with time zone' || col.is_nullable !== 'YES' || !/now\(\)/i.test(col.column_default ?? '')) {
      fail('POST_WRITE_VERIFICATION_FAILED', `${col.table_name}.${col.column_name} has the wrong type, nullability or default`);
    }
  }
  if (!sameNames(state.dateTriggers, DATE_TRIGGERS)) fail('POST_WRITE_VERIFICATION_FAILED', 'the five updated_at triggers are not exact');
  return state;
}

function splitStatements(sql) {
  return sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean);
}

/** Must be called inside the CLI's locked transaction. */
export async function applyTailMigrations(client, { expectedJournal, migrations, collectState = collectSchemaForwardState }) {
  assertExpectedTail(expectedJournal);
  if (migrations.length !== 2 || migrations.some((m, i) => m.tag !== FINAL_TAGS[i])) {
    fail('UNEXPECTED_LOCAL_JOURNAL', 'the runner received anything other than migrations 0028 and 0029');
  }
  assertPreflightState(await collectState(client, expectedJournal));
  for (const migration of migrations) {
    for (const statement of splitStatements(migration.sql)) await client.query(statement);
    await client.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [migration.hash, migration.createdAt]);
  }
  return assertPostflightState(await collectState(client, expectedJournal));
}

/**
 * Whole owner-run flow. The database wrapper must lock the journal table
 * before invoking inTransaction(), so the second preflight and both writes
 * are atomic against another compliant or Drizzle migration runner.
 */
export async function runSchemaForwardCli({ argv, env, io, redactor, deps }) {
  const config = resolveRunConfig({ args: parseArgs(argv), env });
  io.print(`[${TOOL}] mode=${config.apply ? 'apply' : 'dry-run'}`);
  if (!config.apply) {
    io.print(`[${TOOL}] dry-run only -- no input was read, no connection was made, nothing was written.`);
    io.print(`[${TOOL}] pinned action: exact 0000-0027 -> exact 0000-0029; only ${FINAL_TAGS.join(' then ')}.`);
    return { status: 'dry-run' };
  }

  requireInteractive(io);
  const git = deps.gitState();
  if (config.target === 'production' && (git.dirty || !git.originMainSha || git.sha !== git.originMainSha)) {
    fail('STALE_OR_DIRTY_CHECKOUT', 'production requires a clean checkout whose HEAD exactly equals origin/main');
  }
  const { projectRef } = resolveSupabaseApi({ target: config.target, env });
  const expectedJournal = assertExpectedTail(deps.expectedJournal());
  const migrations = deps.tailMigrations(expectedJournal);
  const collectState = deps.collectState ?? collectSchemaForwardState;
  io.print(`[${TOOL}] target=${config.target} projectRef=${projectRef} gitSha=${git.sha}`);
  io.print(`[${TOOL}] permitted=${FINAL_TAGS.join(',')} expected_before=28 expected_after=30`);

  const dbUrl = await secretInput({ env, key: 'SUPABASE_DB_URL', label: 'Database URL', io, redactor });
  registerDbUrl(dbUrl, redactor);
  assertDbUrlTarget(dbUrl, config.target);
  const db = deps.createDb(dbUrl);
  try {
    const pre = assertPreflightState(await db.readOnly((client) => collectState(client, expectedJournal)));
    io.print(`PREFLIGHT=PASS MIGRATIONS=${pre.journal.appliedCount}/${pre.journal.expectedCount} AUTH_USERS=0 ROLE_PERMISSIONS=26 OTHER_ROWS=0`);
    io.print('[supabase-schema-forward-0028-0029] next: one transaction; schema only; no auth user, plan or application row is created.');
    await requireConfirmationPhrase(io, `APPLY 0028 AND 0029 ${projectRef}`, 'apply exactly migrations 0028 and 0029');
    await db.inTransaction((client) => applyTailMigrations(client, { expectedJournal, migrations, collectState }));
    const post = assertPostflightState(await db.readOnly((client) => collectState(client, expectedJournal)));
    io.print(`MIGRATIONS_APPLIED=2 MIGRATION_COUNT=${post.journal.appliedCount} JOURNAL=EXACT`);
    io.print('PROBE_0028_PAYMOB=present PROBE_0029_PRESERVED_DATES=present');
    io.print('STATUS=success');
    return { status: 'success', migrationsApplied: 2 };
  } finally {
    await db.end();
  }
}
