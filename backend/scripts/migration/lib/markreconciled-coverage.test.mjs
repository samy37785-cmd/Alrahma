#!/usr/bin/env node
// PR #70 review round 10, item 5 -- a structural/static regression guard:
// every production markReconciled() call site must be preceded by a real,
// content-comparing read-back.
//
// PR #70 review round 11 -- round 10's own version of this test was
// itself a real gap the reviewer correctly flagged: it only ever proved a
// `verifyReadBack(` call appeared TEXTUALLY somewhere in the preceding 80
// lines before a `markReconciled(` call -- a read-back for an entirely
// UNRELATED check, placed nearby in the same function by coincidence,
// would have satisfied that heuristic just as well as a real one. It was
// never actually control-flow-aware.
//
// Fixed structurally, not by tightening the heuristic further:
// markReconciled() is no longer called directly ANYWHERE in either
// production file -- lib/reconcile.mjs's verifyThenReconcile() is now the
// ONLY function in this entire directory that calls it, and
// verifyThenReconcile() only ever reaches that call after every one of
// its caller-supplied checks has actually returned `{ok: true}`, in
// order, in the same function invocation (see that module's own header
// comment). This test now proves the invariant directly, not by
// proximity:
//   1. markReconciled( appears ZERO times in mongo-to-supabase.mjs and
//      migrate-users-to-supabase-auth.mjs (every real reconciliation is
//      forced through the shared function -- there is no other way to
//      reach it);
//   2. lib/reconcile.mjs itself has exactly one real markReconciled( call
//      (a basic sanity check that the shared function's own contract
//      hasn't silently regressed);
//   3. verifyThenReconcile( appears the expected number of times in each
//      production file (a hardcoded tripwire, same purpose as round 10's
//      own expectedCallSiteCount -- a new call site added on purpose must
//      update this count, forcing a reviewer to look at it).
//
// Separately, explicitly covering the reconciled fast path (round 11,
// item 2): mongo-to-supabase.mjs's generic domain loop can also skip a
// document as "unchanged" WITHOUT ever calling markReconciled() at all
// (the ledger already says reconciled from a prior run) -- that path is
// structurally invisible to checks 1-3 above, since nothing is being
// reconciled there. It has its own, dedicated, tight-proximity check
// below: the `skippedUnchanged += 1` line itself must be preceded by a
// verifyReadBack() call within a narrow window, distinct from and IN
// ADDITION TO the whole-file zero-markReconciled invariant.
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

function readLines(relativePath) {
  return fs.readFileSync(path.join(MIGRATION_DIR, relativePath), 'utf8').split('\n');
}

/** Real (non-comment) occurrences of `pattern` as a genuine call -- a
 * `// ...mentions markReconciled()...` line never counts. */
function countRealCalls(lines, pattern) {
  return lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
    return pattern.test(trimmed);
  }).length;
}

function assertZeroDirectMarkReconciled(relativePath) {
  const lines = readLines(relativePath);
  const count = countRealCalls(lines, /\bmarkReconciled\(/);
  assert.equal(
    count, 0,
    `${relativePath} calls markReconciled(...) directly ${count} time(s) -- every reconciliation in this codebase must go ` +
    'through the shared verifyThenReconcile() (lib/reconcile.mjs) instead, so a read-back is structurally guaranteed to ' +
    'precede it, not merely textually nearby (PR #70 round 11)'
  );
}

function assertExactVerifyThenReconcileCount(relativePath, expectedCount) {
  const lines = readLines(relativePath);
  const count = countRealCalls(lines, /\bverifyThenReconcile\(/);
  assert.equal(
    count, expectedCount,
    `${relativePath} now has ${count} verifyThenReconcile(...) call site(s), expected exactly ${expectedCount} -- ` +
    'if a new reconciliation point was added on purpose, confirm it genuinely funnels through verifyThenReconcile() ' +
    '(never a direct markReconciled() call) and update this expected count'
  );
}

test('mongo-to-supabase.mjs: markReconciled() is never called directly -- only through verifyThenReconcile()', () => {
  assertZeroDirectMarkReconciled('mongo-to-supabase.mjs');
  assertExactVerifyThenReconcileCount('mongo-to-supabase.mjs', 1);
});

test('migrate-users-to-supabase-auth.mjs: markReconciled() is never called directly -- only through verifyThenReconcile()', () => {
  assertZeroDirectMarkReconciled('migrate-users-to-supabase-auth.mjs');
  assertExactVerifyThenReconcileCount('migrate-users-to-supabase-auth.mjs', 5);
});

test('lib/reconcile.mjs: exactly one real markReconciled() call exists -- the shared function\'s own contract has not silently regressed', () => {
  const lines = readLines('lib/reconcile.mjs');
  const count = countRealCalls(lines, /\bmarkReconciled\(/);
  assert.equal(count, 1, `lib/reconcile.mjs has ${count} real markReconciled() call(s), expected exactly 1`);
});

// ---------------------------------------------------------------------
// Round 11, item 2 -- the reconciled fast path: dedicated, tight-window
// coverage, since nothing is reconciled here (it is a SKIP, not a
// markReconciled() call) and is therefore invisible to every check above.
// ---------------------------------------------------------------------

test('mongo-to-supabase.mjs: the reconciled fast-path skip is preceded by a real verifyReadBack() call, not trusted on existence alone', () => {
  const lines = readLines('mongo-to-supabase.mjs');
  const skipLineIdx = lines.findIndex((line) => /skippedUnchanged\s*\+=\s*1/.test(line));
  assert.ok(skipLineIdx >= 0, 'sanity: mongo-to-supabase.mjs must have a `skippedUnchanged += 1` line for this test to mean anything');
  const WINDOW = 15; // tight, deliberately much narrower than round 10's 80-line heuristic -- this checks ONE specific, known code shape, not "somewhere nearby"
  const start = Math.max(0, skipLineIdx - WINDOW);
  const nearby = lines.slice(start, skipLineIdx).join('\n');
  assert.match(
    nearby, /\bverifyReadBack\(/,
    `the reconciled fast-path's own \`skippedUnchanged += 1\` (line ${skipLineIdx + 1}) has no verifyReadBack() call within ` +
    `the preceding ${WINDOW} lines -- a document must never be re-reported as unchanged on target-row EXISTENCE alone ` +
    '(PR #70 round 11, item 2)'
  );
  // The skip must be reachable ONLY after that verifyReadBack() call
  // actually ran and passed -- i.e. no early `continue`/return sits
  // between them that would let the skip fire without ever reaching the
  // check. A narrow, specific structural guard for this exact shape.
  const between = lines.slice(start, skipLineIdx);
  const readBackIdx = between.map((l) => /\bverifyReadBack\(/.test(l)).lastIndexOf(true);
  assert.ok(readBackIdx >= 0);
  const afterReadBack = between.slice(readBackIdx + 1);
  assert.ok(
    !afterReadBack.some((l) => /^\s*continue\s*;?\s*$/.test(l)),
    'a `continue` sits between the fast-path\'s verifyReadBack() call and its `skippedUnchanged += 1` -- the skip must ' +
    'only be reachable through the successful branch of that check'
  );
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
