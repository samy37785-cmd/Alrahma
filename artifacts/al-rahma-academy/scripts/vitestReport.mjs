// Shared by the three CI test steps (scripts/test-unit.mjs, test-prerender.mjs,
// test-layout.mjs).
//
// Vitest exits 0 when tests are skipped. A step that exists to run a set of
// tests for real would then pass with every one of them skipped, having tested
// nothing. These helpers run vitest with a JSON report beside the usual console
// output and judge that report: which files ran, how many tests passed, and
// where a test was skipped.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Runs `vitest run` on `files` (all files when empty) from the app root.
 * @returns {{status: number, report: object|null}} report is null when vitest wrote none
 */
export function runVitest(files, { args = [], env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vitest-report-'));
  const outputFile = join(dir, 'report.json');
  // An explicit --reporter replaces vitest's default console reporter, so the
  // default is named here unless the caller chose one.
  const consoleReporter = args.some((a) => a.startsWith('--reporter')) ? [] : ['--reporter=default'];
  try {
    const result = spawnSync(
      'npx',
      ['vitest', 'run', ...files, ...consoleReporter, ...args, '--reporter=json', `--outputFile.json=${outputFile}`],
      { cwd: APP_ROOT, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } },
    );
    const report = existsSync(outputFile) ? JSON.parse(readFileSync(outputFile, 'utf8')) : null;
    return { status: result.status ?? 1, report };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** One row per test file: its path relative to the app root and how many tests ended in each status. */
export function summarize(report) {
  return report.testResults.map((file) => {
    const counts = {};
    for (const test of file.assertionResults) counts[test.status] = (counts[test.status] ?? 0) + 1;
    return {
      file: relative(APP_ROOT, file.name).split(sep).join('/'),
      status: file.status,
      message: file.message ?? '',
      total: file.assertionResults.length,
      passed: counts.passed ?? 0,
      failed: counts.failed ?? 0,
    };
  });
}

/**
 * Why a run is not a full pass ([] when it is).
 * @param {{status: number, report: object|null}} run
 * @param {object} rules
 * @param {string[]} [rules.expectFiles] each must be in the run and pass at least one test
 * @param {Iterable<string>} [rules.allowSkipIn] files whose tests may be skipped here (none by default)
 */
export function judge({ status, report }, { expectFiles = [], allowSkipIn = [] } = {}) {
  if (!report) return [`vitest wrote no JSON report (exit code ${status})`];
  const allowed = new Set(allowSkipIn);
  const files = summarize(report);
  const problems = [];
  if (status !== 0) problems.push(`vitest exited with code ${status}`);
  if (!files.length) problems.push('no test file ran');
  for (const f of files) {
    if (f.status === 'failed' && f.total === 0) problems.push(`${f.file}: could not run (${f.message.split('\n')[0]})`);
    else if (f.failed) problems.push(`${f.file}: ${f.failed} failed`);
    else if (f.total === 0) problems.push(`${f.file}: contains no test`);
    const notRun = f.total - f.passed - f.failed;
    if (notRun && !allowed.has(f.file)) problems.push(`${f.file}: ${notRun} skipped or todo (a test that cannot run in this step must say which step runs it)`);
  }
  for (const want of expectFiles) {
    const f = files.find((row) => row.file === want);
    if (!f) problems.push(`${want}: not in the run`);
    else if (!f.passed) problems.push(`${want}: no test passed`);
  }
  return problems;
}

/** Prints the verdict and returns the exit code for the step. */
export function finish(label, run, rules) {
  const problems = judge(run, rules);
  if (run.report) {
    const r = run.report;
    console.log(`\n[${label}] ${r.testResults.length} files: ${r.numPassedTests} passed, ${r.numFailedTests} failed, ${r.numPendingTests + r.numTodoTests} skipped or todo`);
  }
  if (!problems.length) {
    console.log(`[${label}] ok`);
    return 0;
  }
  console.error(`[${label}] FAILED:\n  - ${problems.join('\n  - ')}`);
  return 1;
}
