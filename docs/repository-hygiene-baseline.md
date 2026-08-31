# Repository Hygiene Baseline — Stage 1

Date: 2026-08-31

This document records the guards, inventory, and outcome of Stage 1
("Repository Hygiene and Clean Baseline") — a workspace-hygiene pass that
removed untracked, regenerable build/runtime debris from four legacy-root
directories, and re-verified that no tracked secret exists in the working
tree or the historical rollback snapshot. **No Product code, no DB/migration
code, and no Supabase (local or remote) state were touched in this stage.**

## Starting point

| Item | Value |
|---|---|
| Starting branch | `feat/db-test-gate-remediation` |
| Starting commit (HEAD) | `fe73f2f0a4ef9ce61b40be13be3de8e69cfdea59` |
| New working branch | `feat/repository-hygiene-clean-baseline` (created from the same commit, zero divergence) |

## Checkpoint tag

`checkpoint/stage-00-db-gate-complete` → `fe73f2f0a4ef9ce61b40be13be3de8e69cfdea59`.

**Known discrepancy, disclosed rather than silently corrected:** this task
specified an *annotated* tag. The tag already existed (created during an
earlier, interrupted pass over this same task) as a **lightweight** tag
(`git for-each-ref` reports its object type as `commit`, not `tag`). Its SHA
exactly matches the required commit, and this task's own rule is: if the
tag already exists and points at the correct SHA, do not recreate or move
it. That rule was followed — the tag was left as-is. It correctly marks the
right commit; it is simply not the annotated form originally requested.

**Scope of this checkpoint:** it protects tracked Git state only (it lets
this branch, or any future work, return to this exact commit graph). It
does **not** back up or make recoverable any of the untracked files deleted
in this stage — those were regenerable build/log artifacts, not source, and
their removal is not reversible via Git.

## Pre-delete guards (all four targets: `frontend/`, `backend/`, `e2e/`, `.playwright-mcp/`)

- **Path containment:** each target's canonical absolute path was resolved
  and confirmed to sit inside the repository root, and not equal to the
  root itself.
- **Reparse points / symlinks / junctions:** each target was recursively
  scanned for `ReparsePoint` file-attribute bits. None were found in any of
  the four targets. No deletion proceeded on a path containing an
  unresolved reparse point.
- **Untracked-status proof:** `git ls-files` was run against each target
  (not inferred from the directory name) and returned zero tracked entries
  for all four — confirming Git has no record of any file inside them.
- **Exclusive top-level content check:** each target's top-level contents
  were enumerated and compared against the single allowed set for that
  target (`frontend/` → `coverage/`, `dist/`, `node_modules/` only;
  `backend/` → `logs/`, `node_modules/`, `.env` only; `e2e/` →
  `test-results/` only; `.playwright-mcp/` → `console-*.log` /
  `page-*.yml` files only). All four matched exactly; nothing unexpected
  (no `package.json`, `src/`, spec, config, or migration file) was present
  in any of them, so no target was skipped on this account.
- **Process-usage check:** running processes were enumerated
  (`Win32_Process`, executable path and command line) and checked for any
  reference to one of the four target paths. None were found; no target's
  deletion was blocked or preceded by a process being stopped (no process
  was ever terminated by this task).

## Pre-delete inventory

| Target | Files | Bytes |
|---|---:|---:|
| `frontend/node_modules/` | 37,180 | 420,911,544 |
| `frontend/dist/` | 544 | 20,886,086 |
| `frontend/coverage/` | 93 | 2,850,985 |
| `backend/node_modules/` | 10,171 | 70,665,170 |
| `backend/logs/` | 40 | 9,992 |
| `e2e/test-results/` | 1 | 48 |
| `.playwright-mcp/` | 48 | 330,601 |

For `backend/logs/` and `.playwright-mcp/` (the log/YAML-shaped content),
a SHA-256 manifest of filename + size + hash (never content) was captured
before deletion, saved outside the repository (session scratchpad, not
committed). That manifest proves *what* was deleted; it is **not** a backup
and does **not** allow restoration of the deleted content.

## Deletion performed

Deleted (verified absent afterward): `frontend/node_modules/`,
`frontend/dist/`, `frontend/coverage/`, `backend/node_modules/`,
`backend/logs/`, `e2e/test-results/`, `.playwright-mcp/` (contents and
container). All deletions used verified absolute, literal paths — no globs,
no unresolved variables. No deletion failed due to a lock or permission
error.

After content removal, the now-empty parent directories `frontend/` and
`e2e/` were removed. `.playwright-mcp/` was removed as a whole (its content
*was* the deletion target). `backend/` was deliberately **not** removed.

Deleted logs and Playwright snapshots are ordinary regenerable tool output
and are **not recoverable from Git** — they were never tracked, and no
backup of their content was made (only the redacted filename/hash manifest
described above).

## What remains, and why

- `backend/` still exists and now contains exactly one entry: `.env`. It
  was never opened, read, moved, or deleted at any point in this task —
  its filename appeared only in directory listings, never its content.
- `frontend/`, `e2e/`, `.playwright-mcp/` no longer exist at the repository
  root.
- `.migration-backup/` (see below) is untouched.
- No file under `artifacts/`, `lib/`, `ops/`, or `docs/` (other than this
  new file and `.gitignore`) was modified.

## `backend/.env` status

Present on disk, untracked, ignored. Verified with the exact required
command:

```
git check-ignore -v backend/.env
.gitignore:15:.env	backend/.env
```

Never opened, read, moved, or deleted at any point in this task. No blanket
ignore rule was added for `backend/`, `frontend/`, or `e2e/` — only a
narrow, commented rule for `/.playwright-mcp/` was added (see below), so a
future accidental `git add` inside `frontend/`/`backend`/`e2e` is **not**
silently suppressed by this change.

## `.migration-backup/` status

Inspected read-only. Confirmed tracked: `git ls-files .migration-backup`
reports 667 files; on-disk size is ~9.03 MB (9,466,836 bytes), consistent
with the tracked count. No file inside it was modified, moved, or deleted.

Classification: **temporary rollback evidence** — a deliberate historical
snapshot of the pre-migration Express/Mongo backend and legacy
frontend/e2e code, retained for reference during the ongoing Supabase
migration. It should be reviewed for deletion only **after** a successful
Remote (real Supabase project) cutover and after the rollback retention
window agreed for that cutover has expired — not as part of this or any
other repository-hygiene pass.

## Secrets scan

A local, install-free scanner (Node stdlib + `git` only — no package was
installed from the internet) was run against the full tracked working
tree, `.migration-backup/`, and the added lines in the commit range
`14912d4..HEAD`. It checks for private keys, database URLs with embedded
credentials, JWT-shaped tokens and `JWT_SECRET`-style assignments,
Supabase/API/access-token assignments, Stripe/PayPal secret patterns, SMTP
password assignments, and AWS/GCP/Azure credential shapes. It reports only
rule type, file path, and line number — never the matched text or value.

Result: **48 pattern matches total. 40 were auto-classified false positive**
by file-context (test files, README examples, or the disposable local
Postgres connection strings already documented in Stage 0's rehearsal
harness). **8 matches (6 distinct lines) required manual review**, all
located inside the frozen `.migration-backup/` snapshot:

- `.migration-backup/.github/workflows/ci.yml:71` and `:74` — CI-only
  environment values used to run the legacy backend's own test suite.
  Classified **false positive**: the values are self-labeled test-fixture
  strings, structurally consistent with dummy CI secrets, not production
  credentials.
- `.migration-backup/backend/.env.example:15` (`SMTP_PASS`) — classified
  **false positive**: `.env.example` files are, by this repository's own
  convention (explicitly un-ignored via `!.env.example`), meant to hold
  non-functional placeholder text.
- `.migration-backup/backend/.env.example:26` (`JWT_SECRET`) and `:43`
  (`CRON_SECRET`) — classified **false positive with high confidence**:
  redacted hash-fingerprint comparison (SHA-256, never the value itself)
  showed both variables hold the **exact same value**. A real deployment
  would never reuse its JWT signing secret as an unrelated cron-job token;
  an identical value shared across two semantically-unrelated variables is
  the signature of a copy-pasted template placeholder, not two
  independently-generated real secrets.
- `.migration-backup/backend/.env.example:99`
  (`ADMIN_JWT_ACCESS_SECRET`) — classified **false positive** on
  file-purpose/naming grounds (same `.env.example` template convention as
  above), though this one value is not corroborated by a shared-value
  match with any other finding — it is the single lowest-confidence item
  of the six and the one worth a final human sanity check if ever
  reused.

**No real tracked secret was detected by this scan.** Per the required
phrasing: *no tracked secret detected by the performed scan;
`backend/.env` remains local, ignored, unread, and unresolved* — this scan
does not and cannot make any claim about `backend/.env`'s contents.

**Scan limitations:** this is a regex/heuristic scanner, not a dedicated
secret-scanning tool (none was installed, per this task's constraints); it
can miss a sufficiently unusual secret shape or an obfuscated/encoded
value, and its false-positive heuristic is context-based, not proof.

**Procedural note, disclosed for transparency:** during the manual
follow-up review of the two `ci.yml` findings, an early ad hoc
key-extraction check contained a regex bug that caused the full line text
(including the self-labeled dummy value) to be printed to the console
instead of only the variable name, briefly violating this task's
"never print a secret value" discipline. The exposed text was a
self-describing CI test fixture string (explicitly named
`...-not-a-real-secret`), not a real secret, so no sensitive material was
actually disclosed — but the methodology was not fully compliant at that
step, and is recorded here rather than omitted. All other classification
work in this scan (including the `.env.example` findings) used only
booleans, lengths, and truncated hash fingerprints, never literal text.

## `.gitignore` change

Added one narrow, commented rule:

```
# Ephemeral browser-tool output (Playwright MCP console logs and page
# accessibility-tree snapshots written during manual/agent browsing
# sessions). May contain session-derived data — never tracked.
/.playwright-mcp/
```

No blanket ignore was added for `/frontend/`, `/backend/`, or `/e2e/` —
each remains a normal, trackable path at the repository root, so that a
future accidental `git add` inside one of them (e.g. real source code
mistakenly placed there) is not silently hidden. Existing `.env` ignore
rules were left unchanged.

## Policy: no parallel legacy-root projects

`frontend/`, `backend/`, and `e2e/` at the repository root are **not**
sanctioned locations for new source code — the canonical application lives
under `artifacts/` and `lib/`, per the existing pnpm workspace layout. If
tooling (installs, test runs, browser automation) regenerates
`node_modules/`/`dist/`/`coverage/`/`logs/`/`test-results/` under these
paths again, that is expected debris from local tooling, not a sign that a
second, parallel product tree is intentionally being built there. This
document is the record that the tree was deliberately cleaned once; it
should not silently reappear as a maintained codebase.

## Verification results

| Check | Result |
|---|---|
| `git status --short` (pre-commit) | Only `.gitignore` modified, plus this new doc file (untracked) |
| `git check-ignore -v backend/.env` | `.gitignore:15:.env	backend/.env` |
| `git ls-files frontend backend e2e .playwright-mcp` | empty (nothing tracked under any of the four) |
| `pnpm --filter @workspace/db run check:published-migrations` | **4/4 passed** |
| `node lib/db/test/orchestrator-failure-propagation.test.mjs` | **26/26 passed** |
| `pnpm run typecheck` (root) | **clean** — all 4 typechecked workspace projects (`al-rahma-academy`, `api-server`, `mockup-sandbox`, `scripts`) report Done with no errors |
| `pnpm --filter @workspace/al-rahma-academy test` | **222/222 passed** (33 test files) — this is the count as of this Stage 1 checkpoint (commit `ba1ec29`), **before** any Stage 2 changes (e.g. the later removal of `PreviewBanner.test.jsx`); it is not a claim about the count after any subsequent stage |
| `git diff --check` | clean, no output |

This correction closes a gap left when this document was first written: the
above five commands had been run and had passed, but their actual results
were not yet transcribed into this file. No new commands were run to make
this correction — these are the same Stage 1 results, now recorded.

## Confirmation

No connection was made to the real (remote) Supabase project at any point
in this stage. No SQL was run. No migration file (`0000`–`0011`) was
modified. No Product code, route, or component (including Attendance and
Homework, explicitly in scope for a later stage, not this one) was
modified or deleted. No push, merge, PR, or deploy occurred.
