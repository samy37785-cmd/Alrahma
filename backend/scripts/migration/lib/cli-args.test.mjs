#!/usr/bin/env node
// PR #70 review round 7, item 1 -- pure unit tests for the shared strict
// CLI parser (lib/cli-args.mjs), no infra needed at all. The two
// integration-level test files (migrate-users-to-supabase-auth.test.mjs,
// production-import-orchestrator.test.mjs) prove this parser is actually
// wired into each real entrypoint; this file proves the parser itself is
// correct in isolation.
import assert from 'node:assert/strict';
import { parseStrictCliArgs } from './cli-args.mjs';

const SPEC = {
  flags: {
    execute: { type: 'boolean' },
    compensate: { type: 'boolean' },
    'approved-dispositions': { type: 'string' },
  },
};

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

test('a bare boolean flag parses to exactly `true`', () => {
  assert.deepEqual(parseStrictCliArgs(['--execute'], SPEC), { execute: true });
});

test('multiple distinct flags all parse together', () => {
  assert.deepEqual(parseStrictCliArgs(['--execute', '--compensate'], SPEC), { execute: true, compensate: true });
});

test('a string flag requires and captures its =<value>', () => {
  assert.deepEqual(parseStrictCliArgs(['--approved-dispositions=/tmp/x.json'], SPEC), { 'approved-dispositions': '/tmp/x.json' });
});

test('a string flag value may itself contain "=" -- only the FIRST "=" splits key from value', () => {
  assert.equal(parseStrictCliArgs(['--approved-dispositions=C:\\a=b.json'], SPEC)['approved-dispositions'], 'C:\\a=b.json');
});

test('a boolean flag with ANY "=value" is rejected -- =false, =true, =1, =empty', () => {
  for (const suffix of ['=false', '=true', '=1', '=0', '=']) {
    assert.throws(() => parseStrictCliArgs([`--execute${suffix}`], SPEC), /boolean flag/, `--execute${suffix} must be rejected`);
  }
});

test('the exact truthy-string bug this closes: --execute=false must NEVER parse to a truthy value', () => {
  assert.throws(() => parseStrictCliArgs(['--execute=false'], SPEC), /boolean flag/);
  // Confirms there is no code path where this silently becomes {execute: 'false'} (a truthy string in JS).
});

test('a string flag with no value (bare, or "=" with nothing after) is rejected', () => {
  assert.throws(() => parseStrictCliArgs(['--approved-dispositions'], SPEC), /non-empty/);
  assert.throws(() => parseStrictCliArgs(['--approved-dispositions='], SPEC), /non-empty/);
});

test('an unknown/typo\'d flag is a hard error listing the real allowlist, never silently ignored', () => {
  assert.throws(() => parseStrictCliArgs(['--compansate'], SPEC), /unknown flag "--compansate"/);
  assert.throws(() => parseStrictCliArgs(['--compansate'], SPEC), /--execute/, 'the error should list the real allowlist');
});

test('a duplicate flag is rejected, even a duplicate boolean', () => {
  assert.throws(() => parseStrictCliArgs(['--execute', '--execute'], SPEC), /more than once/);
  assert.throws(() => parseStrictCliArgs(['--approved-dispositions=a', '--approved-dispositions=b'], SPEC), /more than once/);
});

test('a bare positional argument (no leading --) is rejected', () => {
  assert.throws(() => parseStrictCliArgs(['execute'], SPEC), /positional argument/);
  assert.throws(() => parseStrictCliArgs(['-e'], SPEC), /positional argument/);
});

test('an empty flag ("--" alone) is rejected', () => {
  assert.throws(() => parseStrictCliArgs(['--'], SPEC), /empty CLI flag/);
});

test('an empty argv parses to an empty object', () => {
  assert.deepEqual(parseStrictCliArgs([], SPEC), {});
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
