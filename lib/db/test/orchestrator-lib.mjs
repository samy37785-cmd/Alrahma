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
