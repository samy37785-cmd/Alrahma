// Windows Migration Gate Cross-Platform Corrective (2026-09-03).
//
// Self-tests for the pure classifiers in published-migrations-lib.mjs —
// the same convention orchestrator-failure-propagation.test.mjs already
// uses for orchestrator-lib.mjs's interpretDockerPsResult: construct the
// {status, stdout, stderr, error}-shaped result a git command would
// produce, without actually running git or touching any real migration
// file, and assert the classifier's outcome. This is deterministic and
// fast, and it is what actually proves the fix — not an explanation that
// the old 0/4 was "just" an environment issue.
//
// No database, no Docker, no Supabase, no network. No migration SQL is
// read, run, or modified by this file.
//
// Run: node test/published-migrations-checksum-selftest.test.mjs

import crypto from "node:crypto";
import {
  classifyBlobChecksum,
  classifyTrackedModification,
} from "./published-migrations-lib.mjs";

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

let failed = 0;
function check(label, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!pass) failed++;
}

// ---------------------------------------------------------------------
// 1. Git blob correct → PASS
// ---------------------------------------------------------------------
{
  const content = Buffer.from("CREATE TABLE example ();\n", "utf8");
  const expected = sha256(content);
  const result = { status: 0, stdout: content, stderr: Buffer.alloc(0) };
  const outcome = classifyBlobChecksum(result, expected);
  check("1. correct Git blob classifies as pass", outcome.outcome, "pass");
  check("1. correct Git blob returns the matching sha256", outcome.actualSha256, expected);
}

// ---------------------------------------------------------------------
// 2. Checksum mismatch → FAIL
// ---------------------------------------------------------------------
{
  const committedContent = Buffer.from("CREATE TABLE example ();\n", "utf8");
  const editedContent = Buffer.from("CREATE TABLE example (id INT);\n", "utf8");
  const expected = sha256(committedContent);
  const result = { status: 0, stdout: editedContent, stderr: Buffer.alloc(0) };
  const outcome = classifyBlobChecksum(result, expected);
  check("2. a genuinely different committed blob classifies as checksum-mismatch", outcome.outcome, "checksum-mismatch");
}

// ---------------------------------------------------------------------
// 3. `git show` failure (command could not run at all) → FAIL
// ---------------------------------------------------------------------
{
  const resultThrown = { error: new Error("spawnSync ENOENT: git not found") };
  const outcomeThrown = classifyBlobChecksum(resultThrown, "irrelevant");
  check("3a. git show that could not be spawned classifies as git-show-failed", outcomeThrown.outcome, "git-show-failed");

  const outcomeNull = classifyBlobChecksum(null, "irrelevant");
  check("3b. a null result (command never ran) classifies as git-show-failed", outcomeNull.outcome, "git-show-failed");
}

// ---------------------------------------------------------------------
// 4. Missing migration (path does not exist at HEAD) → FAIL
// ---------------------------------------------------------------------
{
  const result = {
    status: 128,
    stdout: Buffer.alloc(0),
    stderr: Buffer.from("fatal: path 'lib/db/drizzle/9999_ghost.sql' does not exist in 'HEAD'\n", "utf8"),
  };
  const outcome = classifyBlobChecksum(result, "irrelevant");
  check("4. a path missing at HEAD classifies as missing-at-head, not pass", outcome.outcome, "missing-at-head");
}

// ---------------------------------------------------------------------
// 5. CRLF working-tree checkout with an LF Git blob → PASS, as long as
//    the Git blob is correct and there is no tracked diff. `git show
//    HEAD:<path>` always returns git's own LF-normalized blob regardless
//    of the working-tree's checked-out line endings, and `git diff`'s
//    own CRLF-awareness (core.autocrlf) reports no difference for a pure
//    line-ending artifact — so both checks pass exactly as they would on
//    a Linux/macOS checkout of the identical commit.
// ---------------------------------------------------------------------
{
  const committedLfContent = Buffer.from("CREATE TABLE example (\n  id INT\n);\n", "utf8");
  const expected = sha256(committedLfContent);

  // git show HEAD:<path> is unaffected by the working tree's line
  // endings — it always returns the blob as committed (LF here).
  const blobResult = { status: 0, stdout: committedLfContent, stderr: Buffer.alloc(0) };
  const blobOutcome = classifyBlobChecksum(blobResult, expected);
  check("5a. Git blob (LF, as committed) still matches despite a CRLF working-tree checkout", blobOutcome.outcome, "pass");

  // git diff --quiet HEAD normalizes CRLF/LF via core.autocrlf, so a
  // pure line-ending checkout artifact reports exit 0 (clean), not 1.
  const diffResult = { status: 0, stderr: "" };
  const diffOutcome = classifyTrackedModification(diffResult);
  check("5b. git diff reports clean for a pure CRLF line-ending checkout artifact", diffOutcome.outcome, "clean");
}

// ---------------------------------------------------------------------
// 6. Tracked migration modification (real edit, committed or staged or
//    unstaged) → FAIL, even when the blob-at-HEAD check alone would not
//    catch it (an uncommitted edit doesn't change what HEAD's blob is).
// ---------------------------------------------------------------------
{
  const diffResult = { status: 1, stderr: "" };
  const diffOutcome = classifyTrackedModification(diffResult);
  check("6. a real tracked diff against HEAD classifies as modified, not clean", diffOutcome.outcome, "modified");
}

// ---------------------------------------------------------------------
// Extra: the diff check itself fails closed the same way the blob check
// does — a git error must never silently read as "clean".
// ---------------------------------------------------------------------
{
  const outcomeThrown = classifyTrackedModification({ error: new Error("spawnSync ENOENT") });
  check("extra. git diff that could not be spawned classifies as diff-check-failed, not clean", outcomeThrown.outcome, "diff-check-failed");

  const outcomeWeirdExit = classifyTrackedModification({ status: 128, stderr: "fatal: bad revision 'HEAD'" });
  check("extra. an unexpected git diff exit code classifies as diff-check-failed, not clean", outcomeWeirdExit.outcome, "diff-check-failed");
}

console.log(`\n${failed === 0 ? "All" : `${failed} of the`} self-tests ${failed === 0 ? "passed" : "FAILED"}.`);
if (failed > 0) process.exit(1);
