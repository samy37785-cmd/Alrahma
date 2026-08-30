# Option A — Backup & Restore Rehearsal

**Every step below was run against the local Supabase CLI stack in
`ops/option-a-rehearsal/` (Docker, ports 54321-54324/54322 — never the
real project). No remote backup, dump, or connection was made.** This
document reports what was actually run and actually observed — where an
approach failed, that failure is reported, not smoothed over.

## Tooling produced (`ops/option-a-rehearsal/`)

- `fixtures/old_public_schema.sql` — a faithful structural facsimile of
  the real remote's old 34-table `public` schema, generated from the
  real column/constraint/function/trigger data captured in
  `docs/remote-supabase-inventory.md`, plus 3 synthetic seed rows (a
  blog post, a subscriber, and an `auth.users` row with `raw_user_meta_
  data.role = 'parent'` — used to prove the OLD `handle_new_user()`'s
  metadata-branching logic and its resulting data both round-trip
  through backup/restore).
- `scripts/01-pre-drop-inventory.sh` — snapshots table/function/event-
  trigger/policy/default-privilege counts before any drop.
- `scripts/02-dump.sh` — produces two dumps: a **full-database** dump
  and a **`public`-schema-only** dump, both checksummed.
- `scripts/02b-dump-cross-schema-artifacts.sh` — separately captures the
  `handle_new_user()`/`rls_auto_enable()` function definitions, the
  `on_auth_user_created` trigger definition (`pg_get_triggerdef`), the
  `rls_auto_enable_trigger` event trigger definition, and a JSON
  snapshot of the `public` schema's ACL/default-privilege/grant state —
  each as its own small, explicit, re-runnable artifact.
- `scripts/run-migrate.mjs` — applies `lib/db/drizzle/*.sql` via
  drizzle-orm's `migrate()` (never `drizzle-kit push`) against the local
  Supabase stack.

## What was actually tested, in order

1. Applied `fixtures/old_public_schema.sql` to the local stack. Verified
   the "before" state directly: **34 tables, 0 policies, 1 `profiles`
   row with `role = 'parent'`** — proving the fixture is not just
   structurally but *behaviorally* faithful (the seeded `auth.users`
   insert really did fire the old trigger and really did branch on
   metadata, matching the real remote function body).
2. Ran `01-pre-drop-inventory.sh` and `02-dump.sh` + `02b-...sh` —
   produced and checksummed both dumps and the 5 cross-schema artifacts.
3. **Simulated the disaster**: `DROP SCHEMA public CASCADE` directly on
   the live local stack (not a copy) — reported "drop cascades to 41
   other objects" exactly matching the earlier isolated cascade probe
   (`docs/option-a-cascade-scope.md`). Confirmed `auth.users` (1 row)
   untouched.
4. **Tried the full-database dump restore first** (`full_database.dump.
   sql`, produced by plain `pg_dump -d postgres`, no schema filter).
   **This failed**, and the failure itself is the important finding:
   ```
   ERROR:  permission denied to set parameter "log_min_messages"
   ```
   Traced to `CREATE FUNCTION realtime.list_changes(...)` — a
   **Supabase-platform-internal** function (part of their Realtime
   service, nothing to do with this application) whose definition
   requires a `SET` privilege the `postgres` role does not have. This
   is not an artifact of the local rehearsal specifically: **Supabase
   never grants a true Postgres superuser, locally or on the real
   project** (confirmed: `select rolsuper from pg_roles where rolname=
   'postgres'` → `false`, both locally and on the real project per
   `docs/remote-supabase-inventory.md` §A). **A whole-database `pg_dump`
   / restore round-trip, done as the only role actually available
   (`postgres`), can fail on Supabase's own internal service function
   definitions — this is a real, tested limitation, not a hypothetical
   one, and it is exactly why this rehearsal does not recommend a
   whole-database dump/restore as the Option A rollback mechanism.**
5. **Restored the narrower, tested-working path instead**: `CREATE
   SCHEMA public` (letting the dump's own statement run — pre-creating
   the schema manually first causes a `schema "public" already exists`
   collision, also tested and also documented as a real gotcha),
   restore `public_schema_only.dump.sql`, then apply the two function
   files and the trigger/event-trigger files from `02b`. Result,
   verified directly (not assumed): **34 tables restored, all 3
   synthetic seed rows present including the trigger-derived `profiles`
   row (`role = 'parent'`), both functions restored, the `auth.users`
   trigger restored, the event trigger restored.**
6. **One further genuine gap found and documented, not smoothed over**:
   4 of the 12 `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public` lines
   captured in the dump were of the form `FOR ROLE supabase_admin ...`
   — restoring these failed (`permission denied to change default
   privileges`) because the `postgres` role cannot alter a *different*
   role's default-privilege rules. The `FOR ROLE postgres ...` lines (8
   of 12) restored fine. **This is real and would recur on an actual
   restore.** It does not affect the tables that already exist (their
   real, explicit `GRANT` statements — 112 of them — are captured and
   restored separately, successfully, in the same dump) — default
   privileges only govern *future* object creation, and this project's
   own migrations `GRANT` explicitly per-object rather than relying on
   schema-level default-privilege inheritance (see
   `docs/option-a-migration-review.md` §7) — so this gap is judged
   low-impact but is listed as an open risk, not silently accepted.
7. **Proved the restore is functionally live, not just structurally
   present**: inserted a brand-new `auth.users` row after the restore
   completed — `public.profiles` grew from 1 row to 2, proving the
   restored trigger actually fires on new data, not merely that its
   catalog entry exists.

## Explicit conclusion on "does a `pg_dump` file count as a backup"

**No, not by itself, and this was tested rather than assumed.** A
whole-database dump exists as a byte-for-byte capture but is **not
proven restorable** here (step 4). What *is* proven restorable is the
narrower, deliberately-scoped bundle: `public`-schema dump + the two
function definitions + the two trigger/event-trigger definitions.
**The real Option A rollback plan must use this narrower bundle, not a
naive whole-database `pg_dump`/`pg_restore`.** Whether Supabase's own
platform-level backup/restore (Pro plan PITR, unavailable on the real
project's current Free plan per `docs/remote-supabase-inventory.md`
§G) behaves differently is **not tested here and not claimed** — it is
a different code path entirely (Supabase's own infrastructure, not a
manual `pg_dump`), and asserting it would work is exactly the kind of
untested claim this task asked not to make.

## Checksums (this rehearsal run, for reference — regenerate, don't trust stale values)

Produced by `scripts/02-dump.sh`/`02b-...sh` into `out/dump.sha256`
(gitignored — regenerate by rerunning the scripts against a live
rehearsal stack; not committed as a static value since it is tied to a
specific ephemeral run's synthetic data, not a permanent artifact).
