#!/usr/bin/env node
// lib/source-collections.mjs: every collection of the Mongo source is either
// migrated, security-ephemeral, retired-and-empty, or unknown-and-empty.
// Pure/in-memory; no Docker. The real-Mongo end-to-end proof (both tools stop
// before any write) lives in lossless-import.test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_TOOL_COLLECTIONS,
  RETIRED_COLLECTIONS,
  SOURCE_COLLECTIONS_NOT_COVERED,
  USER_TOOL_COLLECTIONS,
  assertSourceCollectionsCovered,
  classifySourceCollections,
} from './source-collections.mjs';
import { SECURITY_EPHEMERAL_COLLECTIONS } from './security-ephemeral.mjs';

const MIGRATION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}

// The 32 collections of the approved Mongo backup (names only): what a real
// source looks like to this check.
const REAL_SOURCE_COLLECTIONS = [
  'adminusers', 'blogs', 'certificates', 'comments', 'contactmessages', 'counters', 'coupons', 'courseprogresses', 'courses',
  'enrollments', 'hifzprogresses', 'invoices', 'liveclasses', 'manualpayments', 'messages', 'notifications', 'payments', 'posts',
  'quranbookmarks', 'quranmemorizationstats', 'quranreadingprogresses', 'referrals', 'refreshtokens', 'reviews', 'studentrecords',
  'subscribers', 'systemauditlogs', 'systemconfigs', 'trialrequests', 'tutorconversations', 'users', 'wishlists',
];

/** A stand-in for a mongodb Db: only listCollections().toArray() and collection(name).countDocuments(). */
function fakeDb(counts) {
  return {
    listCollections: () => ({ toArray: async () => Object.keys(counts).map((name) => ({ name })) }),
    collection: (name) => ({ countDocuments: async () => counts[name] }),
  };
}

await test('the real source (32 collections; users, payments, enrollments ... hold data, the rest are empty) is accepted with all 32 covered', () => {
  assert.equal(REAL_SOURCE_COLLECTIONS.length, 32);
  const counts = Object.fromEntries(REAL_SOURCE_COLLECTIONS.map((n) => [n, 0]));
  Object.assign(counts, { users: 10, payments: 15, enrollments: 13, trialrequests: 10, courses: 6, subscribers: 1, quranbookmarks: 1, quranreadingprogresses: 3, quranmemorizationstats: 1 });
  const r = classifySourceCollections(counts);
  assert.equal(r.covered, 32);
  assert.deepEqual(r.retiredWithData, []);
  assert.deepEqual(r.unmappedWithData, []);
  assert.deepEqual(r.unmappedEmpty, []);
});

await test('a retired collection (posts, comments, tutorconversations) is accepted only while empty', () => {
  for (const name of RETIRED_COLLECTIONS) {
    assert.deepEqual(classifySourceCollections({ [name]: 0 }).retiredWithData, []);
    assert.deepEqual(classifySourceCollections({ [name]: 3 }).retiredWithData, [{ name, count: 3 }]);
  }
});

await test('an unknown collection is accepted only while empty; with data it is reported by name and count', () => {
  assert.deepEqual(classifySourceCollections({ mystery: 0 }).unmappedEmpty, ['mystery']);
  assert.deepEqual(classifySourceCollections({ mystery: 0 }).unmappedWithData, []);
  assert.deepEqual(classifySourceCollections({ mystery: 2 }).unmappedWithData, [{ name: 'mystery', count: 2 }]);
});

await test('MongoDB bookkeeping collections (system.*) are never data', () => {
  const r = classifySourceCollections({ 'system.views': 5, 'system.profile': 1 });
  assert.deepEqual(r, { retiredWithData: [], unmappedWithData: [], unmappedEmpty: [], covered: 0 });
});

await test('a missing or invalid document count is refused, never read as zero', () => {
  assert.throws(() => classifySourceCollections({ users: undefined }), /no usable document count/);
  assert.throws(() => classifySourceCollections({ users: -1 }), /no usable document count/);
  assert.throws(() => classifySourceCollections({ users: 1.5 }), /no usable document count/);
});

await test('the registry has no overlap and every name is a lowercase collection name', () => {
  const all = [...USER_TOOL_COLLECTIONS, ...DOMAIN_TOOL_COLLECTIONS, ...SECURITY_EPHEMERAL_COLLECTIONS, ...RETIRED_COLLECTIONS];
  assert.equal(new Set(all).size, all.length, 'a collection is listed twice');
  for (const name of all) assert.match(name, /^[a-z]+$/);
  assert.deepEqual([...all].sort(), [...REAL_SOURCE_COLLECTIONS].sort(), 'the registry is exactly the 32 collections of the real source');
});

await test('drift: the registry equals the collections the two tools actually read', () => {
  const read = (file) => fs.readFileSync(path.join(MIGRATION_DIR, file), 'utf8');
  const literalCollections = (src) => new Set([...src.matchAll(/\.collection\('([a-z]+)'\)/g)].map((m) => m[1]));
  const domainTool = literalCollections(read('mongo-to-supabase.mjs'));
  const userTool = literalCollections(read('migrate-users-to-supabase-auth.mjs'));
  assert.deepEqual([...userTool].sort(), [...USER_TOOL_COLLECTIONS].sort(), 'migrate-users reads a collection the registry does not list (or the reverse)');
  const readByDomains = [...domainTool].filter((n) => !USER_TOOL_COLLECTIONS.includes(n)).sort();
  assert.deepEqual(readByDomains, [...DOMAIN_TOOL_COLLECTIONS].sort(), 'mongo-to-supabase reads a collection the registry does not list (or the reverse)');
});

await test('assertSourceCollectionsCovered: passes and reports the empty unknown ones', async () => {
  const out = await assertSourceCollectionsCovered(fakeDb({ users: 2, payments: 1, refreshtokens: 0, posts: 0, extra_empty: 0 }));
  assert.deepEqual(out, { covered: 4, unmappedEmpty: ['extra_empty'] });
});

await test('assertSourceCollectionsCovered: throws SOURCE_COLLECTIONS_NOT_COVERED naming collections and counts only', async () => {
  const secret = 'Sup3r-Secret-Document-Value';
  let err = null;
  try {
    await assertSourceCollectionsCovered(fakeDb({ users: 2, posts: 1, mystery: 4, comments: 0 }));
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'must refuse');
  assert.equal(err.code, SOURCE_COLLECTIONS_NOT_COVERED);
  assert.deepEqual(err.problems, ['posts (retired, no target) holds 1 document(s)', 'mystery (no mapping) holds 4 document(s)']);
  assert.match(err.message, /Nothing was written/);
  assert.ok(!err.message.includes(secret));
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
