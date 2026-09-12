#!/usr/bin/env node
// Stage 2J-B — Production Enablement. Pure/unit tests for
// isLocalHost()/assertLocalHostOrProductionAuthorized() -- no Docker, no
// real infrastructure, no real connection ever attempted (this module
// only ever parses a URL's hostname, never opens a socket).
import assert from 'node:assert/strict';
import { isLocalHost, assertLocalHostOrProductionAuthorized } from './host-guard.mjs';

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

const REAL_AUTH = { verified: true, projectRef: 'difzynyphojgisrfvrkd' };

test('isLocalHost: localhost and 127.0.0.1 are local', () => {
  assert.equal(isLocalHost('postgresql://user:pass@localhost:5432/db'), true);
  assert.equal(isLocalHost('postgresql://user:pass@127.0.0.1:5432/db'), true);
});

test('isLocalHost: anything else is not local', () => {
  assert.equal(isLocalHost('postgresql://user:pass@db.example.com:5432/db'), false);
  assert.equal(isLocalHost('postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:5432/db'), false);
});

test('assertLocalHostOrProductionAuthorized: localhost always passes, regardless of authorization (even null)', () => {
  assert.doesNotThrow(() => assertLocalHostOrProductionAuthorized('postgresql://x@localhost:5432/db', 'MIGRATION_DB_URL', null));
  assert.doesNotThrow(() => assertLocalHostOrProductionAuthorized('postgresql://x@127.0.0.1:5432/db', 'MIGRATION_DB_URL', null));
});

test('assertLocalHostOrProductionAuthorized: non-local host with no authorization (null) throws -- unchanged default behavior', () => {
  assert.throws(
    () => assertLocalHostOrProductionAuthorized('postgresql://x@db.example.com:5432/db', 'MIGRATION_DB_URL', null),
    /is not localhost\/127\.0\.0\.1, and no production authorization was provided/,
  );
});

test('assertLocalHostOrProductionAuthorized: non-local host with a fabricated {verified: true} (no projectRef) throws', () => {
  assert.throws(
    () => assertLocalHostOrProductionAuthorized('postgresql://x@db.example.com:5432/db', 'MIGRATION_DB_URL', { verified: true }),
    /is not a genuinely verified result/,
  );
});

test('assertLocalHostOrProductionAuthorized: non-local host with verified:false throws even if other fields look plausible', () => {
  assert.throws(
    () => assertLocalHostOrProductionAuthorized('postgresql://x@db.example.com:5432/db', 'MIGRATION_DB_URL', { verified: false, projectRef: 'difzynyphojgisrfvrkd' }),
    /is not a genuinely verified result/,
  );
});

test('assertLocalHostOrProductionAuthorized: non-local host with a plain `true` (not an object) throws', () => {
  assert.throws(
    () => assertLocalHostOrProductionAuthorized('postgresql://x@db.example.com:5432/db', 'MIGRATION_DB_URL', true),
    /is not a genuinely verified result/,
  );
});

test('assertLocalHostOrProductionAuthorized: non-local host with a genuine, well-formed authorization object passes (the fix is not over-broad)', () => {
  assert.doesNotThrow(() => assertLocalHostOrProductionAuthorized('postgresql://x@db.example.com:5432/db', 'MIGRATION_DB_URL', REAL_AUTH));
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
