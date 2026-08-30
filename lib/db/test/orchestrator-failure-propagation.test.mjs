// Stage 0 — DB Evidence and Test-Gate Remediation (+ Stage 0 Corrective).
//
// Proves, by REAL execution (not by reading the code and assuming), that
// the orchestrator's own gating logic actually works. This file is a
// MANDATORY preflight step of `pnpm run test:db` (orchestrate-db-tests.mjs
// runs it first, before touching Docker at all — see that file's
// runMandatorySelfTestPreflight()); it is not an optional script a human
// has to remember to run separately. It is a safe, no-Docker, no-Postgres,
// no-network meta-test throughout — it only spawns tiny throwaway Node
// scripts written to a temp directory and always removes them in
// `finally`. It does NOT count toward the 230-assertion DB suite total
// (orchestrate-db-tests.mjs runs it entirely outside the pipeline/contract
// machinery it's proving). It leaves no failing assertion behind: every
// test below is expected to (and, run for real, does) PASS — any line
// that looks like "FAIL"/"SIMULATED-FAIL" inside a nested child script's
// OWN output below is a *deliberately manufactured* fixture failure this
// file uses to prove the gate catches it, not a real defect; those lines
// are prefixed "SIMULATED-FAIL" specifically so they can never be mistaken
// for a real suite's "FAIL" line if this output ever ends up in a raw CI
// log.
//
// Three things are proven here, using orchestrator-lib.mjs's REAL,
// unmodified exports (never a re-implementation of them):
//
//   1. runPipeline() fail-fast + skip semantics (pre-existing coverage).
//   2. evaluateAssertionContract() — the EXACT assertion contract added in
//      Stage 0 Corrective to close the "aggregate.passed === aggregate
//      .total is too weak" finding: a missing, duplicated, wrong-total, or
//      summary-less required suite must fail the gate even when some
//      naive sum would have looked fine.
//   3. runLifecycle()/decideRunOutcome() — the cleanup-before-evidence
//      ordering added in Stage 0 Corrective to close the "evidence could
//      be written before cleanup completed/verified" finding: cleanup
//      failure alone must fail an otherwise-perfect run, and the
//      evidence-writing step must only ever see a fully-resolved,
//      already-decided outcome that already accounts for cleanup.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DB_ASSERTION_CONTRACT,
  DB_ASSERTION_CONTRACT_TOTAL,
  decideRunOutcome,
  evaluateAssertionContract,
  runLifecycle,
  runNode,
  runPipeline,
} from "./orchestrator-lib.mjs";

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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "alrahma-orch-selftest-"));
const sentinelPath = path.join(tmpDir, "should-be-skipped.ran");

const failingScriptPath = path.join(tmpDir, "simulated-failing-suite.mjs");
fs.writeFileSync(
  failingScriptPath,
  `console.log("SIMULATED-FAIL (expected — orchestrator self-test fixture, not a real defect): simulated failure");\n` +
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

// -----------------------------------------------------------------------
// Helper: builds a fully valid, contract-satisfying `steps` array (as
// runPipeline() would produce it) so each contract self-test below only
// has to describe the ONE way it deliberately breaks that baseline.
// -----------------------------------------------------------------------
function goldenSteps() {
  return DB_ASSERTION_CONTRACT.map((s) => ({
    name: s.name,
    ran: true,
    skipped: false,
    code: 0,
    passed: s.expectedTotal,
    total: s.expectedTotal,
    durationMs: 1,
  }));
}

async function main() {
  // -----------------------------------------------------------------
  // Part 1 — runPipeline() fail-fast + skip semantics (pre-existing).
  // -----------------------------------------------------------------
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

  // -----------------------------------------------------------------
  // Part 2 — evaluateAssertionContract() (Stage 0 Corrective, finding 1).
  // -----------------------------------------------------------------
  await test("contract: the fully correct 230-assertion set satisfies the contract", async () => {
    const steps = [
      ...goldenSteps(),
      // Non-counted steps (migration apply, container start) with no
      // summary line must be tolerated — they are not part of the
      // contract and carry no "N/M passed." text.
      { name: "start-disposable-postgres", ran: true, skipped: false, code: 0, passed: null, total: null, durationMs: 1 },
      { name: "run-migrations (1st)", ran: true, skipped: false, code: 0, passed: null, total: null, durationMs: 1 },
    ];
    const result = evaluateAssertionContract(steps);
    assert(result.ok === true, `expected ok=true, problems: ${JSON.stringify(result.problems)}`);
    assert(
      result.aggregate.total === DB_ASSERTION_CONTRACT_TOTAL,
      `expected aggregate.total ${DB_ASSERTION_CONTRACT_TOTAL}, got ${result.aggregate.total}`,
    );
    assert(result.aggregate.passed === DB_ASSERTION_CONTRACT_TOTAL, "expected every assertion to have passed");
  });

  await test("contract: a required suite that exited 0 with no readable summary fails the gate", async () => {
    const steps = goldenSteps();
    const victim = steps.find((s) => s.name === "rls.local.test.mjs");
    victim.passed = null;
    victim.total = null; // exited 0, but produced no "N/M passed." line at all
    const result = evaluateAssertionContract(steps);
    assert(result.ok === false, "expected ok=false for a suite with no readable summary");
    assert(
      result.problems.some((p) => p.includes("rls.local.test.mjs") && p.includes("no readable")),
      `expected a 'no readable summary' problem for rls.local.test.mjs, got: ${JSON.stringify(result.problems)}`,
    );
  });

  await test("contract: a suite reporting the wrong total (e.g. 1/1 instead of its real expected count) fails the gate", async () => {
    const steps = goldenSteps();
    const victim = steps.find((s) => s.name === "acl.local.test.mjs"); // really expects 18
    victim.passed = 1;
    victim.total = 1;
    const result = evaluateAssertionContract(steps);
    assert(result.ok === false, "expected ok=false for a suite reporting the wrong total");
    assert(
      result.problems.some((p) => p.includes("acl.local.test.mjs") && p.includes("reported total 1, expected exactly 18")),
      `expected a wrong-total problem for acl.local.test.mjs, got: ${JSON.stringify(result.problems)}`,
    );
  });

  await test("contract: aggregate below 230 fails the gate even though every PRESENT suite has passed === total", async () => {
    const steps = goldenSteps().filter((s) => s.name !== "upgrade-scenario.local.test.mjs"); // silently vanished
    const result = evaluateAssertionContract(steps);
    assert(result.ok === false, "expected ok=false when a required suite is silently missing");
    assert(
      result.problems.some((p) => p.includes('missing required suite "upgrade-scenario.local.test.mjs"')),
      `expected a missing-suite problem, got: ${JSON.stringify(result.problems)}`,
    );
    assert(result.aggregate.total < DB_ASSERTION_CONTRACT_TOTAL, "expected the aggregate to fall short of 230");
  });

  await test("contract: a duplicated required suite fails the gate", async () => {
    const steps = goldenSteps();
    const dup = steps.find((s) => s.name === "schema.local.test.mjs");
    steps.push({ ...dup });
    const result = evaluateAssertionContract(steps);
    assert(result.ok === false, "expected ok=false for a duplicated required suite");
    assert(
      result.problems.some((p) => p.includes('schema.local.test.mjs" appears 2 times')),
      `expected a duplicate-suite problem, got: ${JSON.stringify(result.problems)}`,
    );
  });

  await test("contract: a skipped required suite fails the gate", async () => {
    const steps = goldenSteps();
    const victim = steps.find((s) => s.name === "rls-full-matrix.local.test.mjs");
    victim.skipped = true;
    victim.ran = false;
    victim.code = null;
    victim.passed = null;
    victim.total = null;
    const result = evaluateAssertionContract(steps);
    assert(result.ok === false, "expected ok=false for a skipped required suite");
    assert(
      result.problems.some((p) => p.includes("rls-full-matrix.local.test.mjs") && p.includes("skipped")),
      `expected a skipped-suite problem, got: ${JSON.stringify(result.problems)}`,
    );
  });

  await test("contract: an unaccounted-for extra step with its own summary line fails the gate (can't silently inflate the total)", async () => {
    const steps = [...goldenSteps(), { name: "orchestrator-selftest", ran: true, skipped: false, code: 0, passed: 5, total: 5, durationMs: 1 }];
    const result = evaluateAssertionContract(steps);
    assert(result.ok === false, "expected ok=false when an out-of-contract step carries its own summary");
    assert(
      result.problems.some((p) => p.includes('"orchestrator-selftest"') && p.includes("not part of the assertion contract")),
      `expected an out-of-contract problem, got: ${JSON.stringify(result.problems)}`,
    );
  });

  // -----------------------------------------------------------------
  // Part 3 — runLifecycle() / decideRunOutcome() (Stage 0 Corrective,
  // finding 2: cleanup must precede — and gate — evidence).
  // -----------------------------------------------------------------
  await test("lifecycle: cleanup failure blocks evidence write even when the pipeline and contract were perfect", async () => {
    let writeCalls = 0;
    const outcome = await runLifecycle({
      runTests: async () => ({
        pipelineResult: { overallExitCode: 0, steps: goldenSteps(), aggregate: { passed: DB_ASSERTION_CONTRACT_TOTAL, total: DB_ASSERTION_CONTRACT_TOTAL } },
        contractEval: evaluateAssertionContract(goldenSteps()),
      }),
      cleanup: async () => ({ containerName: "fake-container", verified: false, error: "still present after stop+rm" }),
      writeEvidenceIfGreen: async (o) => {
        if (o.fullyGreen) writeCalls++;
      },
    });
    assert(outcome.fullyGreen === false, "expected fullyGreen=false when cleanup was not verified");
    assert(
      outcome.problems.some((p) => p.includes("cleanup not verified")),
      `expected a cleanup-not-verified problem, got: ${JSON.stringify(outcome.problems)}`,
    );
    assert(writeCalls === 0, "evidence must NOT have been written when cleanup failed");
  });

  await test("lifecycle: a genuinely successful test run plus a failed cleanup is an OVERALL failure, not a partial success", async () => {
    const outcome = await runLifecycle({
      runTests: async () => ({
        pipelineResult: { overallExitCode: 0, steps: goldenSteps(), aggregate: { passed: DB_ASSERTION_CONTRACT_TOTAL, total: DB_ASSERTION_CONTRACT_TOTAL } },
        contractEval: evaluateAssertionContract(goldenSteps()),
      }),
      cleanup: async () => ({ containerName: "fake-container", verified: false, error: "docker stop timed out" }),
      writeEvidenceIfGreen: async () => {},
    });
    assert(outcome.pipelineResult.overallExitCode === 0, "sanity: the pipeline itself really did succeed");
    assert(outcome.contractEval.ok === true, "sanity: the contract itself really was satisfied");
    assert(outcome.fullyGreen === false, "expected the OVERALL run to be a failure despite a perfect test result");
  });

  await test("lifecycle: cleanup always runs strictly before the evidence-writing step is invoked, in real temporal order", async () => {
    let cleanupTrulyFinished = false;
    let sawCleanupFinishedInsideWriter = null;
    const outcome = await runLifecycle({
      runTests: async () => ({
        pipelineResult: { overallExitCode: 0, steps: goldenSteps(), aggregate: { passed: DB_ASSERTION_CONTRACT_TOTAL, total: DB_ASSERTION_CONTRACT_TOTAL } },
        contractEval: evaluateAssertionContract(goldenSteps()),
      }),
      cleanup: async () => {
        await sleep(20); // real async delay, so this can't pass by accident of synchronous ordering
        cleanupTrulyFinished = true;
        return { containerName: "fake-container", verified: true };
      },
      writeEvidenceIfGreen: async () => {
        sawCleanupFinishedInsideWriter = cleanupTrulyFinished;
      },
    });
    assert(sawCleanupFinishedInsideWriter === true, "the evidence-writing step ran before cleanup actually finished");
    assert(
      JSON.stringify(outcome.callOrder) === JSON.stringify(["runTests", "cleanup", "writeEvidenceIfGreen"]),
      `expected call order [runTests, cleanup, writeEvidenceIfGreen], got ${JSON.stringify(outcome.callOrder)}`,
    );
    assert(outcome.fullyGreen === true, "expected a fully clean run (perfect tests + verified cleanup) to be fullyGreen");
  });

  await test("lifecycle: cleanup still runs, and is still gated on, even when runTests() itself throws", async () => {
    let cleanupWasCalled = false;
    const outcome = await runLifecycle({
      runTests: async () => {
        throw new Error("simulated crash partway through running tests");
      },
      cleanup: async () => {
        cleanupWasCalled = true;
        return { containerName: "fake-container", verified: true };
      },
      writeEvidenceIfGreen: async () => {},
    });
    assert(cleanupWasCalled === true, "cleanup must still run as a safety net even when runTests() threw");
    assert(outcome.fullyGreen === false, "a run where runTests() threw can never be fullyGreen");
    assert(outcome.callOrder[0] === "runTests(threw)", "expected the call order to record that runTests threw");
  });

  await test("lifecycle: decideRunOutcome in isolation — all three of pipeline/contract/cleanup must be clean for fullyGreen", async () => {
    const perfectPipeline = { overallExitCode: 0 };
    const perfectContract = { ok: true, problems: [] };
    const perfectCleanup = { verified: true, containerName: "x" };

    assert(
      decideRunOutcome({ pipelineResult: perfectPipeline, contractEval: perfectContract, cleanupResult: perfectCleanup }).fullyGreen === true,
      "all three clean should be fullyGreen",
    );
    assert(
      decideRunOutcome({ pipelineResult: { overallExitCode: 1 }, contractEval: perfectContract, cleanupResult: perfectCleanup }).fullyGreen === false,
      "a nonzero pipeline exit code alone should fail the run",
    );
    assert(
      decideRunOutcome({ pipelineResult: perfectPipeline, contractEval: { ok: false, problems: ["x"] }, cleanupResult: perfectCleanup }).fullyGreen ===
        false,
      "an unsatisfied contract alone should fail the run",
    );
    assert(
      decideRunOutcome({ pipelineResult: perfectPipeline, contractEval: perfectContract, cleanupResult: { verified: false, containerName: "x" } })
        .fullyGreen === false,
      "an unverified cleanup alone should fail the run",
    );
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
