// How `npm run test:migration` decides that ONE test file passed.
//
// Before, a file passed when its process exited 0. A file that crashed after
// printing nothing useful cannot exit 0, but one that was emptied, renamed
// into a different harness, or reduced to a guard that returns early also
// exits 0 -- and counted as a pass with no test behind it. (The backend
// runner, scripts/run-backend-tests.mjs, has enforced "at least one test,
// all of them passing" per file since #202; this brings the migration suite
// to the same rule.)
//
// Every file in this suite ends with the line "<passed>/<total> passed." A
// file passes only when it exits 0, prints that line, ran at least one test,
// and passed all of them.

const SUMMARY_LINE = /^(\d+)\/(\d+) passed\.\s*$/gm;

/** The last "<passed>/<total> passed." line of the output, or null. */
export function parseTestSummary(stdout) {
  let last = null;
  for (const m of String(stdout ?? '').matchAll(SUMMARY_LINE)) last = { passed: Number(m[1]), total: Number(m[2]) };
  return last;
}

/**
 * @param {{code: number|null, stdout: string}} result a finished test process
 * @returns {{ok: boolean, tests: number, reason: string|null}}
 */
export function judgeTestFile({ code, stdout }) {
  const summary = parseTestSummary(stdout);
  const tests = summary?.total ?? 0;
  if (code !== 0) return { ok: false, tests, reason: `exit ${code}` };
  if (!summary) return { ok: false, tests, reason: 'no "<passed>/<total> passed." summary line' };
  if (summary.total === 0) return { ok: false, tests, reason: 'ran zero tests' };
  if (summary.passed !== summary.total) return { ok: false, tests, reason: `${summary.passed}/${summary.total} passed` };
  return { ok: true, tests, reason: null };
}

/**
 * Runs each file in its own `node` process, streams its output as it arrives,
 * judges it with judgeTestFile(), and prints the aggregate summary.
 * @param {string[]} files absolute paths
 * @param {{display?: (file: string) => string, out?: (s: string) => void, err?: (s: string) => void}} [io]
 * @returns {Promise<{ok: boolean, results: {file: string, ok: boolean, tests: number, reason: string|null}[]}>}
 */
export async function runSuite(files, { display = (f) => f, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const { spawn } = await import('node:child_process');
  const results = [];
  for (const file of files) {
    out(`\n=== ${display(file)} ===\n`);
    const { code, stdout } = await new Promise((resolve) => {
      const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'inherit'] });
      let captured = '';
      child.stdout.on('data', (chunk) => {
        captured += chunk;
        out(String(chunk));
      });
      child.on('error', () => resolve({ code: null, stdout: captured }));
      child.on('close', (c) => resolve({ code: c, stdout: captured }));
    });
    results.push({ file, ...judgeTestFile({ code, stdout }) });
  }

  out('\n=== migration test suite summary ===\n');
  for (const r of results) out(`${r.ok ? 'PASS' : 'FAIL'}  ${display(r.file)} (${r.ok ? `${r.tests} tests` : r.reason})\n`);
  const ok = results.every((r) => r.ok);
  if (ok) out(`\nAll migration test files passed (${results.length} files, ${results.reduce((n, r) => n + r.tests, 0)} tests).\n`);
  else err('\nOne or more migration test files failed.\n');
  return { ok, results };
}
