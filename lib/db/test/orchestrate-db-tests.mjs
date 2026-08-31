// Stage 0 — DB Evidence and Test-Gate Remediation (+ Stage 0 Corrective).
//
// Single, self-contained, cross-platform command that replaces the old
// manual workflow (README's "docker run --name alrahma-local-test-pg -p
// 55432:5432 ...", run by hand, with the container/database left running
// and REUSED across invocations). That fixed name + fixed port + no
// teardown is the root cause of the previously-recorded 172/58 failure —
// see lib/db/test/README.md's "Root cause of the previously-recorded
// 172/58 failure (Stage 0)" section for the full diagnosis (this file
// used to point at docs/db-test-gate-root-cause.md, which was never
// actually created — that was a stale reference, fixed here to point at
// the real, existing writeup instead).
//
// This script:
//   1. Runs a MANDATORY, Docker-free self-test preflight
//      (test/orchestrator-failure-propagation.test.mjs) before anything
//      else — including before Docker is even touched. If the
//      orchestrator's own contract/cleanup-gating logic doesn't pass its
//      own proof, nothing downstream is trusted enough to run at all.
//      This is not an optional script a human has to remember to run
//      separately; `test:db` always runs it first.
//   2. Starts a brand-new, uniquely-named, disposable local Postgres
//      container (random name, random password, Docker-assigned free
//      host port bound to 127.0.0.1 only) — never a fixed name/port, so
//      concurrent/repeated runs can never collide with each other or with
//      any other container on the machine (including the unrelated,
//      already-running `supabase_*_option-a-rehearsal` stack).
//   3. Runs the checksum guard, then the migration apply (twice, to keep
//      proving the already-applied bookkeeping), then all 5 DB-backed
//      suites, in the same order `test:db` always used — via
//      orchestrator-lib.mjs's runPipeline(), which stops at the first
//      failing step and marks everything after it as genuinely skipped
//      (proven for real by orchestrator-failure-propagation.test.mjs).
//   4. Checks the result against the EXACT assertion contract
//      (orchestrator-lib.mjs's DB_ASSERTION_CONTRACT / evaluateAssertion
//      Contract()) — not just "did the naive sum look right". A missing,
//      duplicated, wrong-total, or summary-less required suite fails the
//      run even if some other naive sum would have looked fine.
//   5. ALWAYS tears the container down and VERIFIES it is actually gone
//      (docker stop → verify via docker ps → docker rm -f fallback →
//      re-verify) via orchestrator-lib.mjs's runLifecycle(), which
//      guarantees cleanup runs (success, failure, or a crash partway
//      through) and COMPLETES, with its outcome folded into the final
//      green/not-green decision, strictly BEFORE last-run-output.txt is
//      ever considered for writing.
//   6. Only ever writes lib/db/test/last-run-output.txt when called with
//      --write-evidence AND the run was fully, genuinely green (pipeline
//      exit 0 + exact contract satisfied + cleanup verified) — a failing,
//      partial, or cleanup-unverified run can never produce a file that
//      claims to be green, and the file always states the cleanup
//      verification explicitly.
//
// TEST_DATABASE_URL is ALWAYS self-generated here and always localhost/
// 127.0.0.1 (assertLocalOnly() enforces this before it's ever used) — any
// TEST_DATABASE_URL inherited from the parent shell's environment is
// deliberately ignored, never read, so this can never accidentally target
// a real database no matter what's set outside this process.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLocalOnly,
  DB_ASSERTION_CONTRACT_TOTAL,
  evaluateAssertionContract,
  interpretDockerPsResult,
  redact,
  runCommand,
  runLifecycle,
  runNode,
  runPipeline,
} from "./orchestrator-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPackageRoot = path.join(__dirname, "..");

const DB_NAME = "alrahma_test";
const PG_IMAGE = "postgres:16";
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;
const PORT_DISCOVERY_ATTEMPTS = 10;
const PORT_DISCOVERY_DELAY_MS = 500;

const writeEvidence = process.argv.includes("--write-evidence");

function nowIso() {
  return new Date().toISOString();
}

function generateContainerName() {
  return `alrahma-dbtest-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepScript(relPath) {
  return path.join(dbPackageRoot, relPath);
}

async function assertDockerAvailable() {
  const result = await runCommand("docker", ["version", "--format", "{{.Server.Version}}"]).catch((err) => {
    throw new Error(
      `Docker does not appear to be available on PATH (${err.message}). This orchestrator requires a local Docker ` +
        `daemon to create a disposable Postgres container; install/start Docker and try again.`,
    );
  });
  if (result.code !== 0) {
    throw new Error(`\`docker version\` exited ${result.code}: ${result.stderr.trim()}`);
  }
}

async function startDisposablePostgres(containerName) {
  const password = crypto.randomBytes(24).toString("hex");

  const run = await runCommand("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    containerName,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-e",
    `POSTGRES_DB=${DB_NAME}`,
    "-p",
    "127.0.0.1::5432",
    PG_IMAGE,
  ]);
  if (run.code !== 0) {
    throw new Error(`docker run failed (exit ${run.code}): ${run.stderr.trim()}`);
  }

  let hostPort = null;
  for (let attempt = 1; attempt <= PORT_DISCOVERY_ATTEMPTS; attempt++) {
    const portResult = await runCommand("docker", ["port", containerName, "5432/tcp"]);
    const match = portResult.stdout.trim().match(/:(\d+)\s*$/);
    if (portResult.code === 0 && match) {
      hostPort = match[1];
      break;
    }
    await sleep(PORT_DISCOVERY_DELAY_MS);
  }
  if (!hostPort) {
    throw new Error(`Could not discover the host port Docker assigned to container "${containerName}" (5432/tcp).`);
  }

  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    const check = await runCommand("docker", ["exec", containerName, "pg_isready", "-U", "postgres", "-d", DB_NAME]);
    if (check.code === 0) {
      ready = true;
      break;
    }
    await sleep(READY_POLL_MS);
  }
  if (!ready) {
    throw new Error(`Postgres in container "${containerName}" did not become ready within ${READY_TIMEOUT_MS}ms.`);
  }

  const url = `postgres://postgres:${password}@127.0.0.1:${hostPort}/${DB_NAME}`;
  assertLocalOnly(url, "self-generated TEST_DATABASE_URL");
  return url;
}

/**
 * Runs a single `docker ps -a --filter name=^<name>$ --format {{.Names}}`
 * presence check via `runCommandFn` and classifies it through
 * orchestrator-lib.mjs's `interpretDockerPsResult()` — a nonzero exit code
 * or a thrown error ALWAYS comes back as `presence: null` (unknown),
 * never `false` (absent). `runCommandFn` is injectable so this exact
 * function (not a re-implementation) can be exercised by self-tests
 * against a fake docker command runner, with no real Docker involved.
 */
export async function checkContainerPresence(containerName, runCommandFn) {
  try {
    const check = await runCommandFn("docker", ["ps", "-a", "--filter", `name=^${containerName}$`, "--format", "{{.Names}}"]);
    const interpreted = interpretDockerPsResult(check, containerName);
    return { ...interpreted, stderr: check.code !== 0 ? check.stderr.trim() : "" };
  } catch (err) {
    return { ...interpretDockerPsResult(null, containerName), stderr: `docker ps threw: ${err.message}` };
  }
}

/**
 * Stops, verifies-absent (via a real, independently-run, three-state
 * presence check — never collapsing a failed/unknown check into "absent"),
 * and (when the presence state is `true` OR genuinely `unknown`)
 * force-removes the disposable container as a fallback — capturing every
 * real docker exit code along the way rather than assuming success.
 * Returns a structured outcome; NEVER throws (a docker-command failure is
 * captured in the outcome, not swallowed — `verified` simply comes back
 * false and the caller decides what that means for the overall run).
 *
 * Sequence: docker stop → INITIAL presence check → (if present-or-unknown)
 * docker rm -f fallback → FINAL presence check, run independently
 * regardless of what the initial check or the rm fallback found.
 * `verified` is true ONLY when the FINAL check itself succeeded (exit
 * code 0) AND found the container genuinely absent — the final,
 * independently-confirmed state is what's authoritative, not whether an
 * earlier step (stop, or even rm) happened to report success.
 *
 * @param {string | null} containerName
 * @param {typeof runCommand} [runCommandFn] injectable for testing;
 *   defaults to the real orchestrator-lib.mjs runCommand() (real Docker).
 */
export async function cleanupDisposablePostgres(containerName, runCommandFn = runCommand) {
  const outcome = {
    containerName,
    stopExitCode: null,
    stopStderr: "",
    rmAttempted: false,
    rmExitCode: null,
    rmStderr: "",
    initialCheckExitCode: null,
    initialCheckStderr: "",
    initialPresence: null, // true | false | null (unknown)
    finalCheckExitCode: null,
    finalCheckStderr: "",
    finalPresence: null, // true | false | null (unknown)
    verified: false,
    error: null,
  };

  if (!containerName) {
    outcome.error = "no container name was ever generated (nothing to clean up)";
    // Vacuously true: there is genuinely nothing that could be present —
    // this is not a presence check at all, just "there was never a
    // container", so it is exempt from the "unknown != absent" rule.
    outcome.initialPresence = false;
    outcome.finalPresence = false;
    outcome.verified = true;
    return outcome;
  }

  try {
    const stopResult = await runCommandFn("docker", ["stop", containerName]);
    outcome.stopExitCode = stopResult.code;
    outcome.stopStderr = stopResult.stderr.trim();
  } catch (err) {
    outcome.error = `docker stop threw: ${err.message}`;
  }

  const initial = await checkContainerPresence(containerName, runCommandFn);
  outcome.initialCheckExitCode = initial.exitCode;
  outcome.initialCheckStderr = initial.stderr;
  outcome.initialPresence = initial.presence;
  if (initial.stderr) outcome.error = (outcome.error ? outcome.error + "; " : "") + `initial check: ${initial.stderr}`;

  // Only skip the rm -f fallback when the initial check gave a POSITIVE,
  // genuinely-confirmed "absent" result. Both "definitely still present"
  // AND "we don't actually know" (a failed/thrown ps) attempt the
  // fallback — an unknown state must never be treated as good enough to
  // skip cleanup.
  if (initial.presence === true || initial.presence === null) {
    outcome.rmAttempted = true;
    try {
      const rmResult = await runCommandFn("docker", ["rm", "-f", containerName]);
      outcome.rmExitCode = rmResult.code;
      outcome.rmStderr = rmResult.stderr.trim();
    } catch (err) {
      outcome.error = (outcome.error ? outcome.error + "; " : "") + `docker rm -f threw: ${err.message}`;
    }
  }

  // The final check ALWAYS runs, independently of everything above — it
  // is the authoritative source of truth `verified` is computed from.
  const final = await checkContainerPresence(containerName, runCommandFn);
  outcome.finalCheckExitCode = final.exitCode;
  outcome.finalCheckStderr = final.stderr;
  outcome.finalPresence = final.presence;
  if (final.stderr) outcome.error = (outcome.error ? outcome.error + "; " : "") + `final check: ${final.stderr}`;

  outcome.verified = final.exitCode === 0 && final.presence === false;
  return outcome;
}

/** Runs the mandatory, Docker-free orchestrator self-test. Its output is
 * clearly banner-wrapped so a human or a CI log scraper can never mistake
 * its deliberately-simulated failure lines for a real DB-suite failure —
 * this preflight always runs BEFORE any real suite, so nothing it prints
 * can be confused with a real result anyway, but the banners make that
 * true even for someone reading a raw log out of context. */
async function runMandatorySelfTestPreflight(log) {
  log("");
  log("========================================================================");
  log("=== MANDATORY ORCHESTRATOR SELF-TEST PREFLIGHT (not part of the 230 DB ===");
  log("=== assertions — proves the orchestrator's own contract/cleanup-gating ===");
  log("=== logic works, via REAL simulated child-process failures. Any 'FAIL'  ===");
  log("=== or 'SIMULATED-FAIL' text below this banner is an INTENTIONAL,       ===");
  log("=== deliberately-manufactured fixture, not a real defect.               ===");
  log("========================================================================");
  const result = await runNode(stepScript("test/orchestrator-failure-propagation.test.mjs"));
  log(result.stdout.replace(/\n$/, ""));
  if (result.stderr) log(`--- stderr ---\n${result.stderr.replace(/\n$/, "")}`);
  log("========================================================================");
  log(`=== END mandatory orchestrator self-test — exit ${result.code}. Real DB   ===`);
  log("=== suites have not started yet.                                        ===");
  log("========================================================================");
  log("");
  return result;
}

async function main() {
  if (process.env.TEST_DATABASE_URL) {
    console.log(
      "[orchestrator] NOTE: a TEST_DATABASE_URL is set in the parent environment; it is being IGNORED — " +
        "this orchestrator always creates and uses its own fresh, disposable database.",
    );
  }

  const transcriptLines = [];
  const log = (line) => {
    transcriptLines.push(line);
    console.log(line);
  };

  const selfTestResult = await runMandatorySelfTestPreflight(log);
  if (selfTestResult.code !== 0) {
    log(
      "FATAL: the mandatory orchestrator self-test preflight FAILED for real (not simulated) — refusing to start " +
        "Docker or run any DB suite. This means the orchestrator's own contract/cleanup-gating logic did not pass " +
        "its own proof; fix it before trusting any DB result from this tool.",
    );
    persistTranscript(transcriptLines);
    process.exitCode = 1;
    return;
  }

  await assertDockerAvailable();

  const containerName = generateContainerName();
  log(`=== Stage 0 DB test-gate orchestrator run — started ${nowIso()} ===`);
  log(`Container: ${containerName} (image ${PG_IMAGE}, bound to 127.0.0.1 only, random port, random password)`);

  let testDbUrl = null;

  // Wraps a step's run() so the FULL stdout/stderr it produced is
  // appended to the transcript (under a "=== <label> ===" header, same
  // convention the old hand-run last-run-output.txt used) — not just the
  // one-line OK/FAILED summary. Connection strings are already
  // password-redacted by every script that prints one (run-migrations.mjs,
  // and this file's own redact() calls below); nothing else here ever
  // prints a secret.
  function logged(label, resultPromise) {
    return resultPromise.then((result) => {
      transcriptLines.push(`\n=== ${label} ===`);
      if (result.stdout) transcriptLines.push(result.stdout.replace(/\n$/, ""));
      if (result.stderr) transcriptLines.push(`--- stderr ---\n${result.stderr.replace(/\n$/, "")}`);
      transcriptLines.push(`--- exit code: ${result.code} ---`);
      return result;
    });
  }

  const runTests = async () => {
    const steps = [
      {
        name: "published-migrations-checksum",
        run: () =>
          logged(
            "node test/published-migrations-checksum.test.mjs",
            runNode(stepScript("test/published-migrations-checksum.test.mjs")),
          ),
      },
      {
        name: "start-disposable-postgres",
        run: async () => {
          try {
            testDbUrl = await startDisposablePostgres(containerName);
            return logged(
              "start-disposable-postgres",
              Promise.resolve({ code: 0, stdout: `started; TEST_DATABASE_URL=${redact(testDbUrl)}\n`, stderr: "" }),
            );
          } catch (err) {
            return logged("start-disposable-postgres", Promise.resolve({ code: 1, stdout: "", stderr: err.message }));
          }
        },
      },
      {
        name: "run-migrations (1st)",
        run: () =>
          logged(
            "node test/run-migrations.mjs (1st)",
            runNode(stepScript("test/run-migrations.mjs"), { env: { ...process.env, TEST_DATABASE_URL: testDbUrl } }),
          ),
      },
      {
        name: "run-migrations (2nd, proves already-applied bookkeeping)",
        run: () =>
          logged(
            "node test/run-migrations.mjs (2nd, proves already-applied bookkeeping)",
            runNode(stepScript("test/run-migrations.mjs"), { env: { ...process.env, TEST_DATABASE_URL: testDbUrl } }),
          ),
      },
      {
        name: "schema.local.test.mjs",
        run: () =>
          logged(
            "node test/schema.local.test.mjs",
            runNode(stepScript("test/schema.local.test.mjs"), { env: { ...process.env, TEST_DATABASE_URL: testDbUrl } }),
          ),
      },
      {
        name: "rls.local.test.mjs",
        run: () =>
          logged(
            "node test/rls.local.test.mjs",
            runNode(stepScript("test/rls.local.test.mjs"), { env: { ...process.env, TEST_DATABASE_URL: testDbUrl } }),
          ),
      },
      {
        name: "rls-full-matrix.local.test.mjs",
        run: () =>
          logged(
            "node test/rls-full-matrix.local.test.mjs",
            runNode(stepScript("test/rls-full-matrix.local.test.mjs"), { env: { ...process.env, TEST_DATABASE_URL: testDbUrl } }),
          ),
      },
      {
        name: "acl.local.test.mjs",
        run: () =>
          logged(
            "node test/acl.local.test.mjs",
            runNode(stepScript("test/acl.local.test.mjs"), { env: { ...process.env, TEST_DATABASE_URL: testDbUrl } }),
          ),
      },
      {
        name: "upgrade-scenario.local.test.mjs",
        run: () =>
          logged(
            "node test/upgrade-scenario.local.test.mjs",
            runNode(stepScript("test/upgrade-scenario.local.test.mjs"), { env: { ...process.env, TEST_DATABASE_URL: testDbUrl } }),
          ),
      },
    ];

    const pipelineResult = await runPipeline(steps);

    log("");
    log("=== Step results ===");
    for (const s of pipelineResult.steps) {
      if (s.skipped) {
        log(`SKIPPED  ${s.name}`);
        continue;
      }
      const summary = s.total !== null ? ` (${s.passed}/${s.total} passed.)` : "";
      log(`${s.code === 0 ? "OK      " : "FAILED  "} ${s.name} — exit ${s.code}${summary}`);
    }

    const contractEval = evaluateAssertionContract(pipelineResult.steps);
    log("");
    log("=== Exact assertion contract ===");
    if (contractEval.ok) {
      log(`OK  exact contract satisfied: ${contractEval.aggregate.passed}/${contractEval.aggregate.total} (expected exactly ${contractEval.expectedGrandTotal})`);
    } else {
      log(`FAILED  exact contract NOT satisfied (expected exactly ${contractEval.expectedGrandTotal}):`);
      for (const p of contractEval.problems) log(`  - ${p}`);
    }
    log(`Naive pipeline aggregate (informational only, NOT the green/not-green judgment): ${pipelineResult.aggregate.passed}/${pipelineResult.aggregate.total}`);
    log(`Pipeline overall exit code: ${pipelineResult.overallExitCode}`);

    return { pipelineResult, contractEval };
  };

  const presenceLabel = (p) => (p === true ? "PRESENT" : p === false ? "ABSENT" : "UNKNOWN");

  const cleanup = async () => {
    log("");
    log(`=== cleanup: stopping and verifying removal of container "${containerName}" ===`);
    const cleanupResult = await cleanupDisposablePostgres(containerName);
    log(`docker stop: exit=${cleanupResult.stopExitCode ?? "(not run)"}`);
    log(`initial presence check: docker ps exit=${cleanupResult.initialCheckExitCode ?? "(not run)"} → ${presenceLabel(cleanupResult.initialPresence)}`);
    if (cleanupResult.rmAttempted) {
      log(`docker rm -f fallback attempted (initial state was PRESENT or UNKNOWN): exit=${cleanupResult.rmExitCode ?? "(threw)"}`);
    } else {
      log(`docker rm -f fallback: not attempted (initial presence check independently confirmed ABSENT already)`);
    }
    log(`final presence check (independent, authoritative): docker ps exit=${cleanupResult.finalCheckExitCode ?? "(not run)"} → ${presenceLabel(cleanupResult.finalPresence)}`);
    if (cleanupResult.verified) {
      log(`cleanup verified: container absent`);
    } else {
      log(
        `cleanup NOT verified: final check did not independently confirm absence ` +
          `(exit=${cleanupResult.finalCheckExitCode ?? "(not run)"}, presence=${presenceLabel(cleanupResult.finalPresence)}).` +
          `${cleanupResult.error ? ` (${cleanupResult.error})` : ""}`,
      );
      log(`MANUAL CLEANUP MAY BE REQUIRED — container name: ${containerName}`);
    }
    return cleanupResult;
  };

  const writeEvidenceIfGreen = async (outcome) => {
    log("");
    log(`Overall verdict: ${outcome.fullyGreen ? "FULLY GREEN" : "NOT fully green"}`);
    if (!outcome.fullyGreen) {
      for (const p of outcome.problems) log(`  - ${p}`);
      if (!outcome.cleanupResult?.verified) {
        log(`MANUAL CLEANUP MAY BE REQUIRED — container name: ${containerName}`);
      }
    }

    persistTranscript(transcriptLines);

    if (writeEvidence) {
      if (outcome.fullyGreen) {
        writeEvidenceFile(transcriptLines, outcome);
        console.log(`[orchestrator] --write-evidence: run was fully green (contract satisfied + cleanup verified), regenerated test/last-run-output.txt`);
      } else {
        console.error(
          `[orchestrator] --write-evidence was passed but this run was NOT fully green — refusing to touch ` +
            `test/last-run-output.txt. Problems:\n` +
            outcome.problems.map((p) => `  - ${p}`).join("\n"),
        );
      }
    }

    process.exitCode = outcome.fullyGreen ? 0 : outcome.pipelineResult?.overallExitCode || 1;
  };

  await runLifecycle({ runTests, cleanup, writeEvidenceIfGreen });
}

function persistTranscript(transcriptLines) {
  const logDir = path.join(__dirname, ".run-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${nowIso().replace(/[:.]/g, "-")}.txt`);
  fs.writeFileSync(logPath, transcriptLines.join("\n") + "\n");
  console.log(`\n[orchestrator] full transcript written to ${logPath}`);
}

function writeEvidenceFile(transcriptLines, outcome) {
  const header = [
    `Regenerated ${nowIso().slice(0, 10)} by orchestrate-db-tests.mjs (Stage 0 — DB Evidence and`,
    `Test-Gate Remediation, Stage 0 Corrective) against a genuinely fresh, disposable`,
    `local Postgres container created and torn down by THIS run — never a reused`,
    `container/database.`,
    ``,
    `This is a point-in-time snapshot of a run that was independently verified against`,
    `the EXACT assertion contract (not a naive sum): ${outcome.contractEval.aggregate.passed}/${outcome.contractEval.aggregate.total}`,
    `(expected exactly ${DB_ASSERTION_CONTRACT_TOTAL}), every required suite present exactly`,
    `once with its own exact expected total, every step's own exit code 0, no step`,
    `skipped.`,
    ``,
    `cleanup verified: container absent`,
    ``,
    `It goes stale again after any future migration or test change and should be`,
    `regenerated alongside one — same discipline as`,
    `test/published-migrations-checksum.test.mjs's own manifest.`,
    ``,
  ].join("\n");
  const evidencePath = path.join(__dirname, "last-run-output.txt");
  fs.writeFileSync(evidencePath, header + transcriptLines.join("\n") + "\n");
}

// Only run main() when this file is executed directly (node
// orchestrate-db-tests.mjs / pnpm run test:db) — NOT when it's imported
// for its exports (cleanupDisposablePostgres, checkContainerPresence) by
// orchestrator-failure-propagation.test.mjs's dependency-injection
// self-tests, which must never spin up a real Docker container.
const isMainModule = path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "");
if (isMainModule) {
  main().catch((err) => {
    console.error("[orchestrator] FAILED:", err);
    process.exitCode = 1;
  });
}
