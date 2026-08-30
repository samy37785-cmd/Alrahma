# Local schema + RLS tests

Real-SQL tests for the 20-table baseline (`docs/product-scope-audit.md`)
and its Row Level Security policies, grants, and financial-integrity RPCs
(`docs/rls-matrix.md`), run only against a throwaway **local** Postgres.
Every script here refuses to run against anything but `localhost`/
`127.0.0.1` — each checks `TEST_DATABASE_URL`'s host and throws
immediately otherwise. **Never** point `TEST_DATABASE_URL` at the real
Supabase project.

## Run it yourself — one self-contained command (current, since Stage 0)

```sh
pnpm run test:db              # from lib/db — does EVERYTHING below, on a fresh disposable DB, then tears it down
pnpm run test:db:write-evidence  # same, and if (and only if) the run is fully green, regenerates last-run-output.txt
pnpm run check:published-migrations  # just the 4 filesystem checksum assertions, no DB/Docker needed
```

`test:db` now runs `test/orchestrate-db-tests.mjs`, which:

1. Creates a **brand-new, uniquely-named, disposable** local Postgres
   Docker container — random container name, random password, a
   Docker-assigned free host port bound to `127.0.0.1` only. Never a
   fixed name/port, and never reused across runs.
2. Runs the checksum guard, applies `lib/db/drizzle/*.sql` twice (to keep
   proving the already-applied-migration bookkeeping, not just that the
   raw SQL is re-runnable), then all 5 DB-backed suites below, in order.
3. **Always** tears the container down in a `finally` — on success,
   on failure, or on a crash partway through. Nothing is ever left
   running; nothing needs a manual `docker rm -f` afterward.
4. Refuses to run against anything but `localhost`/`127.0.0.1` (the
   `TEST_DATABASE_URL` it builds internally is never taken from — and
   any inherited value in the parent shell's environment is deliberately
   ignored).

Suites, in the order the orchestrator runs them:

- `test/schema.local.test.mjs` — 67 real-SQL assertions (schema, constraints, functions/triggers)
- `test/rls.local.test.mjs` — 71 real-SQL assertions (specific findings: bypass closure, forgery prevention, AAL boundaries, concurrency, webhook lease + fencing, subscription/invoice/refund RPCs)
- `test/rls-full-matrix.local.test.mjs` — 61 real-SQL assertions (systematic per-table sweep of docs/rls-matrix.md, incl. plan versioning + invoice issuance sweeps)
- `test/acl.local.test.mjs` — 18 real-SQL assertions (direct has_table_privilege/has_column_privilege/has_function_privilege checks — proves the GRANT matrix directly, not by inference)
- `test/upgrade-scenario.local.test.mjs` — 9 real-SQL assertions (self-contained — see below; applies 0000-0003, injects legacy drift, then applies the rest and proves it's cleaned up)

**230 real-SQL/filesystem assertions total: 4 checksum + 67 schema + 71
targeted RLS + 61 full RLS matrix + 18 ACL + 9 upgrade.** Neither
`test:db` nor `check:published-migrations` is wired into any CI pipeline
yet — this repo has no `.github/workflows` at all today; whenever one is
added, `test:db` (or at minimum `check:published-migrations`) belongs in
it as a required check.

If Docker isn't available, or you specifically want to drive a container
by hand, the manual sequence the orchestrator automates is still just
`docker run ... -p 127.0.0.1::5432 postgres:16` → discover the assigned
port (`docker port <name> 5432/tcp`) → `export TEST_DATABASE_URL=...` →
run each script above with `node`, in order → `docker stop <name>`. The
orchestrator is the supported path; doing this by hand reintroduces
exactly the test-isolation risk described below if the container/database
isn't freshly created and torn down every time.

### Proving the orchestrator's own gating logic actually works

`node test/orchestrator-failure-propagation.test.mjs` is a Docker/DB-free
safe self-test — **not counted in the 230** — that proves, by really
spawning deliberately-failing/succeeding throwaway child scripts and
checking the result (never by reading the code and assuming), three
things about the orchestrator itself:

1. A failing suite makes the pipeline's own exit code nonzero, and every
   step after a failure is genuinely skipped (its `run()` is never
   invoked at all — verified via a real sentinel-file side effect the
   skipped step would otherwise have produced).
2. The exact assertion contract (below) correctly fails the gate for
   every way a result could look accidentally-fine but not actually be:
   a missing required suite, a duplicated one, one with no readable
   summary, one reporting the wrong total, or one silently skipped —
   and correctly passes for the one genuinely-correct 230/230 shape.
3. Cleanup failure alone fails an otherwise-perfect run, cleanup always
   runs (even if the test run itself crashed), and the evidence-writing
   step only ever runs after cleanup has fully completed and been folded
   into the decision (never before).

**This self-test is a MANDATORY preflight step of `pnpm run test:db`
itself** (`orchestrate-db-tests.mjs` runs it first, before Docker is even
touched — if it fails for real, nothing else runs) — it is not an
optional script that can be forgotten. It can also be run standalone via
`pnpm run test:db:orchestrator-selftest`. Its deliberately-simulated
failure lines are prefixed `SIMULATED-FAIL` (never bare `FAIL`) and the
whole run is banner-wrapped when it executes inside `test:db`'s own
output, specifically so a human or a CI log scraper can never mistake a
manufactured fixture failure for a real one.

### The exact assertion contract, and what "green" means (Stage 0 Corrective)

An earlier version of this orchestrator judged a run "fully green" using
only `aggregate.passed === aggregate.total` — too weak: it would accept
e.g. 163/163 if one required suite's summary silently went missing.
`orchestrator-lib.mjs`'s `DB_ASSERTION_CONTRACT` names every required
suite and its own exact expected total up front — `evaluateAssertionContract()` fails the run unless **all** of the
following hold:

- `published-migrations-checksum` = exactly 4/4
- `schema.local.test.mjs` = exactly 67/67
- `rls.local.test.mjs` = exactly 71/71
- `rls-full-matrix.local.test.mjs` = exactly 61/61
- `acl.local.test.mjs` = exactly 18/18
- `upgrade-scenario.local.test.mjs` = exactly 9/9
- each of the above appears **exactly once**, was not skipped, exited 0,
  and produced a readable `N/M passed.` summary
- no step outside this list produced its own summary line (an
  unaccounted-for suite can't silently inflate a sum)
- the resulting aggregate = exactly **230/230**

`start-disposable-postgres` and the two `run-migrations` steps are
deliberately **not** part of this contract — they carry no assertion
count — but they still have to exit 0 or the pipeline stops before any
DB suite even runs (`runPipeline()`'s ordinary fail-fast behavior).

**"Green evidence" (a run that `--write-evidence` is willing to write
`last-run-output.txt` from) means, precisely:**

1. the exact assertion contract above is satisfied (230/230, not a naive
   sum);
2. every step's own exit code was 0, and no step was skipped;
3. cleanup was run AND independently verified — the disposable
   container is confirmed absent via `docker ps`, not merely assumed
   because `docker stop` returned success (see below).

All three, together, are what `orchestrator-lib.mjs`'s
`decideRunOutcome()`/`runLifecycle()` compute as `fullyGreen`; missing
any one of them fails the whole run, even if the other two are perfect.

### Cleanup is verified, and gates evidence (Stage 0 Corrective)

An earlier version could write `last-run-output.txt` without the
container-teardown step having been confirmed to actually succeed first
— the write and the cleanup were sequenced independently, not causally.
`runLifecycle()` now makes the ordering structural: `cleanup()` always
runs immediately after the test run (success, failure, or a crash
partway through — the same unconditional guarantee a `try/finally` gives,
without ever swallowing a cleanup failure into silence), and its
`verified` result is folded into the green/not-green decision **before**
the evidence-writing step is ever reached. Cleanup itself: `docker stop`
→ `docker ps` to confirm absence → `docker rm -f` as a fallback if it's
still there → re-check — every one of those real exit codes is captured,
not assumed. If the container is still present after all of that, the
run is not fully green (regardless of how the tests themselves went),
`last-run-output.txt` is never touched, and the container's name is
printed so it can be cleaned up by hand. When cleanup IS verified, the
evidence file states it explicitly: a `cleanup verified: container
absent` line.

### Root cause of the previously-recorded 172/58 failure (Stage 0)

`last-run-output.txt` briefly recorded a run (2026-08-30, Option A Round
2 regeneration) showing 172 PASS / 58 FAIL — **not** a real SQL/RLS
regression. Diagnosed by actually reproducing it: the manual workflow
this file used to document (`docker run --name alrahma-local-test-pg -p
55432:5432 ...`, a **fixed** container name and port, never torn down
between invocations) meant a second `test:db` run against the
still-running container from an earlier run collided with that earlier
run's own fixture rows — `plans_slug_active_unique`,
`profiles_email_lower_unique`, `coupons_code_upper_unique`,
`provider_events_provider_event_unique`, and
`payments_gateway_payment_id_unique` all failed with literally
`duplicate key value violates unique constraint`, all on each suite's
OWN first-use fixture insert. A further ~8 failures in the same recorded
run were direct knock-on effects within the same file: `test()` (see
below) deliberately continues to the next assertion after a failure
rather than aborting the whole file, so once an early seed insert
silently collided, later tests in that same file that referenced its
(never-actually-inserted) id failed too, for a secondary reason (e.g.
`Cannot read properties of undefined (reading 'updated_at')`) — not an
independent defect. Two suites in that same recorded run —
`acl.local.test.mjs` (18/18) and `upgrade-scenario.local.test.mjs`
(9/9) — passed cleanly throughout, which is the direct evidence this was
a test-isolation bug and not a regression: ACL only checks static
privilege grants (immune to row-level duplicates), and the upgrade
scenario has always owned and dropped/recreated its own separate
database on every run (see below) — the two suites that were already
isolated were exactly the two that stayed green.

The fix is `test/orchestrate-db-tests.mjs` (a fresh, uniquely-named,
disposable container every run — see above), not any change to
migrations or RLS SQL. Verified empirically, not assumed: the full
230-assertion suite was run twice, each on its own independently fresh
disposable database (Run A, Run B), and both reached 230/230. See the
Stage 0 chat report for both runs' full output.

**Previously recorded failure vs. current verified clean run:** any
`last-run-output.txt` you're looking at was regenerated by
`orchestrate-db-tests.mjs --write-evidence`, which refuses to write the
file at all unless that specific run satisfied the exact assertion
contract above (230/230, not a naive sum), every step's own exit code
was 0 with nothing skipped, AND cleanup was independently verified (see
"Cleanup is verified, and gates evidence" above) — so the file, if
present and tracked, always reflects a run that was independently
verified green, contract-exact, and fully cleaned up at write time. It
is still only a point-in-time snapshot (see below) — it does not
re-verify itself on every future read.

RLS Remediation Round 4 (`0010_round4_integrity_fixes.sql`) added no new
migration count to the clean-scenario run above beyond the extra file
(`run-migrations.mjs` already applies whatever's in `lib/db/drizzle`) —
it closed 3 real gaps a fresh review of Round 3's own delivery found:
`create_plan_version()` could mint a duplicate "version 1" row for a
slug with retired history; `enforce_subscription_transition()` only
fired on `UPDATE`, so a row could be *created* already invalid (e.g.
`expired` with `cancel_at_period_end = true`, or `active` with a
`NULL`/past `current_period_end`); `issue_invoice_from_payment()` wrote
no `admin_audit_log` row for a real admin's genuine issuance. A
follow-up review of THIS round then caught 3 further documentation-only
defects (a wrong description of how drizzle-orm's `migrate()` actually
recognizes an already-applied migration; `.claude/settings.local.json`
relying on a personal global gitignore rather than this repo's own; a
stale "3 admin RPCs" test message) — corrected, plus the new
`published-migrations-checksum.test.mjs` guard above, which is the real,
independent answer to "how would we actually know if 0000-0003 were
edited" (nothing before it did).

## The upgrade/legacy-privilege-drift scenario

`upgrade-scenario.local.test.mjs` is the one script that doesn't start
from an empty database — it's the only thing that can actually prove
RLS Remediation Round 3's Section A fix (explicit `REVOKE ... FROM
anon, authenticated, service_role`, not just `FROM PUBLIC`) does what it
claims. It's self-contained (owns its own throwaway database,
`alrahma_upgrade_scenario`, dropped/recreated at the start of each run —
never the same database the other scripts use, so it's safe to run
before/after/alongside them):

1. Copies `0000`-`0003`'s `.sql` files + a trimmed `meta/_journal.json`
   into a temp folder, and applies **only** those — the exact
   pre-Round-3 state a real, long-lived project could be sitting on.
2. Injects real drift as the superuser: a broad direct `GRANT` to
   `anon`/`authenticated` (simulating a leftover from before this
   engagement), and a `provider_events` row stuck in `'processing'`
   with `claimed_at = NULL` (the exact pre-fencing legacy shape).
3. Applies the **real, full** `lib/db/drizzle` folder. **Corrected
   description** (a review caught this — the previous wording claimed a
   hash comparison that doesn't happen): drizzle-orm's postgres
   `migrate()` reads only the SINGLE most-recently-applied row from
   `__drizzle_migrations` (`order by created_at desc limit 1`) and runs
   every migration whose `meta/_journal.json` timestamp (`when`) is
   newer than that one row's `created_at` — it records a sha256 hash
   per newly-applied migration for bookkeeping, but never reads that
   hash back to re-verify an OLDER, already-applied migration's file
   content is unchanged (verified by reading `drizzle-orm`'s own
   `PgDialect.migrate()` source, not assumed). So `0000`-`0003` are
   skipped here because phase 1's trimmed journal carries the SAME
   `when` timestamps as the real folder's `0000`-`0003` entries (byte-
   identical copies, verified earlier) — not because their file content
   is hash-verified against anything. This step proves the real
   *upgrade ordering* (only the genuinely-new migrations run), not that
   `0000`-`0003` are tamper-evident — see
   `published-migrations-checksum.test.mjs` below for that guarantee.
4. Proves the injected drift is gone via `has_table_privilege`/
   `has_function_privilege` (not inferred from "the migration ran
   without error"), and that the legacy stuck row was reset to
   `pending` by `0005`'s migration-embedded self-heal step and is
   claimable again.
5. Runs a critical-path subset (one schema fact, one RLS boundary, one
   RPC validation, one real 2-connection concurrency race) to confirm
   the upgraded database actually behaves correctly end to end — not
   the full suite (that's what the clean-database scenario above is
   for).

## Shared scaffolding

- `local-harness.mjs` — the **local-test-harness-only** scaffolding
  `run-migrations.mjs` and `upgrade-scenario.local.test.mjs` both need
  before calling `migrate()`, neither ever run anywhere near the real
  project (the real Supabase project already provisions all of it):
  - `createLocalAuthUsersStub()` — a minimal `auth.users` stub (`id`,
    `email`, `raw_user_meta_data`). `0000_init_20_table_baseline.sql`
    intentionally contains **no** `CREATE SCHEMA auth`/`CREATE TABLE
    auth.users` at all — this stub exists purely so `profiles.id`'s FK
    to `auth.users.id` has something to point at locally.
  - `createLocalAuthRolesAndFunctions()` — `anon`/`authenticated`/
    `service_role` Postgres roles (`NOLOGIN`; `service_role`
    additionally `BYPASSRLS`, matching its real behavior) plus
    `auth.uid()`/`auth.jwt()` functions reading the `request.jwt.claims`
    session GUC — the same mechanism PostgREST/Supabase use in
    production.
  - `assertLocalHost()` — the shared `localhost`/`127.0.0.1`-only guard.
- `rls-helpers.mjs` — the session-switching mechanics
  (`asAnon()`/`asUser()`/`asService()`/`asSuperuser()`) and the shared
  `test()`/`assert()`/`expectReject()` scaffolding, imported by
  `rls.local.test.mjs` and `rls-full-matrix.local.test.mjs` rather than
  duplicated. Both use a single `pg.Client` (not a `Pool`) because
  `SET ROLE`/session GUCs must persist across statements within one
  session — a real, repeated **RLS caveat**: policies are never
  enforced for a table's owner or a superuser, so every test explicitly
  switches to a non-owner role before the assertion, never asserting
  anything while still the connecting superuser.
  - `expectReject(queryFn, matcher?, msgIfNotRejected?)` — RLS
    Remediation Round 3 (Section G): "an error happened" is not proof
    the *intended* layer stopped it — `42501` alone covers both a plain
    `GRANT`-layer "permission denied" AND a failed RLS `WITH CHECK`
    ("row-level security policy"), the same SQLSTATE class. The optional
    `matcher` (`{ sqlState, messageIncludes }`) lets a caller assert the
    SPECIFIC mechanism: the real SQLSTATE node-pg exposes as `err.code`
    (`42501` permission-denied/RLS, `23514` check_violation, `23505`
    unique_violation, `23503` foreign_key_violation, `P0001` a
    hand-authored trigger's `RAISE EXCEPTION`) and/or a message fragment.
    Omitting the matcher (or passing a plain string, the old calling
    convention) keeps every pre-existing call site working unchanged.

## Systematic coverage, not a curated sample

`rls-full-matrix.local.test.mjs` sweeps every table in
`docs/rls-matrix.md`: every `✓` cell gets a real positive assertion,
every `✗`/`⊘` cell that sits at a meaningful boundary gets a real
negative assertion, distinguishing the 3 real failure modes a denial can
happen at (RLS filtering to 0 rows, RLS raising on a failed `WITH
CHECK`, a `GRANT`-layer "permission denied" before RLS is even
evaluated). Round 3 added dedicated sweeps for plan versioning
(`create_plan_version()`/`deactivate_plan()`/`admin_update_plan_
display()`, including a real 2-connection race) and invoice issuance
(`issue_invoice_from_payment()`'s full rejection matrix — pending/
failed/refund-kind payments, mismatched amount/discount/plan/user/
currency).

`acl.local.test.mjs` is the direct-ACL counterpart: it doesn't
role-switch and provoke a query at all — it asserts the actual privilege
state itself (`has_table_privilege`/`has_column_privilege`/
`has_function_privilege`) against the final, fully-migrated grant
matrix. This is what actually *proves* a "denied at the GRANT layer"
claim made elsewhere in the suite, and it's what caught a real,
otherwise-invisible bug while this round was built: `subscriptions`'
`INSERT` grant to `authenticated` had never actually been revoked by
Round 2 (RLS — not the GRANT layer — was the accidental reason a raw
insert always failed); `0006_subscription_integrity.sql` now closes it
for real, proven directly rather than inferred.

## Captured output

`last-run-output.txt` is a captured, real run — never hand-edited, and
(since Stage 0) only ever written by `orchestrate-db-tests.mjs
--write-evidence`, which refuses to touch it unless that exact run was
independently verified fully green (see "Root cause..." above). It
captures `published-migrations-checksum.test.mjs` first (no DB needed),
then `run-migrations.mjs` twice (to prove its already-applied-migration
bookkeeping across the full migration set, not that the raw SQL itself
is re-runnable), then all 5 DB-backed test scripts — each against a
fresh, disposable, uniquely-named container the orchestrator created and
tore down for that run alone. It is a point-in-time snapshot, not a live
check: it goes stale again after any future migration or test change and
should be regenerated alongside one, same discipline as
`test/published-migrations-checksum.test.mjs`'s own manifest. `tsc
--noEmit` and a `drizzle-kit generate` drift check are run separately
(see the Stage 0 chat report) and are not currently part of the captured
file itself.
