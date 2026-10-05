#!/usr/bin/env node
// The backend test runner behind `npm test` and `npm run test:contract`.
//
// Why it exists: `npm test` used to be `node --test tests/**/*.test.js`,
// unquoted. The shell expands that glob before node sees it, and without
// globstar `**` matches exactly one directory level -- so CI ran only the
// 6 files under tests/*/ (the 5 Supabase contract files, which then skipped
// every test for lack of a database, plus one DB smoke test) and never the
// 56 top-level tests/*.test.js files. A green `npm test` proved almost
// nothing. Those 56 also could not have run as they were: the app aborts at
// import without JWT_SECRET (config/validateEnv.js), and the admin suites
// need their own keys.
//
// What it does instead:
//   1. Finds every tests/**/*.test.{js,mjs} itself (no shell glob) and fails
//      unless the inventory is exactly what this file declares: the total
//      count, and which files are contract files. Adding, removing or
//      moving a test file therefore fails until this inventory is updated
//      -- a file can never silently drop out of the run.
//   2. Hermetic suite (`npm test`): every non-contract file, each in its own
//      `node --test` process (the same per-file isolation `node --test`
//      uses), with test-only secrets and no .env. MongoDB comes from
//      mongodb-memory-server inside the tests (tests/helpers/db.js). Each
//      file must exit 0, report at least one test, and skip none.
//   3. Contract suite (`npm run test:contract`): each Supabase contract file
//      runs through its existing gate script, which starts a disposable
//      Docker Postgres with the repo schema and the env the file needs, so
//      nothing skips for lack of a dependency. The same pass/skip rules
//      apply to the test summary each gate prints.
//
// Usage: node scripts/run-backend-tests.mjs [--suite=hermetic|contract|all]
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(BACKEND_ROOT, 'tests');

// --- inventory: update deliberately when a test file is added/removed ---
const EXPECTED_TOTAL_FILES = 63;
// Contract file -> the gate script that provisions its dependencies.
const CONTRACT_GATES = {
  'tests/contract/supabase-adapter.contract.test.js': 'scripts/test-supabase-contract.mjs',
  'tests/contract/supabase-adapter-auth-service.contract.test.js': 'scripts/test-supabase-auth-service-contract.mjs',
  'tests/contract/supabase-http-contract-gate.contract.test.js': 'scripts/test-supabase-http-contract-gate.mjs',
  'tests/contract/supabase-auth-booking-contract-gate.contract.test.js': 'scripts/test-supabase-auth-booking-contract-gate.mjs',
  'tests/contract/supabase-auth-lifecycle-contract-gate.contract.test.js': 'scripts/test-supabase-auth-lifecycle-contract-gate.mjs',
};

function parseSuite(argv) {
  const arg = argv.find((a) => a.startsWith('--suite='));
  const unknown = argv.filter((a) => !a.startsWith('--suite='));
  if (unknown.length) throw new Error(`unknown argument(s): ${unknown.join(' ')}`);
  const suite = arg ? arg.slice('--suite='.length) : 'hermetic';
  if (!['hermetic', 'contract', 'all'].includes(suite)) throw new Error(`--suite must be hermetic, contract or all (got "${suite}")`);
  return suite;
}

function discoverTestFiles(dir = TESTS_DIR) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') found.push(...discoverTestFiles(full));
    } else if (/\.test\.(js|mjs)$/.test(entry.name)) {
      found.push(path.relative(BACKEND_ROOT, full).split(path.sep).join('/'));
    }
  }
  return found.sort();
}

/** Throws unless the discovered files match the declared inventory exactly. */
export function checkInventory(files) {
  const problems = [];
  if (files.length !== EXPECTED_TOTAL_FILES) {
    problems.push(`found ${files.length} test files, the inventory expects ${EXPECTED_TOTAL_FILES}`);
  }
  const contractOnDisk = files.filter((f) => f.startsWith('tests/contract/'));
  for (const f of contractOnDisk) if (!CONTRACT_GATES[f]) problems.push(`${f} is a contract file with no gate in CONTRACT_GATES`);
  for (const f of Object.keys(CONTRACT_GATES)) if (!files.includes(f)) problems.push(`CONTRACT_GATES lists ${f}, which does not exist`);
  if (problems.length) {
    throw new Error(
      `test inventory mismatch -- update EXPECTED_TOTAL_FILES/CONTRACT_GATES in scripts/run-backend-tests.mjs on purpose:\n  - ${problems.join('\n  - ')}`
    );
  }
  return { hermetic: files.filter((f) => !CONTRACT_GATES[f]), contract: Object.keys(CONTRACT_GATES) };
}

/** Reads the final summary of a node:test run (TAP `# x N` or spec `ℹ x N`). */
export function parseSummary(output) {
  const pick = (key) => {
    const matches = [...output.matchAll(new RegExp(`^(?:#|ℹ) ${key} (\\d+)\\s*$`, 'gm'))];
    return matches.length ? Number(matches.at(-1)[1]) : null;
  };
  return { tests: pick('tests'), pass: pick('pass'), fail: pick('fail'), skipped: pick('skipped'), todo: pick('todo'), cancelled: pick('cancelled') };
}

/** Why a run does not count as a full pass, or null when it does. */
export function verdict(code, summary) {
  if (summary.tests === null) return 'no test summary (the file did not run to completion)';
  if (code !== 0) return `exit code ${code}`;
  if (summary.tests === 0) return 'ran 0 tests';
  if (summary.fail) return `${summary.fail} failed`;
  if (summary.cancelled) return `${summary.cancelled} cancelled`;
  if (summary.skipped) return `${summary.skipped} skipped (a test that cannot run here must not be counted as covered)`;
  if (summary.todo) return `${summary.todo} todo`;
  return null;
}

// Test-only values, generated per run and never real: the app refuses to
// start without JWT_SECRET, the admin suites need their own keys, and
// MONGO_URI is replaced by each test's in-memory replica set. Inherited
// backend settings are dropped and .env is not read, so a developer's
// shell or local .env can neither leak real secrets into a test nor make a
// test pass that would fail in CI.
function hermeticEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(SUPABASE_|MIGRATION_|STRIPE_|PAYPAL_|SMTP_|ADMIN_|JWT_)/.test(k) || ['DATA_BACKEND', 'MONGO_URI', 'CRON_SECRET'].includes(k)) continue;
    env[k] = v;
  }
  return {
    ...env,
    CI: env.CI ?? 'true',
    DOTENV_CONFIG_PATH: path.join(os.tmpdir(), `backend-tests-no-dotenv-${crypto.randomBytes(6).toString('hex')}`),
    JWT_SECRET: `test-only-${crypto.randomBytes(24).toString('hex')}`,
    ADMIN_JWT_ACCESS_SECRET: `test-only-${crypto.randomBytes(32).toString('hex')}`,
    ADMIN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    MONGO_URI: 'mongodb://127.0.0.1:1/replaced-by-each-test',
  };
}

function runProcess(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: BACKEND_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(lanes);
  return results;
}

function report(label, rows) {
  const failed = rows.filter((r) => r.problem);
  for (const r of failed) {
    console.log(`\n----- ${r.name}: ${r.problem} -----\n${r.output.trimEnd()}\n----- end ${r.name} -----`);
  }
  const tests = rows.reduce((n, r) => n + (r.summary.pass ?? 0), 0);
  const skipped = rows.reduce((n, r) => n + (r.summary.skipped ?? 0), 0);
  const noSummary = rows.filter((r) => r.summary.tests === null).length;
  const zeroTests = rows.filter((r) => r.summary.tests === 0).length;
  console.log(`\n${label}: ${rows.length - failed.length}/${rows.length} files passed, ${tests} tests passed`);
  console.log(`${label} counters: skipped=${skipped} files_without_summary=${noSummary} zero_test_files=${zeroTests}`);
  for (const r of rows) console.log(`  ${r.problem ? 'FAIL' : 'ok  '}  ${r.name}  (${r.summary.pass ?? 0}/${r.summary.tests ?? '?'})${r.problem ? `  -- ${r.problem}` : ''}`);
  return failed.length === 0;
}

async function runHermetic(files) {
  const env = hermeticEnv();
  const limit = Math.max(1, Math.min(4, os.availableParallelism() - 1));
  const rows = await runPool(files, limit, async (file) => {
    const { code, output } = await runProcess(['--experimental-test-module-mocks', '--test', '--test-reporter=tap', file], env);
    const summary = parseSummary(output);
    return { name: file, code, output, summary, problem: verdict(code, summary) };
  });
  return report(`hermetic suite (${files.length} files)`, rows);
}

async function runContract(files) {
  // Sequential: each gate owns a Docker container and verifies its cleanup.
  const rows = [];
  for (const file of files) {
    const gate = CONTRACT_GATES[file];
    const { code, output } = await runProcess([gate], process.env);
    const summary = parseSummary(output);
    rows.push({ name: `${file} via ${gate}`, code, output, summary, problem: verdict(code, summary) });
  }
  return report(`contract suite (${files.length} gates)`, rows);
}

async function main() {
  const suite = parseSuite(process.argv.slice(2));
  const { hermetic, contract } = checkInventory(discoverTestFiles());
  console.log(`inventory ok: ${hermetic.length} hermetic + ${contract.length} contract = ${EXPECTED_TOTAL_FILES} test files`);
  let ok = true;
  if (suite === 'hermetic' || suite === 'all') ok = (await runHermetic(hermetic)) && ok;
  if (suite === 'contract' || suite === 'all') ok = (await runContract(contract)) && ok;
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[run-backend-tests] ${err.message}`);
    process.exitCode = 1;
  });
}
