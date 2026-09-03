// RLS Remediation Round 4 (post-close corrective — a review of the
// Round 4 report itself caught this): nothing in this suite actually
// verified that "published" migrations (0000-0003, the ones this whole
// engagement's own standing constraint forbids ever editing) hadn't been
// edited. upgrade-scenario.local.test.mjs's phase 3 looked like it might
// prove this (its old doc comment WRONGLY claimed drizzle-orm's
// migrate() re-verifies each already-applied migration's file hash) —
// reading drizzle-orm's own PgDialect.migrate() source shows it does
// NOT: it only compares meta/_journal.json's `when` timestamp for each
// entry against the single most-recently-applied row's created_at, and
// a sha256 hash is computed and stored only for a NEWLY-applied
// migration, never read back to re-check an older one. So an edited
// 0000-0003 file with its journal `when` timestamp left untouched would
// sail through every other script in this directory undetected.
//
// This script is the real, independent guard that gap needs — pure
// filesystem + git hashing, no database, no Docker required. It
// checksums each of 0000-0003's .sql files AND cross-checks their
// meta/_journal.json `when`/`tag` entries against a hardcoded manifest
// recorded when Round 3 published them. A mismatch here means one of two
// things: a real accidental edit to a published migration (stop and
// investigate — this is exactly the failure mode the standing "never
// edit 0000-0003" constraint exists to prevent), or a deliberate,
// reviewed decision to re-baseline this manifest (update the hashes
// below in the SAME commit that intentionally changes one of these
// files, with a clear reason in the commit message — this script is a
// tripwire, not a lock).
//
// Windows Migration Gate Cross-Platform Corrective (2026-09-03): the
// checksum is computed from the Git blob at HEAD (`git show
// HEAD:<path>`), not raw working-tree bytes — see
// published-migrations-lib.mjs's header for exactly why the original
// fs.readFileSync-based version went red (0/4) on a Windows checkout
// with core.autocrlf=true despite the committed content being untouched.
// A second, independent `git diff --quiet HEAD -- <path>` check catches
// the case the blob check alone cannot: a real edit sitting in the
// working tree (staged or not) that hasn't been committed yet. Both
// checks fail closed — a git command that cannot be run, or exits in an
// unexpected way, is a FAIL, never silently a PASS.
//
// Run: node test/published-migrations-checksum.test.mjs (no
// TEST_DATABASE_URL, no Docker needed — requires only that `git` is on
// PATH and this file is inside the repo, which it always is).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findRepoRoot,
  runGitShowHead,
  runGitDiffQuietHead,
  classifyBlobChecksum,
  classifyTrackedModification,
} from "./published-migrations-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.join(__dirname, "..", "drizzle");

// Recorded once, from the actual committed files, the last time 0000-
// 0003 were touched (Round 1 baseline remediation / Round 2 close —
// well before this script existed). Every entry here is a real,
// verified sha256 of the file's exact committed bytes (the Git blob at
// HEAD, not a working-tree-dependent encoding), not a placeholder.
const MANIFEST = [
  {
    file: "0000_init_20_table_baseline.sql",
    sha256: "4777fcefeaee58d471eb5e0a2cfe98c034d918f420d3520d0c54ed423c6df9e7",
    journalTag: "0000_init_20_table_baseline",
    journalWhen: 1787955500094,
  },
  {
    file: "0001_functions_triggers.sql",
    sha256: "7d611473efe0992eabd6a921fe84421fd926dbfd0acdeb7c6978f34864de99f8",
    journalTag: "0001_functions_triggers",
    journalWhen: 1787955500999,
  },
  {
    file: "0002_rls.sql",
    sha256: "c9a7bf64c568c48bac6ca9408e018209bce771b2eb05ac93f0819f998aafdd1a",
    journalTag: "0002_rls",
    journalWhen: 1787955501999,
  },
  {
    file: "0003_provider_events_lease.sql",
    sha256: "2efc5648ddcbd2c38a51728add91471f8a356b786bb818eee565fe8fab0795ac",
    journalTag: "0003_provider_events_lease",
    journalWhen: 1787984050616,
  },
];

function main() {
  let repoRoot;
  try {
    repoRoot = findRepoRoot(__dirname);
  } catch (err) {
    console.log(`FAIL  could not determine the git repo root — failing closed: ${err.message}`);
    process.exit(1);
  }

  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta", "_journal.json"), "utf8"));
  const journalByTag = new Map(journal.entries.map((e) => [e.tag, e]));

  let failed = 0;
  for (const { file, sha256, journalTag, journalWhen } of MANIFEST) {
    const filePath = path.join(drizzleDir, file);

    if (!fs.existsSync(filePath)) {
      console.log(`FAIL  ${file}: file does not exist on disk — a "published" migration must never be removed`);
      failed++;
      continue;
    }

    const relPath = path.relative(repoRoot, filePath).split(path.sep).join("/");

    const blob = classifyBlobChecksum(runGitShowHead(repoRoot, relPath), sha256);
    if (blob.outcome !== "pass") {
      console.log(`FAIL  ${file}: ${blob.outcome} — ${blob.detail}`);
      console.log(`      This is a published migration (0000-0003) — it must never be edited.`);
      console.log(`      If this change is deliberate and reviewed, update this script's MANIFEST in the same commit.`);
      failed++;
      continue;
    }

    const diff = classifyTrackedModification(runGitDiffQuietHead(repoRoot, relPath));
    if (diff.outcome !== "clean") {
      console.log(`FAIL  ${file}: ${diff.outcome}${diff.detail ? ` — ${diff.detail}` : ""} — the working tree carries a tracked modification relative to HEAD`);
      console.log(`      This is a published migration (0000-0003) — it must never be edited, even uncommitted.`);
      failed++;
      continue;
    }

    const entry = journalByTag.get(journalTag);
    if (!entry) {
      console.log(`FAIL  ${file}: no meta/_journal.json entry found for tag "${journalTag}"`);
      failed++;
      continue;
    }
    if (entry.when !== journalWhen) {
      console.log(`FAIL  ${file}: meta/_journal.json "when" for tag "${journalTag}" changed — expected ${journalWhen}, got ${entry.when}`);
      console.log(`      This timestamp is exactly what drizzle-orm's migrate() uses to decide this migration was already applied — changing it can make an upgrade re-run (or skip) migrations unexpectedly.`);
      failed++;
      continue;
    }

    console.log(`PASS  ${file}: Git blob at HEAD matches, no tracked modification, journal timestamp unchanged`);
  }

  console.log(`\n${MANIFEST.length - failed}/${MANIFEST.length} passed.`);
  if (failed > 0) process.exit(1);
}

main();
