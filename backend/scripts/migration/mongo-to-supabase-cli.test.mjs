#!/usr/bin/env node
// PR #70 review round 8, item 1 -- mongo-to-supabase.mjs's own CLI was
// still hand-parsed (`a.replace(/^--/, '').split('=')`, `v ?? true`) even
// after round 7 moved the other two entrypoints to the shared strict
// parser. `--rollback=false`/`--reset-checkpoint=false` parsed to the
// STRING "false", coerced truthy by `!!`, silently enabling the flag; an
// unknown/misspelled flag was simply ignored. This file proves the fix:
// the script now uses the same shared parseStrictCliArgs (lib/cli-args.mjs,
// already unit-tested in lib/cli-args.test.mjs) plus its own cross-flag
// validateCliArgs(), both exported for direct testing here, and both
// proven live (spawned as a real child process) to run before any env var
// read or DB/network connection.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseStrictCliArgs } from './lib/cli-args.mjs';
import { CLI_SPEC, validateCliArgs } from './mongo-to-supabase.mjs';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mongo-to-supabase.mjs');

function parse(argv) {
  return parseStrictCliArgs(argv, CLI_SPEC);
}

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

function cleanEnv() {
  const env = { ...process.env };
  delete env.MIGRATION_MONGO_URI;
  delete env.MIGRATION_DB_URL;
  return env;
}

await test('a bare --rollback / --dry-run / --reset-checkpoint parse to exactly `true`', () => {
  assert.deepEqual(parse(['--rollback']), { rollback: true });
  assert.deepEqual(parse(['--dry-run']), { 'dry-run': true });
  assert.deepEqual(parse(['--reset-checkpoint']), { 'reset-checkpoint': true });
});

await test('--domain and --exclude-domain require and capture their =<value>', () => {
  assert.equal(parse(['--domain=payments']).domain, 'payments');
  assert.equal(parse(['--exclude-domain=payments,courses'])['exclude-domain'], 'payments,courses');
});

await test('the exact truthy-string bug this closes: --rollback=false / --reset-checkpoint=false are REJECTED, never coerced to true', () => {
  assert.throws(() => parse(['--rollback=false']), /boolean flag/);
  assert.throws(() => parse(['--rollback=true']), /boolean flag/);
  assert.throws(() => parse(['--reset-checkpoint=false']), /boolean flag/);
  assert.throws(() => parse(['--dry-run=false']), /boolean flag/);
});

await test('an unknown/typo\'d flag (e.g. --domian) is a hard error listing the real allowlist, never silently ignored', () => {
  assert.throws(() => parse(['--domian=payments']), /unknown flag "--domian"/);
  assert.throws(() => parse(['--domian=payments']), /--domain/, 'error should list the real allowlist');
});

await test('a duplicate flag is rejected', () => {
  assert.throws(() => parse(['--domain=a', '--domain=b']), /more than once/);
  assert.throws(() => parse(['--rollback', '--rollback']), /more than once/);
});

await test('a bare positional argument is rejected', () => {
  assert.throws(() => parse(['payments']), /positional argument/);
});

await test('validateCliArgs rejects --rollback combined with --dry-run', () => {
  assert.throws(() => validateCliArgs(parse(['--rollback', '--dry-run'])), /--rollback and --dry-run cannot be combined/);
});

await test('validateCliArgs rejects --rollback combined with --reset-checkpoint', () => {
  assert.throws(() => validateCliArgs(parse(['--rollback', '--reset-checkpoint'])), /--rollback and --reset-checkpoint cannot be combined/);
});

await test('validateCliArgs accepts every non-conflicting combination, including rollback alone and dry-run+reset-checkpoint together', () => {
  assert.doesNotThrow(() => validateCliArgs(parse(['--rollback'])));
  assert.doesNotThrow(() => validateCliArgs(parse(['--dry-run', '--reset-checkpoint'])));
  assert.doesNotThrow(() => validateCliArgs(parse(['--domain=payments', '--dry-run'])));
  assert.doesNotThrow(() => validateCliArgs(parse([])));
});

await test('LIVE: --domian=payments (typo) never reaches env/DB access -- fails during argument parsing, before MIGRATION_MONGO_URI/MIGRATION_DB_URL are even read', () => {
  // No MIGRATION_MONGO_URI/MIGRATION_DB_URL in env at all -- main() would
  // normally fail with "must both be set", a LATER check than CLI
  // parsing. Seeing the "unknown flag" error instead proves parsing ran
  // first and nothing after it (env read, mongoose.connect, pg.Pool)
  // ever executed.
  const result = spawnSync(process.execPath, [scriptPath, '--domian=payments'], { encoding: 'utf8', env: cleanEnv() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown flag "--domian"/);
  assert.doesNotMatch(result.stderr, /must both be set/, 'must never reach the env-var check -- parsing must fail first');
});

await test('LIVE: --rollback=false never reaches env/DB access -- rejected as a boolean flag during parsing', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--rollback=false'], { encoding: 'utf8', env: cleanEnv() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /boolean flag/);
  assert.doesNotMatch(result.stderr, /must both be set/);
});

await test('LIVE: --rollback --dry-run (conflicting combination) never reaches env/DB access -- rejected by validateCliArgs before main() reads a single env var', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--rollback', '--dry-run'], { encoding: 'utf8', env: cleanEnv() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--rollback and --dry-run cannot be combined/);
  assert.doesNotMatch(result.stderr, /must both be set/);
});

await test('LIVE: --rollback --reset-checkpoint (conflicting combination) never reaches env/DB access', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--rollback', '--reset-checkpoint'], { encoding: 'utf8', env: cleanEnv() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--rollback and --reset-checkpoint cannot be combined/);
  assert.doesNotMatch(result.stderr, /must both be set/);
});

await test('LIVE: a genuinely bad-but-parseable CLI still reaches the env-var check as expected (control case -- proves the previous tests fail for the right reason, not because nothing ever runs)', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--domain=payments'], { encoding: 'utf8', env: cleanEnv() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must both be set/);
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
