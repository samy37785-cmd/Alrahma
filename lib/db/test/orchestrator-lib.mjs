// Stage 0 — DB Evidence and Test-Gate Remediation.
//
// Reusable, DB/Docker-agnostic primitives for orchestrate-db-tests.mjs,
// factored out into their own module so orchestrator-failure-propagation
// .test.mjs can exercise the REAL pipeline-execution/fail-fast logic
// directly (import the same runPipeline() the real orchestrator uses)
// instead of re-implementing a parallel copy that could silently drift
// from what actually runs. Nothing in this file touches Docker, Postgres,
// or any network resource — it only spawns local Node child processes and
// parses their output/exit codes.

import { spawn } from "node:child_process";

/** Redacts a password out of a postgres connection string for safe
 * logging — same regex convention already used by run-migrations.mjs. */
export function redact(connectionString) {
  return connectionString.replace(/:[^:@]*@/, ":***@");
}

// ===========================================================================
// Docker container-presence classification (Stage 0 Final Corrective)
// ===========================================================================
//
// An earlier cleanup implementation collapsed `docker ps`'s own exit code
// into the SAME boolean as "container absent": `check.code === 0 &&
// check.stdout.trim() === containerName` — if `docker ps` itself failed
// (nonzero exit, or the command couldn't even be spawned), that expression
// evaluates to `false`, which was then read as "not present" and could
// make a failed presence check look like verified absence. That is a
// fail-OPEN bug: not knowing whether a container is gone must never be
// treated the same as confirming it's gone. `interpretDockerPsResult()`
// below is the fix — a pure, Docker-agnostic function (no child process,
// directly unit-testable) that classifies a `docker ps`-shaped result (or
// the absence of one, if the command threw) into a strict three-state
// presence: `true` / `false` / `null` (unknown) — never silently
// downgrading "unknown" to "false".

/**
 * Classifies a `docker ps -a --filter name=^<name>$ --format {{.Names}}`
 * result into presence `true` (docker ps succeeded AND the name is
 * listed), `false` (docker ps succeeded AND the name is NOT listed), or
 * `null` — UNKNOWN — for anything else: a nonzero exit code, or no result
 * at all (pass `null` for `result` when the command itself threw). A
 * nonzero exit code or a missing result must NEVER be interpreted as
 * `false` — that would silently turn "we don't know" into "it's gone",
 * exactly the fail-open bug this function exists to prevent.
 *
 * @param {{code: number, stdout: string} | null} result the resolved
 *   `{code, stdout}` from running the `docker ps` command, or `null` if
 *   the command itself could not be run at all (it threw).
 * @param {string} containerName the exact container name being checked.
 * @returns {{presence: boolean | null, exitCode: number | null}}
 */
export function interpretDockerPsResult(result, containerName) {
  if (!result) {
    return { presence: null, exitCode: null };
  }
  if (result.code !== 0) {
    return { presence: null, exitCode: result.code };
  }
  return { presence: result.stdout.trim() === containerName, exitCode: result.code };
}

/** Throws unless `connectionString`'s host is exactly localhost/127.0.0.1.
 * This is intentionally a SEPARATE implementation from local-harness.mjs's
 * assertLocalHost() (which every test script already calls on its own) —
 * defense in depth at the orchestrator layer too, so a bug in one guard
 * can't silently remove the only guard. */
export function assertLocalOnly(connectionString, label = "connection string") {
  let host;
  try {
    host = new URL(connectionString).hostname;
  } catch (err) {
    throw new Error(`Refusing to run: ${label} is not a valid URL (${err.message}).`);
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1. ` +
        `This orchestrator only ever targets a disposable local database.`,
    );
  }
}

/** Runs `node <scriptPath> [...args]` as a child process, streaming
 * stdout/stderr live to this process's own stdout/stderr (so a human
 * watching the run sees progress in real time) while also buffering both
 * streams so the caller gets the full text back for parsing/logging.
 * Resolves with {code, stdout, stderr, durationMs} — never rejects on a
 * nonzero exit code (that's a normal, expected outcome the caller decides
 * how to handle), only rejects if the process itself could not be spawned
 * at all (e.g. node missing). */
export function runNode(scriptPath, { args = [], env = process.env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [scriptPath, ...args], { env, cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr, durationMs: Date.now() - startedAt });
    });
  });
}

/** Same contract as runNode(), but for an arbitrary external command
 * (e.g. `docker`) rather than a Node script. */
export function runCommand(command, args = [], { env = process.env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { env, cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr, durationMs: Date.now() - startedAt });
    });
  });
}

/** Parses the trailing "N/M passed." line every test/*.local.test.mjs
 * script (and published-migrations-checksum.test.mjs) prints. Returns
 * {passed, total} from the LAST match in the text (defensive against any
 * earlier incidental text that happens to match), or null if no such line
 * is present (e.g. a script that isn't a counted assertion suite, like
 * run-migrations.mjs). */
export function parseSummaryLine(text) {
  const matches = [...text.matchAll(/(\d+)\/(\d+) passed\./g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return { passed: Number(last[1]), total: Number(last[2]) };
}

/**
 * Executes `steps` (each `{name, run: async () => {code, stdout, stderr}}`)
 * strictly in order. The FIRST step whose `run()` resolves with a nonzero
 * `code` stops the pipeline immediately — every remaining step is recorded
 * as `skipped: true` and its `run()` is never called (proven, not just
 * asserted, by orchestrator-failure-propagation.test.mjs, which checks
 * for a real side effect the skipped step's run() would have produced).
 *
 * Returns `{ overallExitCode, steps: [{name, ran, skipped, code, passed,
 * total, durationMs}], aggregate: {passed, total} }`. `aggregate` sums
 * `parseSummaryLine()`'s {passed,total} across every step that produced
 * one (steps with no such line, e.g. a plain migration-apply step, are
 * excluded from the aggregate rather than counted as 0/0).
 *
 * NOTE: this raw `aggregate` is intentionally naive (a sum with no notion
 * of "which suites are actually required" or "did any of them go
 * missing") — it is NOT, on its own, a safe definition of "the run was
 * green". A run that silently drops a suite's summary (e.g. a crash that
 * still exits 0, or a renamed step) can still show `passed === total`
 * here even though the true 230-assertion total was never reached. Use
 * `evaluateAssertionContract()` below for that judgment; this function
 * stays a dumb, honest summary of what actually ran.
 */
export async function runPipeline(steps) {
  const results = [];
  let overallExitCode = 0;
  let stopped = false;

  for (const step of steps) {
    if (stopped) {
      results.push({ name: step.name, ran: false, skipped: true, code: null, passed: null, total: null, durationMs: 0 });
      continue;
    }
    const { code, stdout, durationMs } = await step.run();
    const summary = parseSummaryLine(stdout);
    results.push({
      name: step.name,
      ran: true,
      skipped: false,
      code,
      passed: summary?.passed ?? null,
      total: summary?.total ?? null,
      durationMs,
    });
    if (code !== 0) {
      overallExitCode = code;
      stopped = true;
    }
  }

  const aggregate = results.reduce(
    (acc, r) => {
      if (r.total !== null) {
        acc.passed += r.passed;
        acc.total += r.total;
      }
      return acc;
    },
    { passed: 0, total: 0 },
  );

  return { overallExitCode, steps: results, aggregate };
}

// ===========================================================================
// Exact assertion contract (Stage 0 Corrective, finding 1)
// ===========================================================================
//
// A prior version of this orchestrator treated a run as "fully green"
// whenever `aggregate.passed === aggregate.total` from runPipeline() above.
// An independent review found that check is too weak: it would happily
// accept e.g. 163/163 if one required suite's summary line silently went
// missing (a crash that still exits 0, a step renamed without updating this
// file, etc.) — `passed === total` stays true even though the *expected*
// 230 was never reached. `evaluateAssertionContract()` below is the fix: it
// names every required suite AND its exact expected total up front, and
// fails the run if any required suite is missing, duplicated, exited
// nonzero, produced no readable summary, or reported a total other than
// the one named here — not just if the naive sum looks wrong.

/** The exact, non-negotiable set of DB-backed assertion suites `test:db`
 * must run, each exactly once, each with its own exact expected total.
 * This list — not the sum alone — is the source of truth for "did the
 * real 230-assertion suite actually run correctly". Keep this in sync
 * with lib/db/test/README.md's own stated total whenever a suite's
 * assertion count changes. */
export const DB_ASSERTION_CONTRACT = [
  { name: "published-migrations-checksum", expectedTotal: 4 },
  { name: "schema.local.test.mjs", expectedTotal: 67 },
  { name: "rls.local.test.mjs", expectedTotal: 71 },
  { name: "rls-full-matrix.local.test.mjs", expectedTotal: 61 },
  { name: "acl.local.test.mjs", expectedTotal: 18 },
  { name: "upgrade-scenario.local.test.mjs", expectedTotal: 9 },
];

export const DB_ASSERTION_CONTRACT_TOTAL = DB_ASSERTION_CONTRACT.reduce((sum, s) => sum + s.expectedTotal, 0);

/**
 * Checks `steps` (the `.steps` array runPipeline() returns) against
 * `contract` (defaults to DB_ASSERTION_CONTRACT). Returns `{ ok, problems,
 * perSuite, aggregate, expectedGrandTotal }`.
 *
 * `ok` is true ONLY if, for every required suite: it appears in `steps`
 * exactly once; that occurrence was not skipped; its exit code was 0; it
 * produced a readable "N/M passed." summary; that total exactly equals
 * the contract's expectedTotal for it; and passed === total (all of them
 * actually passed, not just the right count). It is additionally false if
 * any step outside the contract produced its own summary line (an
 * unaccounted-for suite silently contributing to a sum is exactly the
 * failure mode this function exists to catch) or if the resulting sum
 * doesn't equal `DB_ASSERTION_CONTRACT_TOTAL` — a belt-and-suspenders
 * check in case a future edit to this list drifts from its own sum.
 */
export function evaluateAssertionContract(steps, contract = DB_ASSERTION_CONTRACT) {
  const problems = [];
  const perSuite = [];
  const nameCounts = new Map();
  for (const s of steps) {
    nameCounts.set(s.name, (nameCounts.get(s.name) ?? 0) + 1);
  }

  let sumPassed = 0;
  let sumTotal = 0;

  for (const required of contract) {
    const count = nameCounts.get(required.name) ?? 0;
    if (count === 0) {
      problems.push(`missing required suite "${required.name}" (expected exactly once, found 0)`);
      perSuite.push({ name: required.name, status: "missing" });
      continue;
    }
    if (count > 1) {
      problems.push(`required suite "${required.name}" appears ${count} times (expected exactly once)`);
    }
    for (const occ of steps.filter((s) => s.name === required.name)) {
      if (occ.skipped) {
        problems.push(`required suite "${required.name}" was skipped (an earlier step must have failed first)`);
        perSuite.push({ name: required.name, status: "skipped" });
        continue;
      }
      if (occ.code !== 0) {
        problems.push(`required suite "${required.name}" exited ${occ.code} (expected 0)`);
      }
      if (occ.total === null) {
        problems.push(`required suite "${required.name}" produced no readable "N/M passed." summary`);
        perSuite.push({ name: required.name, status: "no-summary", code: occ.code });
        continue;
      }
      if (occ.total !== required.expectedTotal) {
        problems.push(`required suite "${required.name}" reported total ${occ.total}, expected exactly ${required.expectedTotal}`);
      }
      if (occ.passed !== occ.total) {
        problems.push(`required suite "${required.name}" reported ${occ.passed}/${occ.total} passed (not all of them passed)`);
      }
      perSuite.push({ name: required.name, status: "ran", passed: occ.passed, total: occ.total, code: occ.code });
      if (occ.code === 0 && occ.total === required.expectedTotal && occ.passed === occ.total) {
        sumPassed += occ.passed;
        sumTotal += occ.total;
      }
    }
  }

  const contractNames = new Set(contract.map((c) => c.name));
  for (const s of steps) {
    if (!contractNames.has(s.name) && s.total !== null) {
      problems.push(
        `step "${s.name}" produced a "N/M passed." summary but is not part of the assertion contract — it would silently ` +
          `inflate an aggregate that didn't account for it`,
      );
    }
  }

  const expectedGrandTotal = DB_ASSERTION_CONTRACT_TOTAL;
  if (problems.length === 0 && sumTotal !== expectedGrandTotal) {
    problems.push(`aggregate total ${sumTotal} does not equal the expected contract total ${expectedGrandTotal}`);
  }

  return { ok: problems.length === 0, problems, perSuite, aggregate: { passed: sumPassed, total: sumTotal }, expectedGrandTotal };
}

// ===========================================================================
// Cleanup-before-evidence lifecycle (Stage 0 Corrective, finding 2)
// ===========================================================================
//
// A prior version could write last-run-output.txt before its `finally`
// block had actually torn the disposable container down and verified it
// was gone — the write and the cleanup were sequenced independently, not
// causally. runLifecycle() below makes the ordering structural: cleanup()
// is ALWAYS invoked (mirroring a try/finally's unconditional-execution
// guarantee, including when runTests() throws) and its verified result is
// always fully resolved and folded into the green/not-green decision
// BEFORE writeEvidenceIfGreen() is ever called — there is no code path
// that can reach the evidence-writing step without cleanup having already
// completed and its outcome having already been decided.

/** Folds a pipeline result + assertion-contract evaluation + cleanup
 * outcome into one final decision. A run is `fullyGreen` only if ALL
 * three are clean: the pipeline's own overall exit code was 0, the exact
 * assertion contract was satisfied, AND cleanup was verified (the
 * disposable container is confirmed absent). Any one of these failing is
 * enough to fail the whole run — cleanup failure alone fails an otherwise
 * perfect test result, exactly as required. */
export function decideRunOutcome({ pipelineResult, contractEval, cleanupResult }) {
  const problems = [];
  if (!pipelineResult || pipelineResult.overallExitCode !== 0) {
    problems.push(`pipeline overall exit code ${pipelineResult ? pipelineResult.overallExitCode : "(pipeline never completed)"}`);
  }
  if (!contractEval || !contractEval.ok) {
    for (const p of contractEval?.problems ?? ["assertion contract was never evaluated"]) {
      problems.push(`contract: ${p}`);
    }
  }
  if (!cleanupResult || !cleanupResult.verified) {
    problems.push(
      `cleanup not verified for container "${cleanupResult?.containerName ?? "(unknown)"}"` +
        (cleanupResult?.error ? ` — ${cleanupResult.error}` : " — it may still be running; manual cleanup may be required"),
    );
  }
  return { fullyGreen: problems.length === 0, problems };
}

/**
 * The real run-then-cleanup-then-decide-then-maybe-write-evidence
 * lifecycle, shared by the real orchestrator and its self-tests (so a
 * self-test exercises this exact function, never a re-implementation of
 * it — same discipline as runPipeline() and
 * orchestrator-failure-propagation.test.mjs).
 *
 * Call order is unconditional and fixed: `runTests()` → `cleanup()` (even
 * if `runTests()` threw) → `decideRunOutcome()` → `writeEvidenceIfGreen()`
 * — always exactly in that order, always all four stages reached (the
 * last one receives a `fullyGreen: false` outcome rather than being
 * skipped, so it can still log/report on a failed run; it is
 * `writeEvidenceIfGreen`'s own responsibility to check `outcome.fullyGreen`
 * before writing anything, which keeps this function generic and keeps
 * "did we actually write" independently observable/testable by a caller
 * wrapping it).
 *
 * @param {() => Promise<{pipelineResult: any, contractEval: any}>} runTests
 * @param {(pipelineResult: any | undefined) => Promise<any>} cleanup
 * @param {(outcome: {fullyGreen: boolean, problems: string[], pipelineResult: any, contractEval: any, cleanupResult: any, callOrder: string[]}) => Promise<void> | void} writeEvidenceIfGreen
 */
export async function runLifecycle({ runTests, cleanup, writeEvidenceIfGreen }) {
  const callOrder = [];
  let runError = null;
  let testOutcome = null;

  try {
    testOutcome = await runTests();
    callOrder.push("runTests");
  } catch (err) {
    runError = err;
    callOrder.push("runTests(threw)");
  }

  // Unconditional — mirrors a try/finally's guarantee. Cleanup failures
  // are captured in cleanupResult (never thrown away/ignored) rather than
  // swallowed: they flow straight into decideRunOutcome() below and can
  // fail the whole run.
  const cleanupResult = await cleanup(testOutcome?.pipelineResult);
  callOrder.push("cleanup");

  let outcome;
  if (runError) {
    outcome = {
      fullyGreen: false,
      problems: [`runTests() threw: ${runError.message}`],
      pipelineResult: testOutcome?.pipelineResult ?? null,
      contractEval: testOutcome?.contractEval ?? null,
      cleanupResult,
      callOrder,
      runError,
    };
  } else {
    const decision = decideRunOutcome({
      pipelineResult: testOutcome.pipelineResult,
      contractEval: testOutcome.contractEval,
      cleanupResult,
    });
    outcome = { ...decision, pipelineResult: testOutcome.pipelineResult, contractEval: testOutcome.contractEval, cleanupResult, callOrder };
  }

  await writeEvidenceIfGreen(outcome);
  callOrder.push("writeEvidenceIfGreen");

  return outcome;
}
