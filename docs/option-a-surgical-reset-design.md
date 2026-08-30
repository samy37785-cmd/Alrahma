# Option A — Surgical Reset Design + Default-Privileges Correction

This replaces two parts of the Phase-2 rehearsal design that this round
of review rejected: the `DROP SCHEMA public CASCADE` rebuild sequence,
and the broad `ALTER DEFAULT PRIVILEGES ... GRANT ALL ... TO anon,
authenticated` block used to reconstruct access after it. Both are
gone; neither is used anywhere below.

## 1. Surgical Reset — never drops `public` itself

`ops/option-a-rehearsal/sql/surgical-reset.sql` (new, committed) is the
full replacement. It is built entirely from the real old-schema
inventory (`docs/remote-supabase-inventory.md`,
`ops/option-a-rehearsal/fixtures/old_public_schema.sql`) cross-checked
against the new target schema (`lib/db/drizzle/0000_init_20_table_baseline.sql`):

- **34 named old tables** (exact list below) — every one of the old
  remote project's `public` tables, `drop table if exists ... cascade`,
  one statement per table. CASCADE here is scoped to that one table's
  own dependents (FKs from the other 33 tables in this same list,
  indexes/constraints/sequences it owns) — never schema-wide.
- **3 named old enums** (`role`, `subscription_provider`,
  `subscription_status`) — plain `drop type if exists`, no CASCADE (if
  one fails, that's a real signal something outside the named 34-table
  list still depends on it, and this design wants that surfaced as a
  hard failure, not silently cascaded through).
- **The old `handle_new_user()` + `on_auth_user_created`** — dropped
  explicitly by name, even though `0001_functions_triggers.sql`
  replaces both idempotently on its own (`create or replace function`
  + `drop trigger if exists ... create trigger ...`), so this script's
  own post-condition checks can assert a clean state independent of
  whether `migrate()` has run yet.

**Cross-check that matters:** the old and new schemas share 14 table
names (`blogs`, `coupon_redemptions`, `coupons`, `enrollments`,
`invoices`, `manual_payments`, `notifications`, `payments`, `profiles`,
`quran_bookmarks`, `quran_memorization_stats`, `quran_reading_progress`,
`subscribers`, `trial_requests`) with different column shapes, and one
enum name (`subscription_status`) with different values. `migrate()`'s
`CREATE TABLE`/`CREATE TYPE` statements are plain, non-conditional
(confirmed: no `IF NOT EXISTS` anywhere in `0000_init_20_table_baseline.sql`)
— so all 34 old tables and all 3 old enums must be gone before
`migrate()` runs, not just the 20 old-only ones with no new-schema
namesake.

**Explicitly preserved — nothing below is named anywhere in the script,
which is what "preserved" means here:**

| object | why it survives |
|---|---|
| the `public` schema itself | never `drop schema`/`create schema` — no statement targets the schema object |
| schema owner + ACL, `pg_default_acl` for `public` | untouched by definition — nothing here is schema-level DDL |
| `rls_auto_enable()` + `rls_auto_enable_trigger` | not named anywhere in the script; confirmed no migration (0000-0011) references `rls_auto_enable` either — it is pure Supabase-managed/pre-existing infrastructure this project's migrations have never touched |
| `auth` schema, `auth.users` (table + rows) | only a *trigger on* `auth.users` is dropped — the table, its data, and every other trigger/policy on it are untouched |
| Supabase roles/extensions/storage/realtime/vault | none named |

`scripts/03-surgical-reset.mjs` (new, committed) is the only sanctioned
way to run the SQL file: it enforces the same `127.0.0.1`/`localhost`-
only guard as `run-migrate.mjs`, records a before/after fingerprint of
every "preserved" item above (schema oid/owner/ACL, `rls_auto_enable`'s
function+event-trigger oids and exact source text, `auth.users` row
count), refuses to proceed if any dependent object outside the named
34-table/3-enum list depends on one of them, and asserts every
preserved item's fingerprint is bit-for-bit identical after the reset
as before it.

**Round 2 correction — a real code review found two gaps in the
paragraph above's earlier version, both fixed:**

1. **Single transaction, not two.** `sql/surgical-reset.sql` used to
   wrap itself in its own `begin`/`commit` — meaning the wrapper's
   after-fingerprint/comparison ran *after* that commit had already
   landed, too late to prevent a detected regression from being
   committed anyway. The SQL file no longer contains `begin`/`commit`
   at all; `03-surgical-reset.mjs` now opens `BEGIN` itself, runs the
   dependency check, the before-fingerprint, every DROP statement, the
   after-fingerprint, and every postcondition check — all on the same
   connection, in the same transaction — and only issues `COMMIT` if
   every single check passed, `ROLLBACK` otherwise.
2. **The dependency check was view/matview-only; it is now a broader
   sweep.** The original version only queried `pg_rewrite` for view/
   materialized-view dependents. It now also checks for a foreign key
   FROM a table outside the named 34-list INTO one inside it (via
   direct `pg_class`/`pg_namespace`/`pg_constraint` joins — not
   `regclass::text` string comparison, which was tried first and found,
   by testing, to silently drop the schema-qualification for any object
   on the default `search_path`, making the check miss exactly the case
   it exists to catch) and for a column outside the named 34-list using
   one of the 3 named old enum types. **Still not covered, disclosed
   rather than silently assumed fixed:** a `plpgsql` function *body*
   merely mentioning one of the 34 tables in its SQL text — Postgres
   does not record that as a `pg_depend` catalog dependency, so a
   function outside the named list that references, say,
   `public.blogs` in a `SELECT` would not be caught by this check.
   The default-ACL fingerprint also changed from a row *count* to the
   full `{defaclrole, defaclobjtype, defaclacl}` content of every row —
   a count could stay identical across a real content swap.

Both fixes were proven, not just written: a real external FK was
planted from a table outside the 34-list into `public.blogs` before
running the script — it refused, zero tables dropped, transaction
rolled back — and the same script then ran clean (full commit,
fingerprints unchanged) once the planted table was removed. See
`docs/option-a-surgical-reset-rehearsal.md` §1 for the real,
unedited output of both runs.

## 2. Default privileges — deny-by-default, with a real correction mid-design

**First finding, before any fix was written:** `lib/db/drizzle/*.sql`
(0000-0010) contains **zero** `ALTER DEFAULT PRIVILEGES` statements.
The broad `alter default privileges for role postgres in schema public
grant all on tables/sequences/functions to postgres, anon,
authenticated, service_role;` block that Phase-3 objects to was never
in the actual migrations — it only ever existed in Phase 2's manual
rebuild sequence (the old `README.md` step 4, now replaced by §1
above). Every current migration grants explicitly, per object
(`grant select on public.plans, public.blogs, ... to anon;`, `grant
execute on function public.is_admin() to anon, authenticated;`, etc.)
— already the deny-by-default pattern this task asks for, for every
object that exists today.

**What was still open:** nothing protected a *future* migration's
function from Postgres's own built-in default (new functions get
`EXECUTE` granted to `PUBLIC` automatically unless revoked — tables and
sequences don't have this default, only functions do). A new migration
9 that forgot the `revoke execute ... from public` line every function
before it remembers by hand would ship a function silently callable by
`anon`/`authenticated`.

**The fix that was written first — and empirically found NOT to
work:**
```sql
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
```
This runs with no error and looks correct. Tested against a disposable
local Postgres 16 before being trusted: created a role after running
this, created a function after running this, and the role could still
execute it. Root-caused by direct catalog inspection
(`select * from pg_default_acl` — 0 rows both before and after the
`REVOKE`, even though an explicit `GRANT ... TO public` immediately
before it *does* produce a row, and revoking that grant deletes the row
back to 0 rather than recording an empty override). **Conclusion,
verified rather than assumed: `pg_default_acl` only stores a delta
against Postgres's hard-coded built-in default, and a `REVOKE` that
would need to express "less than the hard-coded default" has nothing to
store — it deletes any matching row instead, reverting to the hard-
coded default, which for functions still includes `PUBLIC EXECUTE`.
`ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM PUBLIC` can only undo a
previous `ALTER DEFAULT PRIVILEGES ... GRANT` in the same slot — it
cannot override the built-in default itself.** This is a real, general
PostgreSQL behavior (reproduced on plain `postgres:16`, nothing
Supabase- or version-specific about it) — the kind of gap this task
explicitly asked to have surfaced rather than shipped as an
unverified-but-plausible-looking fix.

**A second attempt — the event trigger — and a second round of review
catching real bugs in it before it shipped:** the first fix above
(schema-scoped `REVOKE`) being a no-op led to an event-trigger
workaround, mirroring `rls_auto_enable()`'s own pattern
(`public.revoke_public_execute_auto()`, firing on `ddl_command_end` for
`CREATE FUNCTION`/`CREATE PROCEDURE`, running `revoke execute on
function <new function> from public`). This version was committed, then
a follow-up code review of the committed file (not just the chat
report) found two real bugs in it: its exception handler
(`EXCEPTION WHEN OTHERS THEN RAISE LOG ...`) logged and **swallowed**
any error instead of re-raising it — a failed `REVOKE` inside the
trigger would leave that function unprotected with no failure signal at
all; and it only ever executed `REVOKE ... ON FUNCTION`, which is the
wrong object-type keyword for a `CREATE PROCEDURE` (the trigger matched
that command tag too, so a procedure would hit a syntax/object-type
mismatch and be silently left unprotected by the same swallowed-
exception bug).

**The actual fix — found by re-testing the first attempt's exact
statement with the scoping removed, not by patching the event
trigger's bugs:** rather than harden the event trigger, its first-
attempt predecessor was retested with `IN SCHEMA public` isolated as a
variable, via a controlled A/B test on disposable Postgres 16 (four
runs, one variable changed at a time):
```sql
-- global, no IN SCHEMA, FUNCTIONS keyword  -> creates a pg_default_acl row, WORKS
alter default privileges for role postgres revoke execute on functions from public;

-- global, no IN SCHEMA, ROUTINES keyword   -> also WORKS (identical result)
alter default privileges for role postgres revoke execute on routines from public;

-- schema-scoped, ROUTINES keyword          -> still a no-op, 0 rows
alter default privileges for role postgres in schema public revoke execute on routines from public;
```
**The keyword (`FUNCTIONS` vs `ROUTINES`) made no difference in either
direction — `IN SCHEMA public` was the actual cause of the original
no-op, isolated and confirmed empirically rather than assumed from the
first (correct, but incompletely diagnosed) finding.** Both keywords
also cover procedures, not just functions (confirmed separately: a
`CREATE PROCEDURE` after the global `REVOKE` was denied to a fresh role
with zero grants of its own).

`lib/db/drizzle/0011_default_privileges_deny_by_default.sql` (migration
0011, this version) is now a single statement, no dynamic SQL, no
exception handling to get wrong:
```sql
alter default privileges for role postgres
revoke execute on functions from public, anon, authenticated;
```
(`anon, authenticated` alongside `PUBLIC` is redundant defense-in-depth
— revoking from `PUBLIC` alone is already proven sufficient, since a
`PUBLIC` revocation applies to every role with no membership needed —
kept because it costs nothing and removes any doubt for a future
reader.)

**Empirical proof, this round** (disposable local Postgres 16, full
`migrate()` of 0000-0011 applied first, this final version of the
migration):
```sql
create function public.experimental_future_function() returns text language sql as $$ select 'hi' $$;
create procedure public.experimental_future_proc() language sql as $$ select 1 $$;
select has_function_privilege('anon', 'public.experimental_future_function()', 'execute') as anon_func,
       has_function_privilege('authenticated', 'public.experimental_future_function()', 'execute') as auth_func,
       has_function_privilege('public', 'public.experimental_future_function()', 'execute') as public_func,
       has_function_privilege('anon', 'public.experimental_future_proc()', 'execute') as anon_proc;
```
```
 anon_func | auth_func | public_func | anon_proc
-----------+-----------+-------------+-----------
 f         | f         | f           | f
```
Then a real behavioral call, not just an ACL query — a fresh role,
granted `USAGE` on schema `public` (to isolate the function-level
denial from the separate schema-level one) but nothing else, attempting
the call directly:
```sql
create role sanity_unpriv login;
grant usage on schema public to sanity_unpriv;
set role sanity_unpriv;
select public.experimental_future_function();
```
```
ERROR:  permission denied for function experimental_future_function
```
Also verified: redefining an already-granted function via `create or
replace function` after this migration is active does **not** strip
its real, explicit grants — only `PUBLIC`'s implicit grant is affected,
confirmed by granting `EXECUTE` on a function to two named roles,
redefining it, and confirming both roles' grants survived unchanged.

**A function or procedure created with zero grants/revokes of its own,
after this migration, is not client-accessible, and an existing
function's real grants survive being redefined.** This is the actual
test item 3 of the task asked for — run for real, twice corrected by
re-testing rather than trusting the previous round's own conclusion.

**Known scope limit, stated rather than assumed away:**
`docs/remote-supabase-inventory.md` never captured `pg_default_acl`
state on the real project — this migration's effect on the real
project's *existing* default-ACL rows (if any) has not been
independently confirmed empty/harmless. Expected to be a pure addition
(nothing in the real project's history has ever run a statement like
this), but that expectation should be confirmed with a fresh read-only
`select * from pg_default_acl;` pass before this migration is ever
applied to the real project.

## 3. Full local verification re-run with migration 0011 added

Migration 0011 changes the tracked migration count from 11 to 12. This
broke one hardcoded assertion in the existing local test suite
(`upgrade-scenario.local.test.mjs` phase 3 expected exactly 11 rows in
`drizzle.__drizzle_migrations`) — found and fixed in the same change,
same discipline `published-migrations-checksum.test.mjs`'s own comment
documents ("update ... in the SAME reviewed change"). Full suite
re-run, fresh disposable container, after the fix:

| suite | result |
|---|---|
| `check:published-migrations` (0000-0003 checksum guard) | 4/4 — unaffected, 0011 doesn't touch 0000-0003 |
| `schema.local.test.mjs` | 67/67 |
| `rls.local.test.mjs` | 71/71 |
| `rls-full-matrix.local.test.mjs` | 61/61 |
| `acl.local.test.mjs` | 18/18 |
| `upgrade-scenario.local.test.mjs` | 9/9 (after the hardcoded-count fix) |

**230 real-SQL/checksum assertions total, all passing, with migration
0011 in the applied set.**

## 4. What's committed

- `lib/db/drizzle/0011_default_privileges_deny_by_default.sql` +
  `lib/db/drizzle/meta/_journal.json` (new entry) +
  `lib/db/drizzle/meta/0011_snapshot.json` (drizzle-kit bookkeeping,
  copied from 0010's with a fresh `id`/`prevId` — no schema/table/enum
  change to reflect, this migration is grants-only)
- `lib/db/test/upgrade-scenario.local.test.mjs` (hardcoded
  migration-count fix, 11 → 12)
- `ops/option-a-rehearsal/sql/surgical-reset.sql` (new)
- this document

Not yet built (tracked as pending, next in this task): the
`scripts/03-surgical-reset.mjs` verifying wrapper described in §1, and
the full Supabase-local rehearsal re-run of the entire sequence
(backup bundle → surgical reset → migrate 0000-0011 → full test matrix)
that item 8 of this task requires.
