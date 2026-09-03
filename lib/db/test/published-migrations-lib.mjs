// Windows Migration Gate Cross-Platform Corrective (2026-09-03).
//
// The published-migrations-checksum gate exists to protect committed
// migrations 0000-0003 from ever being edited — see
// published-migrations-checksum.test.mjs's own header for the original
// motivation (a review of RLS Remediation Round 4 found nothing else in
// this suite actually verified that). Its original implementation hashed
// fs.readFileSync(path) directly: raw working-tree bytes. On a Windows
// checkout with core.autocrlf=true, these .sql files are checked out with
// CRLF line endings while the committed Git blob (and this script's
// hardcoded MANIFEST) was recorded from LF content — so the raw-bytes
// hash differs from the manifest even though the committed content is
// byte-identical, and the gate went red (0/4) for a reason that has
// nothing to do with an actual edit.
//
// The fix: hash the Git blob at HEAD (`git show HEAD:<path>`), which is
// git's own internal, line-ending-normalized object — the exact bytes
// that were committed, on any platform, checkout settings notwithstanding.
// That alone is not a complete guard, though: it only reflects the last
// COMMIT, so a working-tree edit that hasn't been committed yet (staged
// or not) would sail through undetected. A second, independent check —
// `git diff --quiet HEAD -- <path>` — confirms the working tree carries
// no tracked modification relative to HEAD at all. git's own diff engine
// is CRLF-aware (the same normalization that makes `git status`/`git
// diff` already report these files as unmodified even though their raw
// working-tree bytes are CRLF), so a pure line-ending checkout artifact
// does not trip this check, but a real content edit — committed or still
// only sitting in the working tree — does.
//
// Both classifiers below are pure functions over an already-run command's
// {status, stdout, stderr, error}-shaped result (the same
// dependency-injectable pattern orchestrator-lib.mjs's
// interpretDockerPsResult uses for docker ps), so they can be unit-tested
// with constructed fixtures — no real git process, no real repo — in
// published-migrations-checksum-selftest.test.mjs. Like that function,
// neither classifier here ever treats "the command didn't run" or "the
// command errored" as equivalent to a pass — a fail-closed contract by
// construction, not by remembering to check every call site.
//
// The thin git-spawning wrappers (findRepoRoot, runGitShowHead,
// runGitDiffQuietHead) are intentionally NOT unit-tested directly, the
// same way orchestrator-lib.mjs's own docker-invoking code isn't — they
// are exercised end-to-end every time published-migrations-checksum.test
// .mjs itself runs against the real repo.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

/**
 * Runs `git rev-parse --show-toplevel` from `cwd`. Throws — fails closed
 * — if git cannot be run at all, or exits nonzero (not inside a repo).
 * Never falls back to a guessed path.
 */
export function findRepoRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.error) {
    throw new Error(`git rev-parse --show-toplevel could not be run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git rev-parse --show-toplevel exited ${result.status}: ${(result.stderr || "").trim()}`);
  }
  return result.stdout.trim();
}

/**
 * Runs `git show HEAD:<relPath>` from `repoRoot`, decoded as a raw Buffer
 * (never text-decoded) so a checksum computed over it is byte-exact and
 * platform-independent. `relPath` must use forward slashes, relative to
 * `repoRoot`. Never throws — returns spawnSync's own result shape,
 * including `.error` when the command could not be run at all.
 */
export function runGitShowHead(repoRoot, relPath) {
  return spawnSync("git", ["show", `HEAD:${relPath}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Runs `git diff --quiet HEAD -- <relPath>` from `repoRoot`. Never
 * throws — returns spawnSync's own result shape.
 */
export function runGitDiffQuietHead(repoRoot, relPath) {
  return spawnSync("git", ["diff", "--quiet", "HEAD", "--", relPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

/**
 * Pure classifier for a `git show HEAD:<path>` result. Returns one of:
 *   'pass'               — blob exists at HEAD and its sha256 matches
 *   'checksum-mismatch'  — blob exists at HEAD but the hash differs
 *   'git-show-failed'    — the command itself could not be run
 *                          (`result` is null/undefined, or has `.error`)
 *   'missing-at-head'    — git ran but exited nonzero (the path does not
 *                          exist at HEAD, or another git-level failure)
 * A nonzero exit or a missing/errored result is NEVER classified as
 * 'pass' — command failure must never silently become success.
 *
 * @param {{status: number, stdout: Buffer, stderr?: Buffer|string, error?: Error} | null} result
 * @param {string} expectedSha256
 */
export function classifyBlobChecksum(result, expectedSha256) {
  if (!result || result.error) {
    return { outcome: "git-show-failed", detail: result?.error?.message ?? "git show could not be run" };
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ? result.stderr.toString() : "").trim();
    return { outcome: "missing-at-head", detail: stderr || `git show exited ${result.status}` };
  }
  const actualSha256 = crypto.createHash("sha256").update(result.stdout).digest("hex");
  if (actualSha256 !== expectedSha256) {
    return { outcome: "checksum-mismatch", detail: `expected ${expectedSha256}, got ${actualSha256}`, actualSha256 };
  }
  return { outcome: "pass", actualSha256 };
}

/**
 * Pure classifier for a `git diff --quiet HEAD -- <path>` result. Returns
 * 'clean' ONLY for a confirmed exit 0 (no tracked modification —
 * committed or staged or unstaged — relative to HEAD). Exit 1 (git diff's
 * documented "differences found" code with --quiet) is 'modified'.
 * Anything else — the command couldn't run, or a nonzero/non-1 exit —
 * is 'diff-check-failed'; it is never silently treated as 'clean'.
 *
 * @param {{status: number, stderr?: string, error?: Error} | null} result
 */
export function classifyTrackedModification(result) {
  if (!result || result.error) {
    return { outcome: "diff-check-failed", detail: result?.error?.message ?? "git diff could not be run" };
  }
  if (result.status === 0) return { outcome: "clean" };
  if (result.status === 1) return { outcome: "modified" };
  return { outcome: "diff-check-failed", detail: (result.stderr || "").trim() || `git diff exited ${result.status}` };
}
