// Stage 0 — DB Evidence and Test-Gate Remediation.
//
// Proves, by REAL execution (not by reading the code and assuming), that
// orchestrate-db-tests.mjs's pipeline runner (runPipeline() in
// orchestrator-lib.mjs, the exact function the real orchestrator calls —
// not a re-implementation) does two things correctly:
//
//   1. When a child suite exits with a nonzero code, the pipeline's own
//      overall exit code is nonzero too (failure actually propagates).
//   2. Every step AFTER the failing one is genuinely skipped — its run()
//      is never invoked at all, proven via a real side effect (a sentinel
//      file) that step would have written if it had run, not merely a
//      `skipped: true` flag that could be set without actually skipping.
//
// This is a safe, no-Docker, no-Postgres, no-network meta-test: it only
// spawns tiny throwaway Node scripts written to a temp directory and
// always removes them in `finally`, whether the assertions above pass or
// not. It does NOT count toward the 230-assertion DB suite total and is
// not part of `test:db` — run it on its own (`node
// test/orchestrator-failure-propagation.test.mjs`) as a one-time proof
// that the harness's fail-fast mechanism genuinely works, per Stage 0
// requirement 4. It leaves no failing assertion behind: every test below
// is expected to (and, run for real, does) PASS — the "failure" it proves
// is a *simulated* child-process failure it deliberately manufactures,
// not a real defect in this codebase.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runPipeline } from "./orchestrator-lib.mjs";

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "assertion failed");
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "alrahma-orch-selftest-"));
const sentinelPath = path.join(tmpDir, "should-be-skipped.ran");

const failingScriptPath = path.join(tmpDir, "simulated-failing-suite.mjs");
fs.writeFileSync(
  failingScriptPath,
  `console.log("FAIL  simulated failure (this is a deliberate, safe self-test fixture, not a real defect)");\n` +
    `console.log("0/1 passed.");\n` +
    `process.exitCode = 1;\n`,
);

const shouldBeSkippedScriptPath = path.join(tmpDir, "should-be-skipped.mjs");
fs.writeFileSync(
  shouldBeSkippedScriptPath,
  `import fs from "node:fs";\n` +
    `fs.writeFileSync(${JSON.stringify(sentinelPath)}, "this file proves this script actually ran");\n` +
    `console.log("1/1 passed.");\n`,
);

const okScriptPath = path.join(tmpDir, "ok-suite.mjs");
fs.writeFileSync(okScriptPath, `console.log("PASS  trivially true");\nconsole.log("1/1 passed.");\n`);

const noSummaryScriptPath = path.join(tmpDir, "migrate-like-step.mjs");
fs.writeFileSync(noSummaryScriptPath, `console.log("[migrate] done.");\n`);

async function main() {
  await test("a failing child suite makes the pipeline's overall exit code nonzero", async () => {
    const result = await runPipeline([{ name: "simulated-failing-suite", run: () => runNode(failingScriptPath) }]);
    assert(result.overallExitCode !== 0, `expected a nonzero overall exit code, got ${result.overallExitCode}`);
    assert(result.steps[0].code !== 0, "expected the failing step's own recorded exit code to be nonzero");
  });

  await test("a step after a failing step is skipped, and its run() is genuinely never invoked", async () => {
    assert(!fs.existsSync(sentinelPath), "test setup bug: sentinel file already exists before the pipeline ran");
    const result = await runPipeline([
      { name: "simulated-failing-suite", run: () => runNode(failingScriptPath) },
      { name: "should-be-skipped", run: () => runNode(shouldBeSkippedScriptPath) },
    ]);
    assert(result.overallExitCode !== 0, "expected the pipeline to report overall failure");
    assert(result.steps[1].skipped === true, "expected the second step to be marked skipped");
    assert(result.steps[1].ran === false, "expected the second step's ran flag to be false");
    assert(
      !fs.existsSync(sentinelPath),
      "the skipped step's sentinel file exists on disk — its run() was actually invoked, skip is not real",
    );
  });

  await test("subsequent stages are not counted as successful after a failure (aggregate reflects only what ran)", async () => {
    const result = await runPipeline([
      { name: "simulated-failing-suite", run: () => runNode(failingScriptPath) },
      { name: "would-have-passed", run: () => runNode(okScriptPath) },
    ]);
    assert(result.overallExitCode !== 0, "expected overall failure");
    // The failing step's own 0/1 is real and counted; the skipped step
    // contributes nothing (total stays null, not silently treated as 0/0
    // passed, and never treated as though its 1/1 had actually happened).
    assert(result.aggregate.total === 1, `expected aggregate.total 1 (only the failing step ran), got ${result.aggregate.total}`);
    assert(result.aggregate.passed === 0, `expected aggregate.passed 0, got ${result.aggregate.passed}`);
  });

  await test("positive control: a pipeline of only-succeeding steps reports overall success", async () => {
    const result = await runPipeline([{ name: "ok-suite", run: () => runNode(okScriptPath) }]);
    assert(result.overallExitCode === 0, `expected exit code 0, got ${result.overallExitCode}`);
    assert(result.aggregate.passed === 1 && result.aggregate.total === 1, "expected aggregate 1/1");
  });

  await test("a step with no 'N/M passed.' line (e.g. a migration-apply step) is excluded from the aggregate, not counted as 0/0", async () => {
    const result = await runPipeline([
      { name: "migrate-like-step", run: () => runNode(noSummaryScriptPath) },
      { name: "ok-suite", run: () => runNode(okScriptPath) },
    ]);
    assert(result.overallExitCode === 0, "expected overall success");
    assert(result.steps[0].total === null, "expected the no-summary step's total to be null, not 0");
    assert(result.aggregate.total === 1, `expected aggregate.total 1 (only ok-suite counted), got ${result.aggregate.total}`);
  });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[test] harness crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
