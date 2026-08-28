# Remote Reconciliation Proposal (description only — not executed)

> **This document describes a future step. Nothing in it has been run.**
> No command here has been executed against the real Supabase project
> (ref `difzynyphojgisrfvrkd`) or anywhere else. It exists so the *shape*
> of the eventual cutover is on record and reviewable before it's ever
> attempted — see `docs/product-scope-audit.md` §13's Migration Policy
> for the constraint this proposal exists to satisfy.

## Current state of the real project

- The real Supabase project currently has the **Stage 1, 34-table**
  schema (student/teacher/parent/admin LMS shape), applied via
  `drizzle-kit push` and committed historically as `ae47640` — this was
  the schema audited and found to be out of scope, prompting the Product
  Data Scope Reset that produced this 20-table baseline.
- It also has Stage 1's `handle_new_user()` trigger
  (`lib/db/sql/0001_handle_new_user.sql`), which branches on a
  `parent`/`student` role claim — superseded by this baseline's
  simplified, unconditional-`role='user'` version
  (`lib/db/drizzle/0001_functions_triggers.sql`).
- Whether the real project holds any real (non-test) rows today is an
  **open question this proposal does not answer** — Stage 1's
  verification pass did run a real signup test against it, so at least
  some test data likely exists. Before any of the options below is
  chosen, someone with dashboard access needs to confirm what's actually
  in there now (row counts per table is enough).

## Target state

This local baseline: 20 tables + 11 enums + 8 hand-authored
functions/triggers, defined in `lib/db/src/schema/*.ts` and captured as
versioned migrations in `lib/db/drizzle/0000_init_20_table_baseline.sql`
and `0001_functions_triggers.sql`, verified end-to-end (62/62 real-SQL
assertions including 2 genuine concurrency tests, twice-run idempotent
`migrate()`) against a throwaway local Docker Postgres — never against
the real project.

## Options for getting from current to target

### Option A — Full reset (drop + reapply)

`DROP SCHEMA public CASCADE` on the real project, then apply this
baseline's two migrations.

**Correction (baseline remediation):** the migration files as committed
are **not** actually "as if it were an empty database" the way this
option originally claimed — `0000_init_20_table_baseline.sql` only
contains `public`-schema objects (a review caught that it used to also
`CREATE SCHEMA auth`/`CREATE TABLE auth.users`, which would fail
outright against the real project since Supabase already owns both; that
was hand-stripped out — see the schema commit). `DROP SCHEMA public
CASCADE` leaves `auth`/`auth.users` untouched, which is exactly what
these migrations now assume: `public.profiles.id`'s foreign key expects
`auth.users` to already exist, not to be created by this migration. So
the accurate description of this option is: `DROP SCHEMA public CASCADE`
(never touches `auth`), then apply the two migrations against the
now-empty `public` schema with `auth.users` already in place — not
"as if empty" in the sense of an empty *database*, only an empty
`public` schema.

- Simplest, matches exactly what's already been tested (the local test
  harness's `auth.users` stub exists purely to simulate this same
  precondition — a schema where `auth.users` already exists before
  these migrations run).
- **Destructive**: erases every row the old 34-table schema currently
  holds. Only defensible if the "what's actually in there" check above
  comes back empty or entirely disposable test data, and even then only
  after an explicit, separate go-ahead and a fresh project-level backup/
  snapshot taken immediately beforehand.

### Option B — Incremental diff migration (in place, data-preserving)

Write a new migration that transforms the real 34-table schema directly
into the 20-table shape: `DROP TABLE` for the 20 tables on the DROP list,
`CREATE TABLE` for the 6 new ones, and `ALTER TABLE` for the 14 KEEP
tables whose shape changed (`profiles` loses its LMS/gamification
columns; `payments` is restructured from a mutable-status record into
the append-only ledger with `kind`/`parent_payment_id`/snapshot columns;
`content`'s `reviews` table is replaced by admin-curated `testimonials`,
etc.) — each KEEP table's ALTER would need a real data-backfill script,
not just DDL, wherever the old and new column shapes don't line up
1:1 (`payments` most of all).

- Preserves whatever real rows exist in the carried-over tables.
- Substantially more work: this proposal is not itself that migration —
  writing it is a separate, later task, and it needs the "what's in
  there now" answer first to know which backfill rules actually matter.

### Option C — Parallel build + verified cutover

Build the 20-table schema under a temporary namespace (e.g. a
`v2` Postgres schema, or suffixed table names) alongside the existing 34
tables, backfill/copy data across with a script, verify row-for-row, then
rename/swap in a single short transaction and drop the old tables only
after the swap is confirmed good.

- Safest option for a project with real data and any live traffic —
  minimizes the window where anything is broken or half-migrated, and
  the old data stays recoverable until the swap is deliberately finalized.
- The most engineering effort of the three; likely the right call only
  if Option A's "just test data" assumption turns out to be false.

## Recommendation (non-binding — the actual choice is the user's, later)

If the "what's in there now" check confirms the real project holds only
Stage 1's own test/verification data (no real customer signups or
payments), **Option A** is by far the simplest and matches what's
already built and tested here. If it turns out there's real data,
**Option C** is the defensible choice; **Option B** is a middle ground
worth considering only if the real data volume is small enough that a
manual, carefully-reviewed backfill script is tractable.

## Non-negotiable preconditions before any option is executed

1. The RLS matrix (`docs/rls-matrix-draft.md`) is finalized — not this
   draft — reviewed, and its `CREATE POLICY`/`GRANT` SQL is written and
   tested against the same local Docker Postgres this schema was tested
   on.
2. Schema + RLS + grants are applied together, as one release — never a
   schema-only partial apply that leaves tables open with no row
   security (the constraint `docs/product-scope-audit.md` §13 already
   states).
3. A fresh backup/snapshot of the real project is taken immediately
   before whichever option is chosen is executed.
4. Explicit, separate user permission for that specific execution — the
   same standing constraint that governed this entire task (no
   DROP/ALTER/APPLY/RESET on the real project without it).

## Status

Proposal only. No option above has been chosen, scheduled, or executed.
