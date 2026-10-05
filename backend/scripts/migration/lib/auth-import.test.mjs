#!/usr/bin/env node
// PASSWORD_DECISION=IMPORT_BCRYPT_HASHES / email-confirmation contract /
// ROLE_DECISION -- pure/unit tests for lib/auth-import.mjs and the pure
// exports of migrate-users-to-supabase-auth.mjs. The real-GoTrue proof
// (sign in with the original password) is real-gotrue-correlation.test.mjs.
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { isBcryptHash, computePasswordHashProblems, emailConfirmationFor } from './auth-import.mjs';
import {
  computeAdminRoleMappingProblems, computeExitFailure, emailProblemSignature, relationshipSkipSignature, reportForOutput,
} from '../migrate-users-to-supabase-auth.mjs';
import { fingerprint } from './redact.mjs';

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

const HASH = bcrypt.hashSync('fixture-password', 4); // same $2a$ format the old backend writes

test('isBcryptHash: accepts $2a/$2b/$2y bcrypt hashes, rejects everything else', () => {
  assert.equal(isBcryptHash(HASH), true);
  assert.equal(isBcryptHash(HASH.replace('$2a$', '$2b$')), true);
  assert.equal(isBcryptHash(HASH.replace('$2a$', '$2y$')), true);
  for (const bad of [undefined, null, '', 'plaintext-password', HASH.slice(0, -1), HASH.replace('$2a$', '$2x$'), `$argon2id$v=19$m=65536,t=3,p=4$x$y`, 12]) {
    assert.equal(isBcryptHash(bad), false, `should reject ${String(bad).slice(0, 12)}`);
  }
});

test('computePasswordHashProblems: names the source id and reason only -- never the email or the hash', () => {
  const problems = computePasswordHashProblems(
    [{ _id: 'u1', email: 'a@example.invalid', password: HASH }, { _id: 'u2', email: 'b@example.invalid' }, { _id: 'u3', email: 'c@example.invalid', password: 'plain' }],
    [{ _id: 'a1', email: 'admin@example.invalid', password: '' }]
  );
  assert.deepEqual(problems, [
    { kind: 'user', id: 'u2', reason: 'missing password hash' },
    { kind: 'user', id: 'u3', reason: 'password is not a bcrypt hash GoTrue can import' },
    { kind: 'admin', id: 'a1', reason: 'missing password hash' },
  ]);
  assert.ok(!JSON.stringify(problems).includes('@'));
});

test('emailConfirmationFor: an explicit source flag wins, a Google-linked account is confirmed, otherwise login parity', () => {
  assert.deepEqual(emailConfirmationFor({ emailVerified: false, googleId: 'g' }), { confirm: false, basis: 'source_field_unverified' });
  assert.deepEqual(emailConfirmationFor({ isEmailVerified: true }), { confirm: true, basis: 'source_field_verified' });
  assert.deepEqual(emailConfirmationFor({ googleId: 'g-sub' }), { confirm: true, basis: 'google_verified_email' });
  assert.deepEqual(emailConfirmationFor({ email: 'x@example.invalid' }), { confirm: true, basis: 'source_had_no_verification_step' });
});

test('ROLE_DECISION: an AdminUser with role super-admin is a Phase A problem with an explicit reason; admin/editor/viewer map', () => {
  const problems = computeAdminRoleMappingProblems([
    { _id: 's', email: 's@example.invalid', role: 'super-admin' },
    { _id: 'a', email: 'a@example.invalid', role: 'admin' },
    { _id: 'e', email: 'e@example.invalid', role: 'editor' },
    { _id: 'v', email: 'v@example.invalid', role: 'viewer' },
  ]);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].id, 's');
  assert.match(problems[0].reason, /super-admin is never granted by this migration/);
});

test('computeExitFailure: password-hash or undeclared-date problems fail the run in both modes', () => {
  const base = () => ({
    users: { errors: [] }, admins: { errors: [] }, subscriptions: { failed: [] }, reconciliation: { consistent: true },
  });
  assert.equal(computeExitFailure({ ...base(), passwords: { problems: [{}] } }, false), true);
  assert.equal(computeExitFailure({ ...base(), passwords: { problems: [{}] } }, true), true);
  assert.equal(computeExitFailure({ ...base(), dates: { problems: [{}] } }, false), true);
  assert.equal(computeExitFailure({ ...base(), passwords: { problems: [] }, dates: { problems: [] } }, false), false);
});

test('signatures carry a fingerprint, never the address, and reportForOutput attaches the matching one', () => {
  const problem = { kind: 'user', id: 'u1', email: 'bad-email', rawEmail: ' BAD-EMAIL ', reason: 'invalid email format' };
  const skip = { kind: 'teacher', studentEmail: 'student@example.invalid', targetMongoId: 't1' };
  assert.equal(emailProblemSignature(problem), `email:user:invalid email format:${fingerprint('bad-email')}:u1`);
  assert.equal(relationshipSkipSignature(skip), `relationship:teacher:${fingerprint('student@example.invalid')}:t1`);
  const printed = reportForOutput({
    users: { errors: [{ email: 'x@example.invalid', message: 'boom for x@example.invalid' }] },
    admins: { errors: [] },
    subscriptions: { failed: [{ email: 'y@example.invalid', reason: 'r' }] },
    identity: { problems: [problem] },
    relationships: { skipped: [skip] },
  });
  const text = JSON.stringify(printed);
  for (const value of ['x@example.invalid', 'y@example.invalid', 'student@example.invalid', 'bad-email', 'BAD-EMAIL']) {
    assert.ok(!text.includes(value), `printed report still contains ${value}`);
  }
  assert.equal(printed.identity.problems[0].signature, emailProblemSignature(problem), 'a copied signature matches the real one');
  assert.equal(relationshipSkipSignature(printed.relationships.skipped[0]), relationshipSkipSignature(skip));
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
