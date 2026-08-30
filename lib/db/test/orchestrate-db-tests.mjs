// Stage 0 — DB Evidence and Test-Gate Remediation.
//
// Single, self-contained, cross-platform command that replaces the old
// manual workflow (README's "docker run --name alrahma-local-test-pg -p
// 55432:5432 ...", run by hand, with the container/database left running
// and REUSED across invocations). That fixed name + fixed port + no
// teardown is the root cause diagnosed in docs/db-test-gate-root-cause.md
// (see also the "Root cause" section this task's chat report reproduces):
// seed fixtures with hard-coded unique values (a specific plan slug, a
// specific admin email, ...) collide with identical rows already
// committed by an EARLIER run against the same still-running container,
// producing "duplicate key value violates unique constraint" — a
// test-isolation bug, not a SQL/RLS regression (proven in this task by
// getting a genuinely fresh, disposable database to pass 230/230 twice
// in a row; see Run A / Run B in the chat report).
//
// This script:
//   1. Starts a brand-new, uniquely-named, disposable local Postgres
//      container (random name, random password, Docker-assigned free
//      host port bound to 127.0.0.1 only) — never a fixed name/port, so
//      concurrent/repeated runs can never collide with each other or with
//      any other container on the machine (including the unrelated,
//      already-running `supabase_*_option-a-rehearsal` stack).
//   2. Runs the checksum guard, then the migration apply (twice, to keep
//      proving the already-applied bookkeeping), then all 5 DB-backed
//      suites, in the same order `test:db` always used — via
//      orchestrator-lib.mjs's runPipeline(), which stops at the first
//      failing step and marks everything after it as genuinely skipped
//      (proven for real by orchestrator-failure-propagation.test.mjs).
//   3. ALWAYS tears the container down in a `finally` — success, failure,
//      or a crash partway through — so nothing is ever left running.
//   4. Only ever writes lib/db/test/last-run-output.txt when called with
//      --write-evidence AND the run was fully, genuinely green (see
//      writeEvidenceFile() below) — a failing or partial run can never
//      produce a file that claims to be green.
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
import { assertLocalOnly, redact, runCommand, runNode, runPipeline } from "./orchestrator-lib.mjs";

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

async function stopDisposablePostgres(containerName) {
  if (!containerName) return;
  try {
    await runCommand("docker", ["stop", containerName]);
  } catch (err) {
    console.error(`[cleanup] docker stop ${containerName} failed: ${err.message}`);
  }
  // --rm should have auto-removed the container on stop; verify, and
  // force-remove as a fallback so nothing is ever left behind either way.
  try {
    const check = await runCommand("docker", ["ps", "-a", "--filter", `name=^${containerName}$`, "--format", "{{.Names}}"]);
    if (check.stdout.trim() === containerName) {
      console.error(`[cleanup] container "${containerName}" was still present after stop; forcing removal.`);
      await runCommand("docker", ["rm", "-f", containerName]);
    }
  } catch (err) {
    console.error(`[cleanup] post-stop verification failed: ${err.message}`);
  }
}

function stepScript(relPath) {
  return path.join(dbPackageRoot, relPath);
}

async function main() {
  if (process.env.TEST_DATABASE_URL) {
    console.log(
      "[orchestrator] NOTE: a TEST_DATABASE_URL is set in the parent environment; it is being IGNORED — " +
        "this orchestrator always creates and uses its own fresh, disposable database.",
    );
  }

  await assertDockerAvailable();

  const containerName = generateContainerName();
  const transcriptLines = [];
  const log = (line) => {
    transcriptLines.push(line);
    console.log(line);
  };

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

  try {
    const steps = [
      {
        name: "published-migrations-checksum",
        run: () => logged("node test/published-migrations-checksum.test.mjs", runNode(stepScript("test/published-migrations-checksum.test.mjs"))),
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

    const result = await runPipeline(steps);

    log("");
    log("=== Step results ===");
    for (const s of result.steps) {
      if (s.skipped) {
        log(`SKIPPED  ${s.name}`);
        continue;
      }
      const summary = s.total !== null ? ` (${s.passed}/${s.total} passed.)` : "";
      log(`${s.code === 0 ? "OK      " : "FAILED  "} ${s.name} — exit ${s.code}${summary}`);
    }
    log("");
    log(`Aggregate assertions: ${result.aggregate.passed}/${result.aggregate.total} passed.`);
    log(`Overall exit code: ${result.overallExitCode}`);

    const fullyGreen =
      result.overallExitCode === 0 &&
      result.aggregate.total > 0 &&
      result.aggregate.passed === result.aggregate.total &&
      result.steps.every((s) => !s.skipped);

    // Always persist a full transcript of this run, success or failure,
    // under a gitignored per-run log directory — this is separate from,
    // and always written before any decision about, last-run-output.txt.
    const logDir = path.join(__dirname, ".run-logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `${nowIso().replace(/[:.]/g, "-")}.txt`);
    fs.writeFileSync(logPath, transcriptLines.join("\n") + "\n");
    console.log(`\n[orchestrator] full transcript written to ${logPath}`);

    if (writeEvidence) {
      if (fullyGreen) {
        writeEvidenceFile(transcriptLines, result);
        console.log(`[orchestrator] --write-evidence: run was fully green, regenerated test/last-run-output.txt`);
      } else {
        console.error(
          `[orchestrator] --write-evidence was passed but this run was NOT fully green ` +
            `(overallExitCode=${result.overallExitCode}, aggregate=${result.aggregate.passed}/${result.aggregate.total}, ` +
            `skipped=${result.steps.filter((s) => s.skipped).length}) — refusing to touch test/last-run-output.txt.`,
        );
      }
    }

    process.exitCode = result.overallExitCode;
  } finally {
    await stopDisposablePostgres(containerName);
  }
}

function writeEvidenceFile(transcriptLines, result) {
  const header = [
    `Regenerated ${nowIso().slice(0, 10)} by orchestrate-db-tests.mjs (Stage 0 — DB Evidence and`,
    `Test-Gate Remediation) against a genuinely fresh, disposable local Postgres`,
    `container created and torn down by THIS run — never a reused container/database.`,
    `This is a point-in-time snapshot of a run that was independently verified to be`,
    `fully green (aggregate ${result.aggregate.passed}/${result.aggregate.total}, every`,
    `step's own exit code 0, no step skipped). It goes stale again after any future`,
    `migration or test change and should be regenerated alongside one — same`,
    `discipline as test/published-migrations-checksum.test.mjs's own manifest.`,
    ``,
  ].join("\n");
  const evidencePath = path.join(__dirname, "last-run-output.txt");
  fs.writeFileSync(evidencePath, header + transcriptLines.join("\n") + "\n");
}

main().catch((err) => {
  console.error("[orchestrator] FAILED:", err);
  process.exitCode = 1;
});
