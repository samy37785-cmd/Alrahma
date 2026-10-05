#!/usr/bin/env node
// Owner decision NO_MIGRATION_SERVICE_IDENTITY, guarded structurally: the
// code that runs during a migration (the three CLIs and everything under
// lib/) contains no path that writes an auth identity, impersonates one,
// or creates a plan. Accounts are only ever created through GoTrue's
// admin createUser() for a source user/admin document, from that
// document's own bcrypt hash; plans must exist beforehand. Comments are
// stripped before scanning, so explaining the rule is allowed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_DIR = path.resolve(__dirname, '..');
const RUNTIME_FILES = [
  'mongo-to-supabase.mjs',
  'migrate-users-to-supabase-auth.mjs',
  'production-import-orchestrator.mjs',
  ...fs.readdirSync(__dirname).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).map((f) => `lib/${f}`),
];

const FORBIDDEN = [
  [/insert\s+into\s+auth\.users/i, 'a direct auth.users insert'],
  [/update\s+auth\.users/i, 'a direct auth.users update'],
  [/create_plan_version\s*\(/i, 'a create_plan_version() call (plans are created through the admin flow)'],
  [/insert\s+into\s+(public\.)?plans\b/i, 'a direct plans insert'],
  [/request\.jwt\.claim/i, 'JWT-claim impersonation'],
  [/set\s+(local\s+)?role\s+authenticated/i, 'role impersonation'],
  [/admin-rpc/, 'the removed seed-admin module'],
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}

test('the migration runtime files exist and are all scanned', () => {
  assert.ok(RUNTIME_FILES.length >= 18, `expected the 3 CLIs + lib/ modules, found ${RUNTIME_FILES.length}`);
  for (const f of RUNTIME_FILES) assert.ok(fs.existsSync(path.join(MIGRATION_DIR, f)), `${f} missing`);
});

for (const file of RUNTIME_FILES) {
  test(`${file}: no identity, impersonation or plan-creation path`, () => {
    const code = stripComments(fs.readFileSync(path.join(MIGRATION_DIR, file), 'utf8'));
    for (const [pattern, what] of FORBIDDEN) assert.doesNotMatch(code, pattern, `${file} contains ${what}`);
  });
}

test('GoTrue createUser() appears only in the user migration, and always with the source password_hash', () => {
  for (const file of RUNTIME_FILES) {
    const code = stripComments(fs.readFileSync(path.join(MIGRATION_DIR, file), 'utf8'));
    const calls = [...code.matchAll(/auth\.admin\.createUser\(\{([\s\S]*?)\}\);?/g)];
    if (file !== 'migrate-users-to-supabase-auth.mjs') {
      assert.equal(calls.length, 0, `${file} must not create accounts`);
      continue;
    }
    assert.equal(calls.length, 2, 'one call for users, one for adminusers');
    for (const [, body] of calls) {
      assert.match(body, /password_hash:\s*mongo(User|Admin)\.password/, 'created from the source document hash');
      assert.doesNotMatch(body, /\bpassword:/, 'never a generated password');
    }
  }
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
