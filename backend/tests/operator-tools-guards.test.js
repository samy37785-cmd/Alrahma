import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLI_SPEC as BOOTSTRAP_SPEC } from '../scripts/ops/lib/supabase-first-super-admin-bootstrap-core.mjs';
import { CLI_SPEC as OWNER_SPEC } from '../scripts/ops/lib/supabase-owner-bootstrap-core.mjs';
import { CLI_SPEC as SCHEMA_FORWARD_SPEC } from '../scripts/ops/lib/supabase-schema-forward-0028-0029-core.mjs';
import { CLI_SPEC as RECOVERY_SPEC } from '../scripts/ops/lib/supabase-recover-first-super-admin-core.mjs';
import {
  assertApiKey,
  assertPrivateOutPath,
  makeRedactor,
  redactOperatorText,
} from '../scripts/ops/lib/operator-io.mjs';
import { assertNoLeaks, fakeJwtKey } from './helpers/operator-fakes.js';

// SECURE_SUPER_ADMIN_OPERATOR_TOOL, structural guards for the three
// owner-run tools: the real CLIs, spawned without a terminal, and their
// source. No network: every spawned run below stops at a gate before any
// client is created (and the targets are local or refused).

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOTSTRAP = path.join(BACKEND, 'scripts/ops/supabase-first-super-admin-bootstrap.mjs');
const OWNER = path.join(BACKEND, 'scripts/ops/supabase-owner-bootstrap.mjs');
const COLLECTOR = path.join(BACKEND, 'scripts/migration/bootstrap-manifest.mjs');
const SCHEMA_FORWARD = path.join(BACKEND, 'scripts/ops/supabase-schema-forward-0028-0029.mjs');
const RECOVERY = path.join(BACKEND, 'scripts/ops/supabase-recover-first-super-admin.mjs');

const LEAK_EMAIL = 'leak.check.owner@example.org';
const FAKE_SECRETS = {
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_fake_guard_value_0003',
  SUPABASE_ANON_KEY: 'sb_publishable_test_fake_guard_value_0004',
  SUPABASE_DB_URL: 'postgresql://postgres:guard-test-pw-not-real@127.0.0.1:1/postgres',
};

function spawnTool(file, args, env, input = `${LEAK_EMAIL}\nsome-password-typed-blind\n`) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(SUPABASE_|MIGRATION_|ALLOW_SUPABASE_|CI$)/.test(k)));
  const r = spawnSync(process.execPath, [file, ...args], { cwd: BACKEND, env: { ...clean, ...env }, input, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

const LEAKS = [LEAK_EMAIL, 'some-password-typed-blind', ...Object.values(FAKE_SECRETS), 'guard-test-pw-not-real'];

test('no tool has a flag that can carry a secret', () => {
  const collectorFlags = ['out', 'candidate', 'backup-manifest', 'scope', 'valid-hours'];
  for (const flag of [...Object.keys(BOOTSTRAP_SPEC.flags), ...Object.keys(OWNER_SPEC.flags), ...Object.keys(SCHEMA_FORWARD_SPEC.flags), ...Object.keys(RECOVERY_SPEC.flags), ...collectorFlags]) {
    assert.ok(!/email|password|token|secret|key|url|link|code/.test(flag), `--${flag}`);
  }
});

test('schema-forward CLI: dry-run is connection-free; no terminal and production CI stop before input', () => {
  let r = spawnTool(SCHEMA_FORWARD, [], {});
  assert.equal(r.code, 0);
  assert.match(r.out, /dry-run only -- no input was read, no connection was made, nothing was written/);

  const allowed = {
    ALLOW_SUPABASE_SCHEMA_FORWARD_0028_0029: '1',
    SUPABASE_SCHEMA_TARGET_ENV: 'local',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    ...FAKE_SECRETS,
  };
  r = spawnTool(SCHEMA_FORWARD, ['--apply', '--confirm-0028-0029', '--target=local'], allowed);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOPPED NOT_INTERACTIVE/);

  r = spawnTool(
    SCHEMA_FORWARD,
    ['--apply', '--confirm-0028-0029', '--target=production'],
    { ...allowed, CI: 'true', SUPABASE_SCHEMA_TARGET_ENV: 'production' }
  );
  assert.equal(r.code, 1);
  assert.match(r.out, /STOPPED CI_REMOTE_REFUSED/);
  assertNoLeaks([r.out], LEAKS);
});

test('recovery CLI: dry-run is connection-free; every gate stops before any input or connection', () => {
  let r = spawnTool(RECOVERY, [], {});
  assert.equal(r.code, 0);
  assert.match(r.out, /dry-run only -- no input was read, no connection was made, nothing was written/);

  const apply = ['--apply', '--confirm-recover-super-admin-account', '--target=local', '--expect-id-prefix=7e6700bd'];
  const allowed = { ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY: '1', SUPABASE_RECOVERY_TARGET_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321', ...FAKE_SECRETS };

  r = spawnTool(RECOVERY, apply, { ...allowed, ALLOW_SUPABASE_SUPER_ADMIN_RECOVERY: '' });
  assert.equal(r.code, 1);
  assert.match(r.out, /STOPPED NOT_AUTHORIZED/);

  r = spawnTool(RECOVERY, apply, allowed);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOPPED NOT_INTERACTIVE/);
  assert.ok(!/\(hidden\)/.test(r.out), 'no prompt was shown');

  r = spawnTool(RECOVERY, ['--apply', '--confirm-recover-super-admin-account', '--target=production', '--expect-id-prefix=7e6700bd'], { ...allowed, CI: 'true', SUPABASE_RECOVERY_TARGET_ENV: 'production' });
  assert.equal(r.code, 1);
  assert.match(r.out, /STOPPED CI_REMOTE_REFUSED/);

  r = spawnTool(RECOVERY, apply.filter((a) => !a.startsWith('--expect-id-prefix')), allowed);
  assert.match(r.out, /STOPPED BAD_ARGS: .*--expect-id-prefix/);

  for (const flag of ['--email=leak.check.owner@example.org', '--password=some-password-typed-blind', '--user-id=7e6700bd-1111-4222-8333-444444444444']) {
    r = spawnTool(RECOVERY, [...apply, flag], allowed);
    assert.equal(r.code, 1);
    assert.match(r.out, new RegExp(`STOPPED BAD_ARGS: unknown flag "${flag.split('=')[0]}"`));
    assertNoLeaks([r.out], [...LEAKS, '7e6700bd-1111-4222-8333-444444444444']);
  }
});

test('bootstrap CLI: --email is refused by name, its value never printed', () => {
  const r = spawnTool(BOOTSTRAP, ['--apply', '--confirm-create-first-super-admin', '--target=local', `--email=${LEAK_EMAIL}`], {});
  assert.equal(r.code, 1);
  assert.match(r.out, /STOPPED BAD_ARGS: unknown flag "--email"/);
  assertNoLeaks([r.out], LEAKS);
});

test('bootstrap CLI: without a terminal, apply stops before reading any input (piped input is ignored)', () => {
  const env = { ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: '1', SUPABASE_BOOTSTRAP_TARGET_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:1', ...FAKE_SECRETS };
  const r = spawnTool(BOOTSTRAP, ['--apply', '--confirm-create-first-super-admin', '--target=local'], env);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOPPED NOT_INTERACTIVE/);
  assert.ok(!/email \(hidden\)/.test(r.out), 'no prompt was shown');
  assertNoLeaks([r.out], LEAKS);
});

test('bootstrap CLI: production under CI is refused at the gate', () => {
  const env = { CI: 'true', ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP: '1', SUPABASE_BOOTSTRAP_TARGET_ENV: 'production', ...FAKE_SECRETS };
  const r = spawnTool(BOOTSTRAP, ['--apply', '--confirm-create-first-super-admin', '--target=production', '--backup-manifest=none.json'], env);
  assert.equal(r.code, 1);
  assert.match(r.out, /STOPPED CI_REMOTE_REFUSED/);
  assertNoLeaks([r.out], LEAKS);
});

test('bootstrap CLI: the bare dry-run reads and connects nothing', () => {
  const r = spawnTool(BOOTSTRAP, [], {});
  assert.equal(r.code, 0);
  assert.match(r.out, /dry-run only -- no input was read, no connection was made/);
});

test('owner CLI: production under CI refused; without a terminal refused; --password refused by name', () => {
  let r = spawnTool(OWNER, ['run', '--target=production', '--expect-user-id=0a0a0a0a-1111-4222-8333-444444444444', '--confirm-create-canonical-plans'], { CI: 'true', SUPABASE_BOOTSTRAP_TARGET_ENV: 'production', ...FAKE_SECRETS });
  assert.match(r.out, /STOPPED CI_REMOTE_REFUSED/);
  r = spawnTool(OWNER, ['accept-invite', '--target=local', '--expect-user-id=0a0a0a0a-1111-4222-8333-444444444444'], { SUPABASE_BOOTSTRAP_TARGET_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:1', ...FAKE_SECRETS });
  assert.match(r.out, /STOPPED NOT_INTERACTIVE/);
  r = spawnTool(OWNER, ['run', '--password=some-password-typed-blind'], {});
  assert.match(r.out, /STOPPED BAD_ARGS: unknown flag "--password"/);
  assertNoLeaks([r.out], LEAKS);
});

test('collector CLI: --out inside a repository is refused; no MIGRATION_DB_URL without a terminal is refused; remote under CI is refused', () => {
  let r = spawnTool(COLLECTOR, ['collect', `--out=${path.join(BACKEND, 'candidate-guard-test.json')}`], { MIGRATION_DB_URL: FAKE_SECRETS.SUPABASE_DB_URL });
  assert.match(r.out, /OUT_INSIDE_REPOSITORY/);
  assert.ok(!fs.existsSync(path.join(BACKEND, 'candidate-guard-test.json')));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-guard-'));
  try {
    r = spawnTool(COLLECTOR, ['collect', `--out=${path.join(dir, 'candidate.json')}`], {});
    assert.match(r.out, /MIGRATION_DB_URL is not set, and there is no interactive terminal/);
    // Built at runtime: a remote URL with a password, never a literal in this file.
    const remote = `postgresql://postgres:${'guard-remote-pw-not-real'}@db.difzynyphojgisrfvrkd.${'supa' + 'base'}.co:5432/postgres`;
    r = spawnTool(COLLECTOR, ['collect', `--out=${path.join(dir, 'candidate.json')}`], { CI: 'true', MIGRATION_DB_URL: remote });
    assert.match(r.out, /refusing a non-local MIGRATION_DB_URL under CI/);
    assertNoLeaks([r.out], [...LEAKS, remote, 'guard-remote-pw-not-real']);
    assert.ok(!fs.existsSync(path.join(dir, 'candidate.json')), 'nothing was written');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('assertPrivateOutPath: inside a repository, a missing folder, or an existing file are refused', () => {
  assert.throws(() => assertPrivateOutPath(path.join(BACKEND, 'x.json')), (e) => e.code === 'OUT_INSIDE_REPOSITORY');
  assert.throws(() => assertPrivateOutPath(path.join(os.tmpdir(), 'no-such-folder-guard', 'x.json')), (e) => e.code === 'BAD_OUT_PATH');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-guard-'));
  try {
    fs.writeFileSync(path.join(dir, 'exists.json'), '{}');
    assert.throws(() => assertPrivateOutPath(path.join(dir, 'exists.json')), (e) => e.code === 'BAD_OUT_PATH');
    assert.equal(assertPrivateOutPath(path.join(dir, 'new.json')), path.join(dir, 'new.json'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the redactor removes every registered value and every secret shape', () => {
  const redactor = makeRedactor();
  const jwt = fakeJwtKey({ role: 'service_role', ref: 'abc' });
  redactor.add('My-Hidden-Password-123', 'owner@private.example');
  const pgUrl = `postgresql://u:${'p'}@db.x.${'supa' + 'base'}.co/postgres`;
  const text = redactor.text(
    `pw My-Hidden-Password-123 / ${encodeURIComponent('owner@private.example')} / other@example.org / ${jwt} / ${pgUrl} / ` +
    'https://x.supabase.co/auth/v1/verify?token=abc / otpauth://totp/x?secret=ABC / sb_secret_abc'
  );
  for (const leak of ['My-Hidden-Password-123', 'owner%40private', 'other@example.org', jwt, 'u:p@', 'token=abc', 'secret=ABC', 'sb_secret_abc']) {
    assert.ok(!text.includes(leak), `${leak} survived: ${text}`);
  }
  assert.equal(redactOperatorText('plain status line'), 'plain status line');
});

test('API keys: the owner tool refuses a service key (legacy JWT or sb_secret_) and a key for another project', () => {
  assert.throws(() => assertApiKey(fakeJwtKey({ role: 'service_role', ref: 'difzynyphojgisrfvrkd' }), { expected: 'public', projectRef: 'difzynyphojgisrfvrkd' }), (e) => e.code === 'WRONG_KEY');
  assert.throws(() => assertApiKey('sb_secret_x_fake', { expected: 'public', projectRef: 'local' }), (e) => e.code === 'WRONG_KEY');
  assert.throws(() => assertApiKey(fakeJwtKey({ role: 'anon', ref: 'someotherref' }), { expected: 'public', projectRef: 'difzynyphojgisrfvrkd' }), (e) => e.code === 'TARGET_MISMATCH');
  assert.doesNotThrow(() => assertApiKey(fakeJwtKey({ role: 'anon', ref: 'difzynyphojgisrfvrkd' }), { expected: 'public', projectRef: 'difzynyphojgisrfvrkd' }));
  assert.doesNotThrow(() => assertApiKey('sb_publishable_x_fake', { expected: 'public', projectRef: 'local' }));
});

// ── Source scan (comments stripped) ────────────────────────────────────────

function code(rel) {
  return fs.readFileSync(path.join(BACKEND, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
}

const OWNER_FILES = ['scripts/ops/supabase-owner-bootstrap.mjs', 'scripts/ops/lib/supabase-owner-bootstrap-core.mjs'];
const BOOTSTRAP_FILES = ['scripts/ops/supabase-first-super-admin-bootstrap.mjs', 'scripts/ops/lib/supabase-first-super-admin-bootstrap-core.mjs'];
const SHARED_FILES = ['scripts/ops/lib/operator-io.mjs'];
const SCHEMA_FORWARD_FILES = [
  'scripts/ops/supabase-schema-forward-0028-0029.mjs',
  'scripts/ops/lib/supabase-schema-forward-0028-0029-core.mjs',
];

test('no tool sends a password reset, generates a link, creates a user directly, or touches DATA_BACKEND/Render', () => {
  for (const file of [...OWNER_FILES, ...BOOTSTRAP_FILES, ...SHARED_FILES, ...SCHEMA_FORWARD_FILES, 'scripts/migration/bootstrap-manifest.mjs']) {
    const src = code(file);
    for (const [re, what] of [
      [/resetPasswordForEmail|recover\b|type:\s*'recovery'/, 'a password reset'],
      [/generateLink/, 'a generated auth link'],
      [/createUser\s*\(|signUp\s*\(|updateUserById/, 'a direct user creation or admin update'],
      [/DATA_BACKEND|RENDER_|render\.com/i, 'DATA_BACKEND or Render'],
      [/dotenv/, 'a .env file read'],
    ]) assert.ok(!re.test(src), `${file}: contains ${what}`);
  }
});

test('schema-forward source is pinned to 0028/0029 and has no auth, plan, application-row, or deployment path', () => {
  const src = SCHEMA_FORWARD_FILES.map(code).join('\n');
  assert.match(src, /0028_payment_gateway_paymob/);
  assert.match(src, /0029_preserve_source_dates/);
  assert.match(src, /migrations\.length !== 2/);
  for (const [re, what] of [
    [/auth\.admin|createClient|SUPABASE_SERVICE_ROLE_KEY/, 'Supabase Auth Admin path'],
    [/create_plan_version|insert into public\.(profiles|plans|payments|subscriptions)/i, 'application-row write'],
    [/DATA_BACKEND|RENDER_|render\.com/i, 'DATA_BACKEND or Render path'],
    [/dotenv/, '.env reader'],
  ]) assert.ok(!re.test(src), `schema-forward contains ${what}`);
});

test('the owner tool uses no service-role path at all, and only the official plan RPC', () => {
  for (const file of OWNER_FILES) {
    const src = code(file);
    assert.ok(!/auth\.admin|SERVICE_ROLE|service_role|inviteUserByEmail/.test(src), `${file}: a service-role path`);
    assert.ok(!/from\(['"]plans['"]\)\s*\.(insert|update|upsert|delete)/.test(src), `${file}: a direct plans write`);
  }
  assert.match(code(OWNER_FILES[1]), /rpc\('create_plan_version', params\)/);
});

const RECOVERY_FILES = ['scripts/ops/supabase-recover-first-super-admin.mjs', 'scripts/ops/lib/supabase-recover-first-super-admin-core.mjs'];

test('recovery source: its only write is ONE Auth Admin updateUserById with exactly { password, email_confirm: true }', () => {
  const src = RECOVERY_FILES.map(code).join('\n');
  const calls = src.match(/updateUserById\s*\(/g) ?? [];
  assert.equal(calls.length, 1, 'exactly one Auth Admin write call exists');
  assert.match(src, /client\.auth\.admin\.updateUserById\(userId, \{ password, email_confirm: true \}\)/);
  for (const [re, what] of [
    [/inviteUserByEmail|generateLink|resetPasswordForEmail|type:\s*'recovery'|signInWith|signUp\s*\(|createUser\s*\(|deleteUser|listUsers|\.mfa\.|verifyOtp|signOut/, 'an email/token/user/session/MFA Auth path'],
    [/create_plan_version|\.rpc\(/, 'a plan or RPC path'],
    [/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|alter\s+table|drop\s+\w+|create\s+(table|function|policy)|grant\s+)/i, 'a SQL write or DDL statement'],
    [/inTransaction|set\s+local\s+role/i, 'a read-write transaction'],
    [/DATA_BACKEND|RENDER_|render\.com/i, 'DATA_BACKEND or Render'],
    [/dotenv|\.env['"`]/, 'a .env read'],
    [/writeFile|appendFile|createWriteStream|fs\.write/, 'a file write'],
  ]) assert.ok(!re.test(src), `recovery files contain ${what}`);
});

test('recovery source: every SQL statement it sends is a SELECT, and it runs only in the read-only transaction', () => {
  const core = code(RECOVERY_FILES[1]);
  const sql = [...core.matchAll(/(?:client\.query|\bn)\(\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")/g)].map((m) => (m[1] ?? m[2] ?? m[3]).trim());
  assert.ok(sql.length >= 10, `found ${sql.length} statements`);
  for (const s of sql) assert.match(s, /^select\b/i, s);
  assert.match(code(RECOVERY_FILES[0]), /createDb: createReadOnlyDb/, 'the CLI wires the BEGIN READ ONLY runner');
});

test('recovery source: no email address is read, selected or asked for; the password hash is only tested for non-empty', () => {
  const src = RECOVERY_FILES.map(code).join('\n');
  assert.ok(!/select[^`'"]*\bemail\b(?!_confirmed)/i.test(src), 'no select of an email column');
  assert.ok(!/promptHidden\([^)]*[Ee]mail/.test(src), 'no email prompt');
  const withoutHashTest = src.replace(/coalesce\(to_jsonb\(u\)->>'encrypted_password', ''\) <> ''/g, '');
  assert.ok(!/encrypted_password/.test(withoutHashTest), 'the password hash is only ever compared with the empty string');
});

test('the bootstrap creates no plan and no MFA factor; neither tool writes any file', () => {
  for (const file of BOOTSTRAP_FILES) assert.ok(!/create_plan_version|mfa\./.test(code(file)), `${file}`);
  for (const file of [...OWNER_FILES, ...BOOTSTRAP_FILES, ...SHARED_FILES]) {
    assert.ok(!/writeFile|appendFile|createWriteStream|fs\.write/.test(code(file)), `${file}: writes a file`);
  }
});
