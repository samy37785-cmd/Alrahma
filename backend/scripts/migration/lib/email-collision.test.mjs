#!/usr/bin/env node
// lib/email-collision.mjs: exact and same-mailbox matching, extraction
// from any document shape, and output that never carries an email.
import assert from 'node:assert/strict';
import { extractEmailsDeep, formatResult, hasEmailConflict, isEmailShaped, mailboxKey, normalizeEmail } from './email-collision.mjs';

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

test('normalizeEmail: trims, lowercases and applies NFKC', () => {
  assert.equal(normalizeEmail('  Owner.Admin@Example.ORG '), 'owner.admin@example.org');
  assert.equal(normalizeEmail('ｏwner@example.org'), 'owner@example.org', 'full-width letters fold to ASCII');
});

test('mailboxKey: +tags are dropped everywhere; dots only for gmail/googlemail', () => {
  assert.equal(mailboxKey('Owner+Admin@Example.org'), 'owner@example.org');
  assert.equal(mailboxKey('o.w.n.e.r+x@googlemail.com'), 'owner@gmail.com');
  assert.equal(mailboxKey('o.wner@example.org'), 'o.wner@example.org', 'dots matter outside gmail');
});

test('extractEmailsDeep: finds emails in nested objects, arrays, keys and free text; skips non-plain values', () => {
  const doc = {
    _id: { toString: () => 'x' },
    email: 'Learner@Example.org',
    customer: { contact: { email: 'payer+tag@example.net' } },
    notes: ['call me at second.person@example.com please'],
    createdAt: new Date(),
    'weird-key@example.io': true,
  };
  const found = extractEmailsDeep(doc);
  assert.deepEqual([...found].sort(), ['learner@example.org', 'payer+tag@example.net', 'second.person@example.com', 'weird-key@example.io']);
});

test('hasEmailConflict: exact (case/space-insensitive) match is a conflict', () => {
  const source = extractEmailsDeep({ email: 'learner@example.org' });
  assert.equal(hasEmailConflict('  LEARNER@example.org', source), true);
});

test('hasEmailConflict: same mailbox (+tag, gmail dots/googlemail) is a conflict', () => {
  const source = extractEmailsDeep({ a: 'owner.admin@gmail.com', b: 'billing@example.org' });
  assert.equal(hasEmailConflict('owneradmin+academy@googlemail.com', source), true);
  assert.equal(hasEmailConflict('billing+super@example.org', source), true);
});

test('hasEmailConflict: a genuinely different address is not a conflict', () => {
  const source = extractEmailsDeep({ a: 'owner.admin@gmail.com', b: 'billing@example.org' });
  assert.equal(hasEmailConflict('academy-admin@example.org', source), false);
  assert.equal(hasEmailConflict('owner.admin@example.org', source), false, 'gmail dot rule does not apply to other domains');
});

test('hasEmailConflict: a non-email entry fails without echoing it', () => {
  assert.throws(() => hasEmailConflict('not-an-email', new Set()), (err) => !/not-an-email/.test(err.message));
  assert.equal(isEmailShaped('a@b'), false);
});

test('formatResult: exactly the agreed line, with no email in it', () => {
  assert.equal(formatResult(true), 'SUPER_ADMIN_EMAIL_CONFLICT=YES');
  assert.equal(formatResult(false), 'SUPER_ADMIN_EMAIL_CONFLICT=NO');
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
