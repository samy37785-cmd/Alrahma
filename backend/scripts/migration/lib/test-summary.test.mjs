#!/usr/bin/env node
// lib/test-summary.mjs: the per-file pass rule of `npm run test:migration`.
// No Docker; the last test runs the real runner against throwaway files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judgeTestFile, parseTestSummary, runSuite } from './test-summary.mjs';

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

await test('parseTestSummary reads the last "<passed>/<total> passed." line, however much output precedes it', () => {
  assert.deepEqual(parseTestSummary('  ok - a\n  ok - b\n\n2/2 passed.\n'), { passed: 2, total: 2 });
  assert.deepEqual(parseTestSummary('1/1 passed.\nnoise\n11/12 passed.'), { passed: 11, total: 12 });
  assert.equal(parseTestSummary('ok - a\nall done'), null);
  assert.equal(parseTestSummary(''), null);
  assert.equal(parseTestSummary(undefined), null);
  // Only a whole line counts: a test name that mentions the pattern does not.
  assert.equal(parseTestSummary('  ok - prints 3/3 passed. at the end'), null);
});

await test('judgeTestFile: exit 0 + a full pass is the only success', () => {
  assert.deepEqual(judgeTestFile({ code: 0, stdout: '5/5 passed.\n' }), { ok: true, tests: 5, reason: null });
});

await test('judgeTestFile: a non-zero exit fails even with a clean summary', () => {
  assert.deepEqual(judgeTestFile({ code: 1, stdout: '5/5 passed.\n' }), { ok: false, tests: 5, reason: 'exit 1' });
  assert.equal(judgeTestFile({ code: null, stdout: '' }).ok, false);
});

await test('judgeTestFile: exit 0 with no summary line is a failure (a file that proves nothing)', () => {
  const r = judgeTestFile({ code: 0, stdout: 'nothing to see here\n' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no "<passed>/<total> passed." summary line');
});

await test('judgeTestFile: a file that ran zero tests fails', () => {
  assert.deepEqual(judgeTestFile({ code: 0, stdout: '0/0 passed.\n' }), { ok: false, tests: 0, reason: 'ran zero tests' });
});

await test('judgeTestFile: a partial pass fails even if the process exited 0', () => {
  assert.deepEqual(judgeTestFile({ code: 0, stdout: '3/4 passed.\n' }), { ok: false, tests: 4, reason: '3/4 passed' });
});

await test('runSuite: an empty-but-exit-0 file or a crash fails the suite, a real one passes, and the summary names the reason', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-strict-'));
  try {
    const good = path.join(dir, 'good.test.mjs');
    const empty = path.join(dir, 'empty.test.mjs');
    const crash = path.join(dir, 'crash.test.mjs');
    fs.writeFileSync(good, ["console.log('  ok - a');", "console.log('');", "console.log('1/1 passed.');", ''].join('\n'));
    fs.writeFileSync(empty, '// exits 0 and proves nothing\n');
    fs.writeFileSync(crash, ["console.log('2/2 passed.');", 'process.exit(3);', ''].join('\n'));
    const capture = () => {
      const o = [];
      const e = [];
      return { o, e, io: { display: (f) => path.basename(f), out: (x) => o.push(x), err: (x) => e.push(x) } };
    };

    const one = capture();
    const ok = await runSuite([good], one.io);
    assert.equal(ok.ok, true);
    assert.ok(one.o.join('').includes('PASS  good.test.mjs (1 tests)'));
    assert.ok(one.o.join('').includes('All migration test files passed (1 files, 1 tests).'));
    assert.equal(one.e.join(''), '');

    const two = capture();
    const bad = await runSuite([good, empty, crash], two.io);
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.results.map((r) => [path.basename(r.file), r.ok, r.reason]), [
      ['good.test.mjs', true, null],
      ['empty.test.mjs', false, 'no "<passed>/<total> passed." summary line'],
      ['crash.test.mjs', false, 'exit 3'],
    ]);
    assert.ok(two.o.join('').includes('FAIL  empty.test.mjs (no "<passed>/<total> passed." summary line)'));
    assert.ok(two.o.join('').includes('FAIL  crash.test.mjs (exit 3)'));
    assert.ok(two.e.join('').includes('One or more migration test files failed.'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
