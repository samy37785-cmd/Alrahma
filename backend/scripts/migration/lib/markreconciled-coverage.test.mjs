#!/usr/bin/env node
// PR #70 review round 10, item 5 -- a structural/static regression guard:
// every production markReconciled() call site must be immediately
// preceded by a real, content-comparing read-back (verifyReadBack(), or
// the bespoke-but-equivalent identity-complete SELECT check
// applyTeacherLink()/applyParentChildLink() use -- see those functions'
// own comments for why a bare existence check is sufficient there: the
// WHERE clause already names every real column those two tables have).
//
// This is deliberately a plain-text scan of the two production source
// files, not a runtime test -- it costs nothing (no Postgres/Docker), and
// it catches the exact class of regression this whole round exists to
// close: a FUTURE markReconciled() call site added without a preceding
// read-back would previously have shipped with no test ever noticing.
// Round 9's own comment history is proof this can genuinely happen: the
// generic domain loop in mongo-to-supabase.mjs carried a comment claiming
// an "INDEPENDENT re-verification" for a full round before one actually
// existed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_DIR = path.join(__dirname, '..');

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

/** @returns {{lines: string[], reconciledLineIdx: number[]}} */
function findMarkReconciledCallSites(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const reconciledLineIdx = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) return; // comment mentioning markReconciled(), not a real call site
    if (/\bmarkReconciled\(/.test(trimmed)) reconciledLineIdx.push(idx);
  });
  return { lines, reconciledLineIdx };
}

const READ_BACK_MARKERS = [
  /\bverifyReadBack\(/,
  // applyTeacherLink()/applyParentChildLink()'s own bespoke, but
  // identity-complete, read-back (see their own header comments for why
  // this is equivalent for those two tables specifically).
  /post-commit read-back verification failed/,
];

function hasReadBackWithin(lines, callLineIdx, windowSize) {
  const start = Math.max(0, callLineIdx - windowSize);
  for (let i = start; i < callLineIdx; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('//')) continue;
    if (READ_BACK_MARKERS.some((re) => re.test(trimmed))) return true;
  }
  return false;
}

function assertEveryCallSiteHasReadBack(relativePath, { windowSize = 80, expectedCallSiteCount } = {}) {
  const filePath = path.join(MIGRATION_DIR, relativePath);
  const { lines, reconciledLineIdx } = findMarkReconciledCallSites(filePath);
  assert.ok(reconciledLineIdx.length > 0, `sanity: ${relativePath} must have at least one real markReconciled() call site for this test to mean anything`);
  if (expectedCallSiteCount !== undefined) {
    assert.equal(
      reconciledLineIdx.length, expectedCallSiteCount,
      `${relativePath} now has ${reconciledLineIdx.length} markReconciled() call site(s), expected exactly ${expectedCallSiteCount} -- ` +
      `if a new one was added on purpose, verify it has a preceding read-back and update this expected count`
    );
  }
  const uncovered = reconciledLineIdx.filter((idx) => !hasReadBackWithin(lines, idx, windowSize));
  assert.deepEqual(
    uncovered.map((idx) => idx + 1), [],
    `${relativePath}: markReconciled() call site(s) at line(s) ${uncovered.map((idx) => idx + 1).join(', ')} have no verifyReadBack() ` +
    `(or the documented bespoke equivalent) within the preceding ${windowSize} lines -- every markReconciled() must be ` +
    'preceded by a real, independent verification of every target it wrote (PR #70 round 10, item 5)'
  );
}

test('mongo-to-supabase.mjs: its one markReconciled() call site (the generic per-domain loop) is preceded by verifyReadBack()', () => {
  assertEveryCallSiteHasReadBack('mongo-to-supabase.mjs', { expectedCallSiteCount: 1 });
});

test('migrate-users-to-supabase-auth.mjs: every markReconciled() call site (migrateOneUser, migrateOneAdmin, applyTeacherLink, applyParentChildLink, migrateSubscription) is preceded by a real read-back', () => {
  assertEveryCallSiteHasReadBack('migrate-users-to-supabase-auth.mjs', { expectedCallSiteCount: 5 });
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
