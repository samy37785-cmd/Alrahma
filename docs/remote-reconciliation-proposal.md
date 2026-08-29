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

This local baseline: 20 tables + 12 enums + full RLS (20 tables enabled,
a policy per operation per role) + grants reconciled explicitly against
`anon`/`authenticated`/`service_role` by name (not just `PUBLIC`) +
a fenced webhook-claim lease + hardened subscription/invoice/plan/refund
financial-integrity RPCs, defined in `lib/db/src/schema/*.ts` and
captured as 11 versioned migrations,
`lib/db/drizzle/0000_init_20_table_baseline.sql` through
`0010_round4_integrity_fixes.sql`, verified end-to-end — **226 real-SQL
assertions** (schema/function, RLS role-switching, a systematic
per-table matrix sweep, direct ACL proof via `has_table_privilege`/
`has_column_privilege`/`has_function_privilege`, and a dedicated
two-phase upgrade/legacy-privilege-drift scenario), all against a
throwaway local Docker Postgres. `migrate()` was run twice back to back
across all 11 migration files — this proves `migrate()`'s own
already-applied-migration bookkeeping works (the second run applies
nothing), not that the SQL statements themselves are idempotent; several
of these migrations (e.g. `ALTER TABLE ... DROP CONSTRAINT`, `CREATE
TYPE`) would in fact error if `migrate()` re-ran their raw SQL a second
time — it doesn't, by design, which is exactly what the second run
confirms. Never applied against the real project.
See `docs/rls-matrix.md` for the full policy-by-policy design, including
the fencing/subscription-transition/invoice-issuance/plan-versioning/
refund-provider contracts Round 3 added.

## Options for getting from current to target

### Option A — Full reset (drop + reapply)

`DROP SCHEMA public CASCADE`, `CREATE SCHEMA public`, then apply this
baseline's 11 migrations in order.

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
(never touches `auth`), then apply the 11 migrations against the
now-empty `public` schema with `auth.users` already in place — not
"as if empty" in the sense of an empty *database*, only an empty
`public` schema.

**Second correction (Round 4 review):** the description above was still
wrong in a way that would make Option A fail outright, not just be
imprecisely described. `DROP SCHEMA public CASCADE` drops the *schema
object itself*, not just its contents — `public` would not exist at all
afterward, and none of these migrations issue `CREATE SCHEMA public`
(every migration assumes it already exists, matching every local test
run, which only ever runs against a Postgres database that already has
its default `public` schema — `DROP SCHEMA public CASCADE` was never
actually exercised end-to-end against that same assumption). The first
statement of `0000_init_20_table_baseline.sql` is a bare `CREATE TYPE
"public"."account_role" ...`, which errors immediately with `schema
"public" does not exist` if the schema was dropped and never recreated.
The corrected sequence is therefore three real steps, not two:
1. `DROP SCHEMA public CASCADE;`
2. `CREATE SCHEMA public;` — then re-grant whatever the fresh schema
   needs for the migrations themselves to run as the executing role
   (typically `GRANT ALL ON SCHEMA public TO postgres;` or whichever
   role Supabase's own migration tooling runs as — the exact grant
   depends on that project's role setup and must be confirmed against
   the real project, not assumed from this local baseline, where the
   test harness's Postgres superuser already owns a pre-existing
   `public` schema and never needs to grant itself anything on it).
   `anon`/`authenticated`/`service_role`'s own `USAGE ON SCHEMA public`
   is unaffected by this step — that's re-granted explicitly by
   `0002_rls.sql`/`0004_privilege_reconciliation.sql` as part of the
   migrations themselves, already covered.
3. Apply the 11 migrations, `0000` through `0010`, in order.

Also unresolved by this proposal, and required **before** step 1 is ever
run: an inventory of what currently lives in the real project's `public`
schema beyond the 34 known tables — any installed extension whose
objects were created *into* `public` (rather than Supabase's default
`extensions` schema), any hand-added function/view/trigger not part of
the Stage 1 migration history, anything `auth.users` or another
Supabase-managed object might reference by schema-qualified name into
`public`. `CASCADE` silently drops all of it with the schema; nothing in
this baseline's own migrations would recreate an object it never knew
existed. `SELECT n.nspname, c.relkind, c.relname FROM pg_class c JOIN
pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'` (and
the equivalent for `pg_extension`/`pg_proc`) run against the real project
first is what this inventory step actually requires — not performed as
part of this proposal, which only describes the shape of the eventual
cutover.

- Simplest, matches exactly what's already been tested (the local test
  harness's `auth.users` stub exists purely to simulate this same
  precondition — a schema where `auth.users` already exists before
  these migrations run; the local harness does NOT exercise `DROP
  SCHEMA public CASCADE` itself, since its Postgres container starts
  with `public` already present — the corrected 3-step sequence above
  is reasoned from Postgres's own documented `DROP SCHEMA`/`CREATE
  SCHEMA` semantics, not re-verified against a real drop-and-recreate
  cycle locally).
- **Destructive**: erases every row the old 34-table schema currently
  holds, and anything else living in `public` per the inventory step
  above. Only defensible if the "what's actually in there" check comes
  back empty or entirely disposable test data, and even then only after
  an explicit, separate go-ahead and a fresh project-level backup/
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

1. ~~The RLS matrix is finalized and its `CREATE POLICY`/`GRANT` SQL is
   written and tested~~ — **done, through Round 4**: `docs/rls-matrix.md`
   + `lib/db/drizzle/0002_rls.sql` through `0010_round4_integrity_
   fixes.sql`, 226 real-SQL assertions passed against the same local
   Docker Postgres this schema was tested on
   (`lib/db/test/schema.local.test.mjs`, `rls.local.test.mjs`,
   `rls-full-matrix.local.test.mjs`, `acl.local.test.mjs`,
   `upgrade-scenario.local.test.mjs`, captured in `lib/db/test/
   last-run-output.txt`). Round 3 specifically also proved, via its own
   dedicated two-phase scenario, that applying these migrations to a
   database ALREADY carrying legacy privilege drift (a direct grant to
   `anon`/`authenticated` from before this engagement) actually strips
   that drift — not just that a fresh database ends up clean. Round 4
   closed 3 further real gaps a fresh review found (plan-version
   duplication, subscription invariants unenforced on INSERT, no audit
   trail on invoice issuance) and corrected this very proposal's Option A
   (see above — the original 2-step description would have failed
   outright against a real `DROP SCHEMA public`). Still not applied to
   the real project — that's what this proposal's options describe.
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
