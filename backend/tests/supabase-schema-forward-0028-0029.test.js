import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOW_ENV,
  CONFIRM_FLAG,
  FINAL_TAGS,
  TARGET_ENV,
  applyTailMigrations,
  assertExpectedTail,
  assertPostflightState,
  assertPreflightState,
  parseArgs,
  resolveRunConfig,
  runSchemaForwardCli,
} from '../scripts/ops/lib/supabase-schema-forward-0028-0029-core.mjs';
import { OperatorError, makeRedactor } from '../scripts/ops/lib/operator-io.mjs';
import { EXPECTED_NEW_TABLES, EXPECTED_NEW_VIEWS } from '../../ops/option-a-rehearsal/scripts/lib/new-schema-fingerprint.mjs';
import { scriptedIo, assertNoLeaks } from './helpers/operator-fakes.js';

const LOCAL_DB_URL = 'postgresql://postgres:schema-forward-test-pw@127.0.0.1:5432/postgres';

function expectedJournal() {
  return Array.from({ length: 30 }, (_, i) => ({
    tag: i === 28 ? FINAL_TAGS[0] : i === 29 ? FINAL_TAGS[1] : `${String(i).padStart(4, '0')}_fixture`,
    hash: `hash-${i}`,
    acceptedHashes: [`hash-${i}`],
    createdAt: String(1_780_000_000_000 + i),
  }));
}

function journalStatus(kind) {
  if (kind === 'before') return { status: 'INCOMPLETE', appliedCount: 28, expectedCount: 30, matchingPrefix: 28, lineEndingVariantMatches: 25, firstDivergence: null };
  return { status: 'EXACT', appliedCount: 30, expectedCount: 30, matchingPrefix: 30, lineEndingVariantMatches: 25, firstDivergence: null };
}

const dateColumns = [
  ['trial_requests', 'updated_at'],
  ['subscribers', 'updated_at'],
  ['quran_bookmarks', 'updated_at'],
  ['quran_reading_progress', 'created_at'],
  ['quran_reading_progress', 'updated_at'],
  ['quran_memorization_stats', 'created_at'],
  ['quran_memorization_stats', 'updated_at'],
].map(([table_name, column_name]) => ({
  table_name,
  column_name,
  data_type: 'timestamp with time zone',
  is_nullable: 'YES',
  column_default: 'now()',
}));

const dateTriggers = [
  'trial_requests_set_updated_at',
  'subscribers_set_updated_at',
  'quran_bookmarks_set_updated_at',
  'quran_reading_progress_set_updated_at',
  'quran_memorization_stats_set_updated_at',
].sort();

function state(kind = 'before', overrides = {}) {
  return {
    journal: journalStatus(kind),
    tables: [...EXPECTED_NEW_TABLES].sort(),
    views: [...EXPECTED_NEW_VIEWS].sort(),
    rlsDisabled: [],
    paymob: kind === 'before' ? 0 : 1,
    dateColumns: kind === 'before' ? [] : dateColumns,
    dateTriggers: kind === 'before' ? [] : dateTriggers,
    rowCounts: Object.fromEntries(EXPECTED_NEW_TABLES.map((name) => [name, name === 'role_permissions' ? 26 : 0])),
    authUsers: 0,
    ...overrides,
  };
}

const err = (code) => (e) => e instanceof OperatorError && e.code === code;

test('CLI grammar and authorization gates are explicit and production is refused under CI', () => {
  assert.deepEqual(resolveRunConfig({ args: parseArgs([]), env: {} }), { apply: false });
  assert.throws(() => parseArgs(['--db-url=do-not-accept-secrets']), err('BAD_ARGS'));
  assert.throws(() => resolveRunConfig({ args: parseArgs(['--apply', '--target=local']), env: {} }), err('BAD_ARGS'));
  assert.throws(
    () => resolveRunConfig({ args: parseArgs(['--apply', `--${CONFIRM_FLAG}`, '--target=local']), env: {} }),
    err('NOT_AUTHORIZED')
  );
  assert.throws(
    () => resolveRunConfig({
      args: parseArgs(['--apply', `--${CONFIRM_FLAG}`, '--target=production']),
      env: { CI: 'true', [ALLOW_ENV]: '1', [TARGET_ENV]: 'production' },
    }),
    err('CI_REMOTE_REFUSED')
  );
});

test('the local journal must contain exactly 0000-0029 with only 0028/0029 in the tail', () => {
  assert.equal(assertExpectedTail(expectedJournal()).length, 30);
  assert.throws(() => assertExpectedTail(expectedJournal().slice(0, 29)), err('UNEXPECTED_LOCAL_JOURNAL'));
  const wrong = expectedJournal();
  wrong[29] = { ...wrong[29], tag: '0030_not_permitted' };
  assert.throws(() => assertExpectedTail(wrong), err('UNEXPECTED_LOCAL_JOURNAL'));
});

test('preflight accepts only exact 28/30 plus an empty target and no partial 0028/0029 effects', () => {
  assert.equal(assertPreflightState(state()).journal.appliedCount, 28);
  assert.throws(() => assertPreflightState(state('before', { paymob: 1 })), err('PARTIAL_TARGET_SCHEMA'));
  assert.throws(() => assertPreflightState(state('before', { authUsers: 1 })), err('TARGET_NOT_EMPTY'));
  assert.throws(
    () => assertPreflightState(state('before', { rowCounts: { ...state().rowCounts, payments: 1 } })),
    err('TARGET_NOT_EMPTY')
  );
  assert.throws(() => assertPreflightState(state('before', { journal: journalStatus('after') })), err('WRONG_MIGRATION_STATE'));
  assert.throws(() => assertPreflightState(state('before', { rlsDisabled: ['payments'] })), err('RLS_NOT_ENABLED'));
});

test('postflight requires exact 30/30, paymob, all seven columns and all five triggers', () => {
  assert.equal(assertPostflightState(state('after')).journal.appliedCount, 30);
  assert.throws(() => assertPostflightState(state('after', { paymob: 0 })), err('POST_WRITE_VERIFICATION_FAILED'));
  assert.throws(() => assertPostflightState(state('after', { dateColumns: dateColumns.slice(1) })), err('POST_WRITE_VERIFICATION_FAILED'));
  assert.throws(() => assertPostflightState(state('after', { dateTriggers: dateTriggers.slice(1) })), err('POST_WRITE_VERIFICATION_FAILED'));
  const wrongType = dateColumns.map((c, i) => (i === 0 ? { ...c, data_type: 'timestamp without time zone' } : c));
  assert.throws(() => assertPostflightState(state('after', { dateColumns: wrongType })), err('POST_WRITE_VERIFICATION_FAILED'));
});

test('applyTailMigrations sends only the two pinned files, records each, and verifies before and after', async () => {
  const sent = [];
  const client = { query: async (sql, params) => { sent.push({ sql, params }); return { rows: [] }; } };
  const states = [state('before'), state('after')];
  const migrations = [
    { ...expectedJournal()[28], sql: 'select 28;'},
    { ...expectedJournal()[29], sql: 'select 29a;--> statement-breakpoint\nselect 29b;' },
  ];
  const result = await applyTailMigrations(client, {
    expectedJournal: expectedJournal(),
    migrations,
    collectState: async () => states.shift(),
  });
  assert.equal(result.journal.status, 'EXACT');
  assert.deepEqual(sent.map((q) => q.sql), [
    'select 28;',
    'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
    'select 29a;',
    'select 29b;',
    'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
  ]);
  assert.deepEqual(sent.filter((q) => q.params).map((q) => q.params), [
    ['hash-28', expectedJournal()[28].createdAt],
    ['hash-29', expectedJournal()[29].createdAt],
  ]);
  assert.equal(states.length, 0);
});

function fakeDeps(states, calls) {
  const client = {
    query: async (sql) => {
      calls.sql.push(sql);
      return { rows: [] };
    },
  };
  return {
    gitState: () => ({ sha: 'a'.repeat(40), dirty: false, originMainSha: 'a'.repeat(40) }),
    expectedJournal,
    tailMigrations: (journal) => [
      { ...journal[28], sql: 'select 28;' },
      { ...journal[29], sql: 'select 29;' },
    ],
    collectState: async () => states.shift(),
    createDb: (url) => {
      calls.urls.push(url);
      return {
        readOnly: async (fn) => { calls.readOnly++; return fn(client); },
        inTransaction: async (fn) => { calls.transactions++; return fn(client); },
        end: async () => { calls.ended++; },
      };
    },
  };
}

test('full local CLI flow prompts for the URL and exact phrase, applies two migrations, verifies, and leaks no URL', async () => {
  const calls = { urls: [], sql: [], readOnly: 0, transactions: 0, ended: 0 };
  const deps = fakeDeps([state('before'), state('before'), state('after'), state('after')], calls);
  const phrase = `APPLY 0028 AND 0029 local`;
  const io = scriptedIo({ hidden: [LOCAL_DB_URL], visible: [phrase] });
  const result = await runSchemaForwardCli({
    argv: ['--apply', `--${CONFIRM_FLAG}`, '--target=local'],
    env: { [ALLOW_ENV]: '1', [TARGET_ENV]: 'local', SUPABASE_URL: 'http://127.0.0.1:54321' },
    io,
    redactor: makeRedactor(),
    deps,
  });
  assert.deepEqual(result, { status: 'success', migrationsApplied: 2 });
  assert.equal(calls.transactions, 1);
  assert.equal(calls.readOnly, 2);
  assert.equal(calls.ended, 1);
  assert.equal(calls.sql.filter((sql) => sql.startsWith('insert into drizzle.__drizzle_migrations')).length, 2);
  assert.match(io.log.join('\n'), /MIGRATIONS_APPLIED=2 MIGRATION_COUNT=30 JOURNAL=EXACT/);
  assertNoLeaks(io.log, [LOCAL_DB_URL, 'schema-forward-test-pw']);
});

test('a wrong confirmation phrase performs no transaction and still closes the pool', async () => {
  const calls = { urls: [], sql: [], readOnly: 0, transactions: 0, ended: 0 };
  const deps = fakeDeps([state('before')], calls);
  await assert.rejects(
    runSchemaForwardCli({
      argv: ['--apply', `--${CONFIRM_FLAG}`, '--target=local'],
      env: { [ALLOW_ENV]: '1', [TARGET_ENV]: 'local', SUPABASE_URL: 'http://127.0.0.1:54321' },
      io: scriptedIo({ hidden: [LOCAL_DB_URL], visible: ['wrong phrase'] }),
      redactor: makeRedactor(),
      deps,
    }),
    err('NOT_CONFIRMED')
  );
  assert.equal(calls.transactions, 0);
  assert.equal(calls.ended, 1);
});

test('dry-run is connection-free and production requires clean current main before the hidden URL prompt', async () => {
  const io = scriptedIo({ interactive: false });
  const dry = await runSchemaForwardCli({ argv: [], env: {}, io, redactor: makeRedactor(), deps: {} });
  assert.equal(dry.status, 'dry-run');
  assert.deepEqual(io.events, ['print', 'print', 'print']);

  for (const git of [
    { dirty: true, originMainSha: 'b'.repeat(40) },
    { dirty: false, originMainSha: 'c'.repeat(40) },
    { dirty: false, originMainSha: null },
  ]) {
    const prodIo = scriptedIo();
    await assert.rejects(
      runSchemaForwardCli({
        argv: ['--apply', `--${CONFIRM_FLAG}`, '--target=production'],
        env: { [ALLOW_ENV]: '1', [TARGET_ENV]: 'production' },
        io: prodIo,
        redactor: makeRedactor(),
        deps: { gitState: () => ({ sha: 'b'.repeat(40), ...git }) },
      }),
      err('STALE_OR_DIRTY_CHECKOUT')
    );
    assert.ok(!prodIo.events.some((e) => e.startsWith('hidden:')));
  }
});
