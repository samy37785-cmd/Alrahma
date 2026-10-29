#!/usr/bin/env node
// `node scripts/ci/run-api-tests.mjs`: the tests of the Vercel Functions in api/
// (the admin proxy: the HMAC signature Render verifies, the path-traversal
// guard, and the vercel.json rewrite rules). No CI step ran them before.
//
// Finds every api/**/*.test.mjs itself, runs each in its own `node --test`
// process, and applies the backend runner's rules
// (backend/scripts/run-backend-tests.mjs): each file must exit 0, run at least
// one test and skip none. ADMIN_PROXY_SIGNING_SECRET and
// FORM_PROXY_SIGNING_SECRET are removed from the environment, so a value in
// a developer's shell cannot change a result; the tests set their own
// test-only secrets.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSummary, verdict } from '../../backend/scripts/run-backend-tests.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API_DIR = path.join(REPO_ROOT, 'api');

export function findApiTestFiles(dir = API_DIR) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : findApiTestFiles(full);
    return /\.test\.m?js$/.test(entry.name) ? [path.relative(REPO_ROOT, full).split(path.sep).join('/')] : [];
  }).sort();
}

function run(file, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function main() {
  const files = findApiTestFiles();
  if (!files.length) throw new Error('no api/**/*.test.mjs file found');
  const env = { ...process.env };
  delete env.ADMIN_PROXY_SIGNING_SECRET;
  delete env.FORM_PROXY_SIGNING_SECRET;
  let failed = 0;
  let passed = 0;
  for (const file of files) {
    const { code, output } = await run(file, env);
    const summary = parseSummary(output);
    const problem = verdict(code, summary);
    passed += summary.pass ?? 0;
    if (problem) {
      failed += 1;
      console.log(`\n----- ${file}: ${problem} -----\n${output.trimEnd()}\n----- end ${file} -----`);
    }
    console.log(`  ${problem ? 'FAIL' : 'ok  '}  ${file}  (${summary.pass ?? 0}/${summary.tests ?? '?'})${problem ? `  -- ${problem}` : ''}`);
  }
  console.log(`\napi tests: ${files.length - failed}/${files.length} files passed, ${passed} tests passed`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[run-api-tests] ${err.message}`);
    process.exitCode = 1;
  });
}
