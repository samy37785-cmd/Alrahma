#!/usr/bin/env node
// PR #70 review round 7, item 8 -- a single, explicit entrypoint for
// EVERY migration test file in this directory, run in one process with a
// clear aggregate pass/fail summary. Backing for `npm run test:migration`
// (backend/package.json). Deliberately separate from the plain `npm test`
// glob (`node --test tests/**/*.test.js`), which only ever matches
// `.test.js` files under backend/tests/ -- every file this script runs is
// a `.test.mjs` file under backend/scripts/migration/, a structurally
// disjoint set. `npm test` passing has never meant, and still does not
// mean, "the migration tests ran" -- this script is the only thing that
// runs them, and must be invoked explicitly (`npm run test:migration` or
// `npm run test:all`).
//
// Each file below already manages its own disposable Docker
// Mongo/Postgres/GoTrue-stub containers and verifies their own cleanup;
// this script only sequences them and aggregates the final exit code.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Order matters only in that pure/unit-only files (fast, no Docker) run
// first, so a quick regression is visible before the slower, disposable-
// infrastructure-backed files even start.
const TEST_FILES = [
  'lib/cli-args.test.mjs',
  'lib/composite-target-id.test.mjs',
  'mongo-to-supabase-cli.test.mjs',
  'migrate-users-to-supabase-auth.test.mjs',
  'unrecorded-data-preflight.test.mjs',
  'orchestrator-cli-resume-compensate.test.mjs',
  'production-import-orchestrator.test.mjs',
  'resume-rollback-integrity.test.mjs',
  'invoice-atomicity.test.mjs',
  'seed-admin-atomicity.test.mjs',
];

let overallFailed = false;
const summary = [];

for (const relPath of TEST_FILES) {
  const fullPath = path.join(__dirname, relPath);
  console.log(`\n=== ${relPath} ===`);
  const result = spawnSync(process.execPath, [fullPath], { stdio: 'inherit' });
  const ok = result.status === 0;
  if (!ok) overallFailed = true;
  summary.push({ file: relPath, ok, code: result.status });
}

console.log('\n=== migration test suite summary ===');
for (const { file, ok, code } of summary) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}${ok ? '' : ` (exit ${code})`}`);
}

if (overallFailed) {
  console.error('\nOne or more migration test files failed.');
  process.exitCode = 1;
} else {
  console.log('\nAll migration test files passed.');
}
