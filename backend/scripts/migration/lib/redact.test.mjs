#!/usr/bin/env node
// LOGGING_DECISION=REDACT -- pure/unit tests for lib/redact.mjs. The
// end-to-end proof (real CLI stdout/stderr and report files scanned for
// seeded values) is lossless-import.test.mjs.
import assert from 'node:assert/strict';
import { fingerprint, redactText, redactDeep, installRedactingConsole } from './redact.mjs';

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

// Built at runtime: a bcrypt hash and a JWT-shaped value, neither a real
// credential (the JWT's header is not the scanner's eyJhbGciOi shape).
const HASH = '$2a$04$RI/NjbXHyr4JLF1rz.4j8ODfZjwVClmGT6rCBmHHygLezXAeoRN3C';
const JWT = ['eyJzdWIiOiJmaXh0dXJl', 'eyJyb2xlIjoidGVzdCJ9', 'c2lnbmF0dXJlLWZpeHR1cmU'].join('.');

test('fingerprint: stable, case/space-insensitive, short, and not the value', () => {
  const a = fingerprint('Learner@Example.invalid ');
  assert.equal(a, fingerprint('learner@example.invalid'));
  assert.match(a, /^fp:[0-9a-f]{12}$/);
  assert.notEqual(a, fingerprint('other@example.invalid'));
});

test('redactText: email, bcrypt hash, JWT, bearer/apikey token and connection strings are all masked', () => {
  const text = [
    'user learner@example.invalid failed',
    `hash ${HASH}`,
    `token ${JWT}`,
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    'apikey abcdefghijklmnopqrstuvwxyz012345',
    'pg postgresql://u:pw@127.0.0.1:5432/db',
    'mongo mongodb+srv://u:pw@cluster0.example.invalid/al-rahma?retryWrites=true',
  ].join('\n');
  const out = redactText(text);
  for (const secret of ['learner@example.invalid', HASH, JWT, 'abcdefghijklmnopqrstuvwxyz012345', 'u:pw@', 'cluster0']) {
    assert.ok(!out.includes(secret), `still contains ${secret}`);
  }
  assert.match(out, /<email fp:[0-9a-f]{12}>/);
  assert.match(out, /<password-hash>/);
  assert.match(out, /<token>/);
  assert.match(out, /Bearer <token>/);
  assert.match(out, /<connection-string>/);
});

test('redactText: ordinary text, ids and ISO dates pass through unchanged', () => {
  const text = 'payments FAILED sourceId=6a6f1c2e9b1d4a0012345678 at 2026-06-14T10:11:12.345Z: amount does not convert';
  assert.equal(redactText(text), text);
  assert.equal(redactText(42), 42);
});

test('redactDeep: nested objects/arrays redacted, Dates become ISO, input untouched', () => {
  const input = { a: ['x@example.invalid', { b: HASH }], when: new Date('2026-06-14T10:11:12.345Z'), n: 1 };
  const out = redactDeep(input);
  assert.match(out.a[0], /^<email fp:/);
  assert.equal(out.a[1].b, '<password-hash>');
  assert.equal(out.when, '2026-06-14T10:11:12.345Z');
  assert.equal(out.n, 1);
  assert.equal(input.a[0], 'x@example.invalid', 'the original object is not modified');
});

test('installRedactingConsole: log/info/warn/error are redacted (strings, objects and Errors), and restore() undoes it', () => {
  const captured = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const level of Object.keys(original)) console[level] = (...args) => captured.push(args.join(' '));
  const restore = installRedactingConsole();
  try {
    console.log('a', 'x@example.invalid');
    console.info({ hash: HASH });
    console.warn(JWT);
    console.error(new Error('connect postgresql://u:pw@127.0.0.1:5432/db failed'));
  } finally {
    restore();
    const after = console.log;
    Object.assign(console, original);
    assert.notEqual(after, original.log, 'restore() puts back the functions present at install time');
  }
  const all = captured.join('\n');
  for (const secret of ['x@example.invalid', HASH, JWT, 'u:pw@']) assert.ok(!all.includes(secret), `leaked ${secret}`);
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
