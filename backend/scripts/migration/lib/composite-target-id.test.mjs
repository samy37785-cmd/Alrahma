#!/usr/bin/env node
// PR #70 review round 9, item 1 -- pure unit tests for the shared
// composite target_id codec (lib/composite-target-id.mjs), no infra
// needed. resume-rollback-integrity.test.mjs proves this codec is
// actually wired into a real migrate/resume/rollback cycle against a
// live Postgres row whose composite value (quran_bookmarks.verse_key)
// contains the delimiter; this file proves the codec itself is correct
// in isolation, including the exact failure mode the old
// `${a}:${b}` / `.split(':')` encoding had.
import assert from 'node:assert/strict';
import { encodeCompositeTargetId, decodeCompositeTargetId } from './composite-target-id.mjs';

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

test('encode then decode round-trips exactly for plain values', () => {
  const encoded = encodeCompositeTargetId(['11111111-1111-1111-1111-111111111111', 'some-course-id']);
  assert.deepEqual(decodeCompositeTargetId(encoded), ['11111111-1111-1111-1111-111111111111', 'some-course-id']);
});

test('THE BUG: a component containing the old delimiter (":") round-trips exactly -- this is quran_bookmarks.verse_key\'s real shape ("2:255")', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const verseKey = '2:255';
  const encoded = encodeCompositeTargetId([userId, verseKey]);
  const [decodedUserId, decodedVerseKey] = decodeCompositeTargetId(encoded);
  assert.equal(decodedUserId, userId);
  assert.equal(decodedVerseKey, verseKey, 'verse_key must decode back whole, not truncated at the first internal ":"');
});

test('demonstrates the OLD encoding was NOT reversible for this exact case (regression guard)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const verseKey = '2:255';
  const oldStyleEncoded = `${userId}:${verseKey}`; // the pre-fix scheme
  const [oldA, oldB] = oldStyleEncoded.split(':');
  assert.notEqual(oldB, verseKey, 'sanity check: the old split(\':\') scheme really did corrupt this value (this proves the bug was real, not hypothetical)');
  assert.equal(oldB, '2', 'the old scheme silently truncated "2:255" down to "2"');
});

test('a component containing multiple colons still round-trips', () => {
  const encoded = encodeCompositeTargetId(['a', '1:2:3:4:5']);
  assert.deepEqual(decodeCompositeTargetId(encoded), ['a', '1:2:3:4:5']);
});

test('a component containing a literal double-quote and backslash still round-trips (JSON escaping exercised)', () => {
  const tricky = 'weird"value\\with\\backslashes';
  const encoded = encodeCompositeTargetId(['x', tricky]);
  assert.deepEqual(decodeCompositeTargetId(encoded), ['x', tricky]);
});

test('an empty-string component still round-trips (not dropped/coerced)', () => {
  const encoded = encodeCompositeTargetId(['x', '']);
  assert.deepEqual(decodeCompositeTargetId(encoded), ['x', '']);
});

test('numeric components are coerced to strings, and decode back as strings', () => {
  const encoded = encodeCompositeTargetId(['scope-name', 2026]);
  assert.deepEqual(decodeCompositeTargetId(encoded), ['scope-name', '2026']);
});

test('encode requires at least two parts', () => {
  assert.throws(() => encodeCompositeTargetId(['only-one']), /at least two/);
  assert.throws(() => encodeCompositeTargetId('not-an-array'), /at least two/);
});

test('decode throws (fails closed) on a plain, non-JSON string -- e.g. a legacy ":"-joined value is never silently misinterpreted', () => {
  assert.throws(() => decodeCompositeTargetId('11111111-1111-1111-1111-111111111111:2:255'), /not valid JSON/);
});

test('decode throws on valid JSON that is not an array of strings', () => {
  assert.throws(() => decodeCompositeTargetId('{"a":1}'), /did not decode to an array/);
  assert.throws(() => decodeCompositeTargetId('["only-one"]'), /did not decode to an array/);
  assert.throws(() => decodeCompositeTargetId('[1,2]'), /did not decode to an array/);
  assert.throws(() => decodeCompositeTargetId('null'), /did not decode to an array/);
});

test('three-or-more-part composites also round-trip (codec is not hardcoded to pairs)', () => {
  const encoded = encodeCompositeTargetId(['a', 'b:c', 'd']);
  assert.deepEqual(decodeCompositeTargetId(encoded), ['a', 'b:c', 'd']);
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
