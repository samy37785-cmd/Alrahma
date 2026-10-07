import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OTP_EXPIRY_MINUTES,
  classifyInvite,
  collectStateReport,
  compareJournal,
  readExpectedJournal,
  renderReport,
  runStateReportCli,
  selectOnly,
} from '../scripts/ops/lib/supabase-state-report-core.mjs';
import { OperatorError, makeRedactor } from '../scripts/ops/lib/operator-io.mjs';
import { EXPECTED_NEW_TABLES, EXPECTED_NEW_VIEWS } from '../../ops/option-a-rehearsal/scripts/lib/new-schema-fingerprint.mjs';
import { scriptedIo, assertNoLeaks } from './helpers/operator-fakes.js';

// The owner-run, read-only Supabase state report, on in-memory fakes only --
// no network, no Postgres. The same code runs against a real local Supabase
// stack in scripts/ops/operator-tools.real-gotrue.test.mjs.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const MIN = 60 * 1000;

const USER_ID = '71f66e57-aaaa-4bbb-8ccc-0123456789ab';
const SENTINEL_EMAIL = 'sentinel.owner@example.org';
const SENTINEL_HASH = '$2a$10$sentinelsentinelsentinelsentinelsentinelsentinelsentin';
const SENTINEL_TOKEN = 'pkce_sentinel_token_hash_0123456789abcdef';
const SENTINEL_IP = '203.0.113.77';
const LOCAL_DB_URL = 'postgresql://postgres:local-test-pw-not-real@127.0.0.1:5432/postgres';

function err(code) {
  return (e) => {
    assert.ok(e instanceof OperatorError, `expected an OperatorError, got ${e?.name}: ${e?.message}`);
    assert.equal(e.code, code, e.message);
    return true;
  };
}

// ── compareJournal ──────────────────────────────────────────────────────────

const expected = Array.from({ length: 5 }, (_, i) => ({ tag: `000${i}_x`, hash: `h${i}`, createdAt: String(1000 + i) }));
const applied = (n, mutate = (r) => r) => expected.slice(0, n).map((e, i) => mutate({ hash: e.hash, created_at: e.createdAt }, i));

test('compareJournal: exact, incomplete (how far), ahead, diverged (where) and absent are told apart', () => {
  assert.deepEqual(compareJournal(applied(5), expected), { status: 'EXACT', appliedCount: 5, expectedCount: 5, matchingPrefix: 5, firstDivergence: null });
  assert.deepEqual(compareJournal(applied(3), expected), { status: 'INCOMPLETE', appliedCount: 3, expectedCount: 5, matchingPrefix: 3, firstDivergence: null });
  assert.deepEqual(compareJournal([], expected), { status: 'INCOMPLETE', appliedCount: 0, expectedCount: 5, matchingPrefix: 0, firstDivergence: null });
  assert.equal(compareJournal([...applied(5), { hash: 'extra', created_at: '9999' }], expected).status, 'AHEAD');
  const edited = compareJournal(applied(5, (row, i) => (i === 2 ? { ...row, hash: 'edited-after-apply' } : row)), expected);
  assert.equal(edited.status, 'DIVERGED');
  assert.deepEqual(edited.firstDivergence, { position: 2, tag: '0002_x' });
  assert.equal(edited.matchingPrefix, 2);
  const reordered = compareJournal([applied(5)[1], applied(5)[0], ...applied(5).slice(2)], expected);
  assert.equal(reordered.status, 'DIVERGED');
  assert.deepEqual(compareJournal(null, expected), { status: 'ABSENT', appliedCount: 0, expectedCount: 5, matchingPrefix: 0, firstDivergence: null });
});

test("readExpectedJournal: identity is this checkout's own journal -- every entry's sql hash and `when`", () => {
  const journal = readExpectedJournal(REPO_ROOT);
  assert.ok(journal.length >= 30, `only ${journal.length} journal entries`);
  assert.equal(journal[0].tag.slice(0, 4), '0000');
  for (const entry of journal) {
    assert.match(entry.hash, /^[0-9a-f]{64}$/);
    assert.match(entry.createdAt, /^\d{13}$/);
  }
});

// ── classifyInvite ──────────────────────────────────────────────────────────

const sentAt = (minutesAgo) => new Date(NOW - minutesAgo * MIN).toISOString();
const account = (over = {}) => ({
  createdAt: sentAt(300), invitedAt: sentAt(300), confirmationSentAt: sentAt(300), emailConfirmedAt: null, lastSignInAt: null,
  hasPassword: false, pendingConfirmationTokens: 1, legacyConfirmationToken: false, banned: false, ...over,
});

test('classifyInvite: unused invite (token pending), expired by age, never judged for a used one', () => {
  const fresh = classifyInvite(account({ confirmationSentAt: sentAt(10) }), NOW);
  assert.deepEqual(fresh, { state: 'INVITE_PENDING_NOT_USED', consumed: false, ageMinutes: 10, likelyExpired: false });
  const old = classifyInvite(account({ confirmationSentAt: sentAt(DEFAULT_OTP_EXPIRY_MINUTES + 1) }), NOW);
  assert.equal(old.state, 'INVITE_PENDING_NOT_USED');
  assert.equal(old.likelyExpired, true);
  assert.equal(classifyInvite(account({ confirmationSentAt: sentAt(DEFAULT_OTP_EXPIRY_MINUTES) }), NOW).likelyExpired, false);
  // A legacy token column counts as pending when the token table has no row.
  assert.equal(classifyInvite(account({ pendingConfirmationTokens: 0, legacyConfirmationToken: true }), NOW).state, 'INVITE_PENDING_NOT_USED');
  assert.equal(classifyInvite(account({ pendingConfirmationTokens: 0 }), NOW).state, 'INVITE_NOT_USED_NO_TOKEN_ROW');
  // Falls back to invited_at / created_at when the sent time is missing.
  assert.equal(classifyInvite(account({ confirmationSentAt: null, invitedAt: sentAt(7) }), NOW).ageMinutes, 7);
});

test('classifyInvite: a used invite is consumed, with or without a password, and never "expired"', () => {
  const consumed = classifyInvite(account({ emailConfirmedAt: sentAt(200), lastSignInAt: sentAt(200), pendingConfirmationTokens: 0, hasPassword: false }), NOW);
  assert.deepEqual([consumed.state, consumed.consumed, consumed.likelyExpired], ['INVITE_CONSUMED_NO_PASSWORD', true, null]);
  assert.equal(classifyInvite(account({ emailConfirmedAt: sentAt(5), lastSignInAt: sentAt(5), hasPassword: true }), NOW).state, 'INVITE_CONSUMED_PASSWORD_SET');
  assert.equal(classifyInvite(account({ emailConfirmedAt: sentAt(5) }), NOW).state, 'CONFIRMED_NEVER_SIGNED_IN');
  assert.equal(classifyInvite(account({ lastSignInAt: sentAt(5) }), NOW).state, 'SIGNED_IN_NOT_CONFIRMED');
  assert.deepEqual(classifyInvite(null, NOW), { state: 'NO_ACCOUNT', consumed: null, ageMinutes: null, likelyExpired: null });
});

// ── The read, on a fake Postgres ────────────────────────────────────────────

function makeFakeClient({ journal = 'absent', tables = EXPECTED_NEW_TABLES, views = EXPECTED_NEW_VIEWS, rlsOff = [], rowsIn = {}, users = [], tokens = [], audit = [], roleRows = 0, adminProfiles = 0 } = {}) {
  const sent = [];
  const client = {
    sent,
    async query(sql, params = []) {
      sent.push(sql);
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('select to_regclass($1)')) {
        if (params[0] === 'drizzle.__drizzle_migrations') return { rows: [{ present: journal !== 'absent' }] };
        return { rows: [{ present: true }] };
      }
      if (s.startsWith('select hash, created_at::text as created_at from drizzle.__drizzle_migrations')) return { rows: journal };
      if (s.includes('from pg_class c')) {
        return {
          rows: [
            ...tables.map((name) => ({ name, kind: 'r', rls: !rlsOff.includes(name) })),
            ...views.map((name) => ({ name, kind: 'v', rls: false })),
          ],
        };
      }
      if (s.includes('from information_schema.columns')) return { rows: [{ n: 1 }] };
      if (s.includes('from pg_enum')) return { rows: [{ n: 1 }] };
      let m = /^select count\(\*\)::int as n from public\."([a-z_]+)"$/.exec(s);
      if (m) return { rows: [{ n: rowsIn[m[1]] ?? 0 }] };
      if (s === 'select count(*)::int as n from auth.users') return { rows: [{ n: users.length }] };
      if (s.includes('from auth.users u order by')) return { rows: users.map((u) => ({ ...u, email: SENTINEL_EMAIL, encrypted_password: SENTINEL_HASH })) };
      if (s.startsWith('select count(*)::int as n from auth.identities')) return { rows: [{ n: 1 }] };
      if (s.includes('from auth.mfa_factors')) return { rows: [] };
      if (s.startsWith('select count(*)::int as n from auth.sessions')) return { rows: [{ n: 0 }] };
      if (s.includes('from auth.one_time_tokens')) return { rows: tokens.map((t) => ({ ...t, token_hash: SENTINEL_TOKEN })) };
      if (s.includes('from auth.audit_log_entries')) return { rows: audit.map((a) => ({ ...a, ip_address: SENTINEL_IP })) };
      if (s.includes('from public.profiles where id = $1')) return { rows: users.length ? [{ role: 'admin' }] : [] };
      if (s.includes('from public.admin_role_assignments where user_id = $1')) return { rows: roleRows ? [{ role: 'super-admin' }] : [] };
      if (s === 'select count(*)::int as n from public.admin_role_assignments') return { rows: [{ n: roleRows }] };
      if (s.startsWith("select count(*)::int as n from public.profiles where role = 'admin'")) return { rows: [{ n: adminProfiles }] };
      throw new Error(`fake client: unhandled statement: ${s.slice(0, 120)}`);
    },
  };
  return client;
}

const invitedUser = (over = {}) => ({
  id: USER_ID, created_at: sentAt(180), invited_at: sentAt(180), confirmation_sent_at: sentAt(180), email_confirmed_at: null, last_sign_in_at: null,
  updated_at: sentAt(180), banned: false, is_anonymous: 'false', has_password: false, provider: 'email', legacy_confirmation_token: false, ...over,
});
const expectedJournal = Array.from({ length: 30 }, (_, i) => ({ tag: `${String(i).padStart(4, '0')}_m`, hash: `hash${i}`, createdAt: String(2000 + i) }));

test('collectStateReport: sends only SELECT/SHOW, never selects an email, hash, token or ip, and refuses a write', async () => {
  const client = makeFakeClient({ users: [invitedUser()], tokens: [{ type: 'confirmation_token', n: 1, oldest: sentAt(180) }], audit: [{ action: 'user_invited', at: sentAt(180) }], roleRows: 1, adminProfiles: 1 });
  await collectStateReport(client, { expectedJournal, now: NOW });
  assert.ok(client.sent.length > 15);
  for (const sql of client.sent) {
    assert.match(sql, /^\s*(select|show)\b/i, `not a read: ${sql.slice(0, 60)}`);
    assert.doesNotMatch(sql, /\bemail\b/i, 'no query may read an email');
    assert.doesNotMatch(sql, /token_hash|ip_address|raw_user_meta_data|phone|\bidentity_data\b/i);
    assert.doesNotMatch(sql, /\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i);
  }
  const guarded = selectOnly({ query: async () => assert.fail('a write must never reach the client') });
  for (const sql of [
    'update public.profiles set role = 1',
    'insert into x values (1)',
    'delete from x',
    'drop table x',
    'begin',
    'with erased as (delete from public.profiles returning *) select 1',
  ]) {
    assert.throws(() => guarded.query(sql), err('NOT_READ_ONLY'));
  }
});

test('collectStateReport: an unused invite -> pending token, not confirmed, no sign-in, one super-admin row; nothing else listed', async () => {
  const client = makeFakeClient({
    users: [invitedUser()],
    tokens: [{ type: 'confirmation_token', n: 1, oldest: sentAt(180) }],
    audit: [{ action: 'user_invited', at: sentAt(180) }],
    rowsIn: { profiles: 1, admin_role_assignments: 1 },
    roleRows: 1,
    adminProfiles: 1,
  });
  const report = await collectStateReport(client, { expectedJournal, now: NOW });
  assert.equal(report.journal.status, 'ABSENT');
  assert.deepEqual(report.rows, { profiles: 1, admin_role_assignments: 1 });
  assert.equal(report.auth.userCount, 1);
  const [a] = report.auth.accounts;
  assert.equal(a.idPrefix, '71f66e57');
  assert.equal(a.pendingConfirmationTokens, 1);
  assert.deepEqual(report.invite[0], { state: 'INVITE_PENDING_NOT_USED', consumed: false, ageMinutes: 180, likelyExpired: true });
  assert.deepEqual(report.admin, { roleRows: 1, adminProfiles: 1 });
  assert.deepEqual(report.schema.tablesMissing, []);
  assert.deepEqual(report.schema.tablesUnexpected, []);
});

test('collectStateReport: a legacy / partial schema is named, with missing tables, RLS-off tables and journal state', async () => {
  const legacyTables = ['profiles', 'enrollments', 'old_legacy_table'];
  const client = makeFakeClient({ tables: legacyTables, views: [], rlsOff: ['old_legacy_table'], journal: expectedJournal.slice(0, 22).map((e) => ({ hash: e.hash, created_at: e.createdAt })) });
  const report = await collectStateReport(client, { expectedJournal, now: NOW });
  assert.deepEqual([report.journal.status, report.journal.appliedCount, report.journal.matchingPrefix], ['INCOMPLETE', 22, 22]);
  assert.ok(report.schema.tablesMissing.includes('admin_role_assignments'));
  assert.deepEqual(report.schema.tablesUnexpected, ['old_legacy_table']);
  assert.deepEqual(report.schema.viewsMissing, EXPECTED_NEW_VIEWS);
  assert.deepEqual(report.schema.rlsDisabled, ['old_legacy_table']);
  assert.equal(report.probes['0013_admin_rbac'], false);
  assert.equal(report.probes['0022_migration_ledger'], false);
});

test('collectStateReport: more than 5 accounts are counted, never listed', async () => {
  const many = Array.from({ length: 6 }, (_, i) => invitedUser({ id: `0000000${i}-aaaa-4bbb-8ccc-0123456789ab` }));
  const report = await collectStateReport(makeFakeClient({ users: many }), { expectedJournal, now: NOW });
  assert.deepEqual([report.auth.userCount, report.auth.listed, report.auth.accounts.length], [6, false, 0]);
  assert.ok(renderReport(report, { target: 'production', projectRef: 'ref', git: {} }).some((l) => l.startsWith('AUTH_USERS=6 (more than 5')));
});

test('renderReport: key=value lines carry the owner-facing answers and no email, hash, token, ip or full id', async () => {
  const client = makeFakeClient({
    users: [invitedUser()],
    tokens: [{ type: 'confirmation_token', n: 1, oldest: sentAt(180) }],
    audit: [{ action: 'user_invited', at: sentAt(180) }],
    roleRows: 1,
    adminProfiles: 1,
  });
  const report = await collectStateReport(client, { expectedJournal, now: NOW });
  const lines = renderReport(report, { target: 'production', projectRef: 'difzynyphojgisrfvrkd', git: { sha: 'a'.repeat(40), dirty: false, behindMain: 6 } });
  const text = lines.join('\n');
  for (const expectedLine of [
    'MIGRATION_JOURNAL=ABSENT', 'MIGRATION_COUNT=0', 'EXPECTED_MIGRATION_COUNT=30', 'AUTH_USERS=1', 'id_prefix=71f66e57', 'EMAIL_CONFIRMED=NO',
    'LAST_SIGN_IN_PRESENT=NO', 'INVITE_STATE=INVITE_PENDING_NOT_USED', 'INVITE_CONSUMED=false', 'INVITE_LIKELY_EXPIRED=true', 'SUPER_ADMIN_ASSIGNMENT_COUNT=1',
    'GIT_BEHIND_ORIGIN_MAIN=6', 'confirmation_token:1', 'user_invited(',
  ]) {
    assert.ok(text.includes(expectedLine), `report lacks ${expectedLine}`);
  }
  assert.ok(text.includes(`default ${DEFAULT_OTP_EXPIRY_MINUTES} min`), 'expiry is flagged as judged against the default');
  const checked = assertNoLeaks(lines, [SENTINEL_EMAIL, SENTINEL_HASH, SENTINEL_TOKEN, SENTINEL_IP, USER_ID, USER_ID.replaceAll('-', '')], 'report');
  assert.equal(checked, 6);
  assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(text), 'no email-shaped text');
});

// ── The CLI run ─────────────────────────────────────────────────────────────

function cliDeps(client, over = {}) {
  const calls = { createDb: 0, ended: 0, urls: [] };
  const deps = {
    gitState: () => ({ sha: 'b'.repeat(40), dirty: false, behindMain: 0 }),
    expectedJournal: () => expectedJournal,
    now: () => NOW,
    createDb: (url) => {
      calls.createDb++;
      calls.urls.push(url);
      return {
        readOnly: (fn) => fn(client),
        end: async () => {
          calls.ended++;
        },
      };
    },
    ...over,
  };
  return { deps, calls };
}

const LOCAL_ENV = { SUPABASE_URL: 'http://127.0.0.1:54321' };
const run = ({ argv, env = LOCAL_ENV, io, deps }) => {
  const redactor = makeRedactor();
  return runStateReportCli({ argv, env, io, redactor, deps });
};

test('cli: --target is required and a secret-looking flag is refused without echoing its value', async () => {
  const { deps, calls } = cliDeps(makeFakeClient());
  await assert.rejects(run({ argv: [], io: scriptedIo(), deps }), err('BAD_ARGS'));
  await assert.rejects(run({ argv: ['--target=staging'], io: scriptedIo(), deps }), err('BAD_TARGET'));
  const secretFlag = '--db-url=postgresql://postgres:flag-secret-pw@db.example.test/postgres';
  await assert.rejects(run({ argv: ['--target=local', secretFlag], io: scriptedIo(), deps }), (e) => {
    assert.equal(e.code, 'BAD_ARGS');
    assert.doesNotMatch(e.message, /flag-secret-pw/);
    return true;
  });
  assert.equal(calls.createDb, 0);
});

test('cli: production under CI, without a terminal, or with a DB URL of another project stops before any connection', async () => {
  const { deps, calls } = cliDeps(makeFakeClient());
  await assert.rejects(run({ argv: ['--target=production'], env: { CI: 'true' }, io: scriptedIo(), deps }), err('CI_REMOTE_REFUSED'));
  const noTty = scriptedIo({ interactive: false });
  await assert.rejects(run({ argv: ['--target=production'], io: noTty, deps }), err('NOT_INTERACTIVE'));
  assert.deepEqual(noTty.events, ['print'], 'no prompt was reached');
  const other = ['postgresql://postgres:', 'wrong-project-pw', '@db.otherprojectref.supabase.co:5432/postgres'].join('');
  await assert.rejects(run({ argv: ['--target=production'], env: {}, io: scriptedIo({ hidden: [other] }), deps }), err('TARGET_MISMATCH'));
  const override = ['postgresql://postgres:', 'override-pw', '@db.difzynyphojgisrfvrkd.supabase.co:5432/postgres?host=203.0.113.9'].join('');
  await assert.rejects(run({ argv: ['--target=production'], env: {}, io: scriptedIo({ hidden: [override] }), deps }), err('TARGET_MISMATCH'));
  assert.equal(calls.createDb, 0);
});

test('cli: a good run reads the DB URL hidden, prints the report, ends the connection, and leaks neither the URL nor any sentinel', async () => {
  const client = makeFakeClient({
    users: [invitedUser()],
    tokens: [{ type: 'confirmation_token', n: 1, oldest: sentAt(180) }],
    audit: [{ action: 'user_invited', at: sentAt(180) }],
    roleRows: 1,
    adminProfiles: 1,
  });
  const { deps, calls } = cliDeps(client, { gitState: () => ({ sha: 'c'.repeat(40), dirty: true, behindMain: 6 }) });
  const io = scriptedIo({ hidden: [LOCAL_DB_URL] });
  const result = await run({ argv: ['--target=local'], io, deps });
  assert.equal(result.status, 'ok');
  assert.deepEqual(calls.urls, [LOCAL_DB_URL]);
  assert.equal(calls.ended, 1);
  assert.deepEqual(io.events.filter((e) => e.startsWith('hidden')), ['hidden:Database URL (hidden): ']);
  assert.deepEqual(io.remaining(), { hidden: 0, visible: 0 });
  const text = io.log.join('\n');
  assert.ok(text.includes('WARNING this checkout is 6 commit(s) behind origin/main'));
  assert.ok(text.includes('WARNING this checkout has uncommitted changes'));
  assert.ok(text.includes('INVITE_STATE=INVITE_PENDING_NOT_USED'));
  const checked = assertNoLeaks(io.log, [LOCAL_DB_URL, 'local-test-pw-not-real', SENTINEL_EMAIL, SENTINEL_HASH, SENTINEL_TOKEN, SENTINEL_IP, USER_ID], 'cli output');
  assert.equal(checked, 7);
});

test('cli: the connection is ended even when the read fails, and the failure is not swallowed', async () => {
  const boom = { query: async () => { throw new Error('connection reset'); } };
  const { deps, calls } = cliDeps(boom);
  await assert.rejects(run({ argv: ['--target=local'], io: scriptedIo({ hidden: [LOCAL_DB_URL] }), deps }), /connection reset/);
  assert.equal(calls.ended, 1);
});
