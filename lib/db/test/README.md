# Local schema + RLS tests

Real-SQL tests for the 20-table baseline (`docs/product-scope-audit.md`)
and its Row Level Security policies, grants, and financial-integrity RPCs
(`docs/rls-matrix.md`), run only against a throwaway **local** Postgres.
Every script here refuses to run against anything but `localhost`/
`127.0.0.1` — each checks `TEST_DATABASE_URL`'s host and throws
immediately otherwise. **Never** point `TEST_DATABASE_URL` at the real
Supabase project.

## Run it yourself (clean-database scenario)

```sh
node test/published-migrations-checksum.test.mjs # 4 assertions — no DB/Docker needed, run this first or anytime

docker run --rm -d --name alrahma-local-test-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=alrahma_test \
  -p 55432:5432 postgres:16

# wait for it to accept connections, then:
export TEST_DATABASE_URL="postgres://postgres:test@localhost:55432/alrahma_test"
node test/run-migrations.mjs             # applies lib/db/drizzle/*.sql (0000-0010) via drizzle-orm's migrate()
node test/schema.local.test.mjs          # 67 real-SQL assertions (schema, constraints, functions/triggers)
node test/rls.local.test.mjs             # 71 real-SQL assertions (specific findings: bypass closure, forgery prevention, AAL boundaries, concurrency, webhook lease + fencing, subscription/invoice/refund RPCs)
node test/rls-full-matrix.local.test.mjs # 61 real-SQL assertions (systematic per-table sweep of docs/rls-matrix.md, incl. plan versioning + invoice issuance sweeps)
node test/acl.local.test.mjs             # 18 real-SQL assertions (direct has_table_privilege/has_column_privilege/has_function_privilege checks — proves the GRANT matrix directly, not by inference)
node test/upgrade-scenario.local.test.mjs # 9 real-SQL assertions (self-contained — see below; applies 0000-0003, injects legacy drift, then applies the rest and proves it's cleaned up)

docker rm -f alrahma-local-test-pg # tear down when done
```

**226 real-SQL assertions total against the migrated database, plus 4
filesystem-only checksum assertions (no DB/Docker) from
`published-migrations-checksum.test.mjs`.**

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

`last-run-output.txt` is a captured, real run —
`published-migrations-checksum.test.mjs` first (no DB needed), then
`run-migrations.mjs` twice (to prove its already-applied-migration
bookkeeping across all 11 migration files, not that the raw SQL itself
is re-runnable), then all 5 DB-backed test scripts, then `tsc --noEmit`
and a `drizzle-kit generate` drift check — not hand-edited.
