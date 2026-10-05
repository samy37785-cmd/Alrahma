#!/usr/bin/env node
// DECISION_RESET_TOKEN_EXPIRY: users.resetToken, users.resetTokenExpiry
// and the refreshtokens collection are classified
// INTENTIONALLY_NOT_MIGRATED_SECURITY_EPHEMERAL_DATA -- counted and named
// in the report, and structurally unreachable by any write path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SECURITY_EPHEMERAL_CLASSIFICATION, SECURITY_EPHEMERAL_COLLECTIONS, SECURITY_EPHEMERAL_USER_FIELDS, securityEphemeralReport,
} from './security-ephemeral.mjs';
import { accountForSourceDates } from './source-dates.mjs';
import { USER_SOURCE_DATES } from '../migrate-users-to-supabase-auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_DIR = path.resolve(__dirname, '..');
const RUNTIME_FILES = [
  'mongo-to-supabase.mjs',
  'migrate-users-to-supabase-auth.mjs',
  'production-import-orchestrator.mjs',
  ...fs.readdirSync(__dirname).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).map((f) => `lib/${f}`),
];
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');

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

test('the classification names exactly the owner-ruled fields and collection', () => {
  assert.equal(SECURITY_EPHEMERAL_CLASSIFICATION, 'INTENTIONALLY_NOT_MIGRATED_SECURITY_EPHEMERAL_DATA');
  assert.deepEqual([...SECURITY_EPHEMERAL_USER_FIELDS], ['resetToken', 'resetTokenExpiry']);
  assert.deepEqual([...SECURITY_EPHEMERAL_COLLECTIONS], ['refreshtokens']);
});

test('the report counts presence per field and collection, says migrated=false, and carries no value', () => {
  const users = [
    { resetToken: 'secret-reset-value', resetTokenExpiry: new Date('2026-06-01T00:00:00Z') },
    { resetToken: '', resetTokenExpiry: null },
    {},
  ];
  const report = securityEphemeralReport(users, { refreshtokens: 4 });
  assert.deepEqual(report, {
    classification: SECURITY_EPHEMERAL_CLASSIFICATION,
    migrated: false,
    fields: { 'users.resetToken': 1, 'users.resetTokenExpiry': 1 },
    collections: { refreshtokens: 4 },
  });
  assert.doesNotMatch(JSON.stringify(report), /secret-reset-value|2026-06-01/);
  assert.throws(() => securityEphemeralReport(users, {}), /no document count for refreshtokens/);
});

test('users.resetTokenExpiry is declared excluded with the classification -- not mapped, not a generic unpreserved loss', () => {
  assert.equal(USER_SOURCE_DATES.excluded.resetTokenExpiry, SECURITY_EPHEMERAL_CLASSIFICATION);
  assert.ok(!USER_SOURCE_DATES.mapped.includes('resetTokenExpiry'));
  assert.ok(!(USER_SOURCE_DATES.unpreserved ?? []).includes('resetTokenExpiry'));
});

test('date accounting counts it as intentionallyNotMigrated; an undeclared date still fails the document', () => {
  const stats = {};
  accountForSourceDates({ createdAt: new Date(), updatedAt: new Date(), resetTokenExpiry: new Date() }, USER_SOURCE_DATES, stats);
  assert.deepEqual(stats, { intentionallyNotMigrated: { resetTokenExpiry: 1 } });
  assert.throws(() => accountForSourceDates({ passwordChangedAt: new Date() }, USER_SOURCE_DATES, {}), /has no declared destination/);
});

test('structural: no runtime code reads a reset or refresh token for anything but the classification', () => {
  for (const file of RUNTIME_FILES) {
    if (file === 'lib/security-ephemeral.mjs') continue;
    const code = stripComments(fs.readFileSync(path.join(MIGRATION_DIR, file), 'utf8'));
    // Whole words only: the Supabase client option autoRefreshToken is unrelated.
    assert.doesNotMatch(code, /\brefreshtokens\b|\bRefreshToken\b|\brefresh_token\b/i, `${file} references refresh tokens`);
    const resetRefs = code.match(/resetToken\w*/g) ?? [];
    if (file === 'migrate-users-to-supabase-auth.mjs') {
      assert.deepEqual(resetRefs, ['resetTokenExpiry'], 'only the exclusion declaration may name it');
    } else {
      assert.deepEqual(resetRefs, [], `${file} references a reset token field`);
    }
  }
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
