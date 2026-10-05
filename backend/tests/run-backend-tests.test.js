// The rules scripts/run-backend-tests.mjs enforces, tested on their own: a
// file only counts as covered when it ran to completion, ran at least one
// test and skipped none; and the test inventory must match exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInventory, parseSummary, verdict } from '../scripts/run-backend-tests.mjs';

const TAP_PASS = '1..3\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const SPEC_SKIPPED = 'ℹ tests 12\nℹ suites 0\nℹ pass 0\nℹ fail 0\nℹ cancelled 0\nℹ skipped 12\nℹ todo 0\n';

test('parseSummary reads both TAP and spec summaries (last occurrence wins)', () => {
  assert.deepEqual(parseSummary(TAP_PASS), { tests: 3, pass: 3, fail: 0, skipped: 0, todo: 0, cancelled: 0 });
  assert.equal(parseSummary(SPEC_SKIPPED).skipped, 12);
  assert.equal(parseSummary(`# tests 1\n# pass 0\n${TAP_PASS}`).pass, 3);
  assert.equal(parseSummary('process crashed before printing anything').tests, null);
});

test('verdict: only a completed run with >0 tests, no failures and no skips counts as a pass', () => {
  assert.equal(verdict(0, parseSummary(TAP_PASS)), null);
  assert.match(verdict(0, parseSummary(SPEC_SKIPPED)), /12 skipped/);
  assert.match(verdict(1, parseSummary(TAP_PASS)), /exit code 1/);
  assert.match(verdict(0, parseSummary('# tests 0\n# pass 0\n# fail 0\n# skipped 0\n')), /ran 0 tests/);
  assert.match(verdict(1, parseSummary('# tests 1\n# pass 0\n# fail 1\n')), /exit code 1/);
  assert.match(verdict(0, parseSummary('')), /no test summary/);
});

test('checkInventory: the exact file count and the contract gate map are both required', () => {
  const contract = [
    'tests/contract/supabase-adapter.contract.test.js',
    'tests/contract/supabase-adapter-auth-service.contract.test.js',
    'tests/contract/supabase-http-contract-gate.contract.test.js',
    'tests/contract/supabase-auth-booking-contract-gate.contract.test.js',
    'tests/contract/supabase-auth-lifecycle-contract-gate.contract.test.js',
  ];
  const hermetic = Array.from({ length: 60 }, (_, i) => `tests/file-${i}.test.js`);
  const split = checkInventory([...hermetic, ...contract]);
  assert.equal(split.hermetic.length, 60);
  assert.deepEqual(split.contract.sort(), [...contract].sort());

  assert.throws(() => checkInventory([...hermetic.slice(1), ...contract]), /found 64 test files, the inventory expects 65/);
  assert.throws(
    () => checkInventory([...hermetic.slice(1), ...contract, 'tests/contract/new-gate.contract.test.js']),
    /new-gate\.contract\.test\.js is a contract file with no gate/
  );
  assert.throws(() => checkInventory([...hermetic, 'tests/file-x.test.js', ...contract.slice(1)]), /CONTRACT_GATES lists .* which does not exist/);
});
