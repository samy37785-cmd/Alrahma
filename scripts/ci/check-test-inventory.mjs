#!/usr/bin/env node
// `node scripts/ci/check-test-inventory.mjs`: every test file in the repository
// is either run by a CI step or listed below as not run, with the reason.
//
// Why: each suite has its own way of choosing files (a directory walk, a list
// written by hand, a vitest default), and a file outside all of them simply
// never ran. That happened to the six api/ test files (the admin proxy) and to
// whatsappFabPhones.layout.test.js. This check fails on any test file, tracked
// or new, that no rule below claims, and on any rule that no longer matches a
// file. It reads file names only; it runs nothing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// lib/db/test/orchestrate-db-tests.mjs names the files it runs one by one.
const LIB_DB_ORCHESTRATED = [
  'lib/db/test/orchestrator-failure-propagation.test.mjs',
  'lib/db/test/published-migrations-checksum.test.mjs',
  'lib/db/test/schema.local.test.mjs',
  'lib/db/test/rls.local.test.mjs',
  'lib/db/test/rls-full-matrix.local.test.mjs',
  'lib/db/test/acl.local.test.mjs',
  'lib/db/test/upgrade-scenario.local.test.mjs',
];

// Run in CI. Where a step finds its files itself, the rule is a directory and
// that step's own check covers the rest (named in `how`).
export const RUN = [
  { step: 'Backend tests / Backend contract gates', match: /^backend\/tests\//, how: 'backend/scripts/run-backend-tests.mjs walks backend/tests and checks the file count' },
  { step: 'Migration tests', match: /^backend\/scripts\/(migration|ops)\//, how: 'backend/scripts/migration/run-all-tests.mjs checks its list against the disk' },
  { step: 'lib/db tests', files: LIB_DB_ORCHESTRATED, how: 'lib/db/test/orchestrate-db-tests.mjs' },
  { step: 'lib/db tests', files: ['lib/db/test/published-migrations-checksum-selftest.test.mjs'], how: 'npm run check:published-migrations:selftest' },
  { step: 'Vercel Function tests', match: /^api\//, how: 'scripts/ci/run-api-tests.mjs walks api/' },
  {
    step: 'Frontend unit tests (+ prerender and real-browser steps)',
    match: /^artifacts\/al-rahma-academy\/(?!node_modules\/|dist\/)/,
    how: 'vitest runs every test file of the app; scripts/test-unit.mjs fails on a skip outside the files the later steps run',
  },
];

// Not run in CI, on purpose.
export const NOT_RUN = [
  { match: /^\.migration-backup\//, reason: 'an archived copy of the tree from before the move to pnpm; nothing builds, imports or deploys it' },
  { match: /^ops\/option-a-rehearsal\/test\//, reason: 'a manual rehearsal of the cancelled Supabase cutover; it needs a Supabase CLI stack started by hand (ops/option-a-rehearsal/README.md)' },
  { files: ['backend/scripts/fresh-start-seed/fresh-start-seed.test.mjs'], reason: 'seed scripts for the cancelled move to Supabase, run by hand (backend/scripts/fresh-start-seed/README.md)' },
];

const claims = (rule, file) => (rule.files ? rule.files.includes(file) : rule.match.test(file));

/** Tracked files plus new ones git does not ignore. */
export function listTestFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(out.split('\0').filter((f) => f && TEST_FILE.test(f)))]
    .filter((f) => fs.existsSync(path.join(REPO_ROOT, f)))
    .sort();
}

/** Problems with the inventory ([] when every test file is accounted for). */
export function checkInventory(files, { orchestratorSource = '' } = {}) {
  const problems = [];
  for (const file of files) {
    const run = RUN.filter((rule) => claims(rule, file));
    const notRun = NOT_RUN.filter((rule) => claims(rule, file));
    if (!run.length && !notRun.length) problems.push(`${file}: no CI step runs this test file. Add it to a suite, or to NOT_RUN in scripts/ci/check-test-inventory.mjs with the reason`);
    if (run.length && notRun.length) problems.push(`${file}: listed both as run and as not run`);
  }
  for (const rule of [...RUN, ...NOT_RUN]) {
    if (rule.files) {
      for (const f of rule.files) if (!files.includes(f)) problems.push(`${f}: listed in scripts/ci/check-test-inventory.mjs but does not exist`);
    } else if (!files.some((f) => rule.match.test(f))) {
      problems.push(`${rule.match}: matches no test file any more; remove the rule`);
    }
  }
  for (const f of LIB_DB_ORCHESTRATED) {
    if (orchestratorSource && !orchestratorSource.includes(path.basename(f))) problems.push(`${f}: listed as run by lib/db/test/orchestrate-db-tests.mjs, which does not name it`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = listTestFiles();
  const orchestratorSource = fs.readFileSync(path.join(REPO_ROOT, 'lib/db/test/orchestrate-db-tests.mjs'), 'utf8');
  const problems = checkInventory(files, { orchestratorSource });
  for (const rule of RUN) console.log(`run      ${String(files.filter((f) => claims(rule, f)).length).padStart(4)}  ${rule.step}  (${rule.how})`);
  for (const rule of NOT_RUN) console.log(`not run  ${String(files.filter((f) => claims(rule, f)).length).padStart(4)}  ${rule.reason}`);
  if (problems.length) {
    console.error(`\ntest inventory: ${problems.length} problem(s)\n  - ${problems.join('\n  - ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\ntest inventory ok: ${files.length} test files, each run by a CI step or listed as not run with its reason`);
  }
}
