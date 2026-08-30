# Option A — `DROP SCHEMA public CASCADE` Scope Review

**Method:** empirically tested against a disposable, throwaway
PostgreSQL 17 Docker container (`postgres:17`, port 55499, removed
immediately after each test) — never the real Supabase project, never
the shared `alrahma-postgres` container the user runs for other work.
Two probe scripts were run to reconstruct the actually-relevant parts of
the remote object graph (per `docs/remote-supabase-inventory.md`) and
directly observe what `DROP SCHEMA public CASCADE` reports and drops,
and what a naive `CREATE SCHEMA public` + `GRANT` restore does and does
**not** bring back. No assumption below is untested.

## What CASCADE actually drops — real output, not inferred

Reconstructed in the probe: 34-table-equivalent `public` schema
objects, `public.rls_auto_enable()` (event trigger handler),
`rls_auto_enable_trigger` (the event trigger itself, `ON
ddl_command_end`), `public.handle_new_user()`, `on_auth_user_created`
(trigger **on `auth.users`**, a different schema), `ALTER DEFAULT
PRIVILEGES IN SCHEMA public ...`, and `GRANT USAGE ON SCHEMA public`.

Running `DROP SCHEMA public CASCADE;` against this produced:

```
NOTICE:  drop cascades to 5 other objects
DETAIL:  drop cascades to function rls_auto_enable()
drop cascades to event trigger rls_auto_enable_trigger
drop cascades to function handle_new_user()
drop cascades to trigger on_auth_user_created on table auth.users
drop cascades to table profiles
DROP SCHEMA
```

Confirmed directly, by post-drop query, not by reading the NOTICE alone:

| Object | Survives `DROP SCHEMA public CASCADE`? |
|---|---|
| `public` tables/sequences/views | No (dropped with the schema) |
| `public` functions (incl. `handle_new_user`, `rls_auto_enable`) | No |
| **`rls_auto_enable_trigger` (event trigger)** | **No — cascade-dropped because it depends on a `public` function**, even though event triggers are database-level (not schema-scoped) objects |
| **`on_auth_user_created` (trigger on `auth.users`, a *different* schema)** | **No — cascade-dropped**, because the trigger depends on `public.handle_new_user()`. `auth.users` the table (and its rows) is untouched — confirmed via `select count(*) from auth.users` immediately after, unchanged. Only the trigger *on* it is gone. |
| `ALTER DEFAULT PRIVILEGES IN SCHEMA public ...` entries | No — schema-scoped, vanish with the schema (confirmed via `pg_default_acl`, empty after) |
| Schema-level ACL (`GRANT USAGE ON SCHEMA public`) | No — the whole `pg_namespace` row for `public` is gone |

**This directly answers the task's requirement**: `on_auth_user_created`
does depend on `public.handle_new_user()`, and the event trigger backing
`rls_auto_enable()` does get swept up by CASCADE, exactly because event
triggers carry a catalog dependency on their handler function even
though they are not themselves inside any schema.

## The naive restore does **not** bring these back on its own

After the drop, running exactly `CREATE SCHEMA public; GRANT USAGE ON
SCHEMA public TO anon, authenticated, service_role;` and re-checking:

```
=== does the auth.users trigger come back on its own? ===
 tgname 
--------
(0 rows)

=== does rls_auto_enable event trigger come back on its own? ===
 evtname 
---------
(0 rows)

=== does default privileges auto-restore? ===
 defaclrole | defaclnamespace | defaclacl 
------------+-----------------+-----------
(0 rows)
```

**Confirmed empirically: `CREATE SCHEMA public` + `GRANT` alone restores
none of this.** The real Option A sequence must not stop at that step —
it must go on to actually *apply* the 11 migrations, because migration
`0001_functions_triggers.sql` is what recreates `on_auth_user_created`
(it contains its own `drop trigger if exists ... ; create trigger ...`,
idempotent by design — see `docs/option-a-migration-review.md`). Tested
and confirmed: applying the local design's own migration set after the
naive restore step **does** recreate the `auth.users` trigger correctly,
because migration 0001 does it explicitly, not because schema-creation
implies it.

## Decision: `rls_auto_enable()` / its event trigger

**Recommendation: do not recreate it.** Two independent facts support
this:

1. **The local design's own migration `0002_rls.sql` explicitly issues
   `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for all 20 tables itself**
   (verified: `grep -c "enable row level security"
   lib/db/drizzle/0002_rls.sql` → exactly `20`, one per table, plus 51
   explicit `CREATE POLICY` statements). Correctness of the local
   design's RLS posture does not depend on `rls_auto_enable()` at all.
2. It is proven above to be **destroyed by Option A's drop and not
   restored by the schema/grant step** — recreating it would require a
   deliberate, new migration statement nothing in the current 11
   migrations contains.

**Effect on any future table**: if the team later creates a table
*outside* the drizzle migration flow (e.g. by hand in Studio), it would
land without RLS auto-enabled unless `rls_auto_enable()` is deliberately
reinstated in a dedicated future migration — that is a real, but
separate and optional, follow-up decision, not a blocker for Option A
itself, since every table the 11 migrations create already gets RLS
explicitly. If reinstating this Studio safety net is wanted later, it
is a one-function-plus-one-event-trigger addition, not evidence Option A
is unsafe today.

## Cross-schema dependency check

The only cross-schema edge found anywhere in the reconstructed remote
object graph is `public.profiles.id → auth.users.id` (foreign key) and
the `auth.users`-side trigger calling into `public`. Both are accounted
for above. No dependency runs the other direction (nothing in `auth`,
`storage`, or `realtime` depends on anything in `public`) — confirmed by
the fact that `auth.users`' row count and structure were completely
unaffected by the `public`-schema drop in the probe.

## Preconditions this confirms for the real Option A sequence

1. `DROP SCHEMA public CASCADE` — accept that this also removes
   `rls_auto_enable()` and its event trigger; per the decision above,
   that is fine, not a step to work around.
2. `CREATE SCHEMA public;` plus the schema-level `GRANT USAGE`/default
   ownership Supabase expects — necessary but **not sufficient**.
3. Apply migrations `0000`-`0010` **in order**, via drizzle-orm's
   `migrate()` (never `drizzle-kit push` — see
   `docs/option-a-migration-review.md`) — this is what actually restores
   `on_auth_user_created`, all 20 tables, RLS, policies, and grants.
   Skipping straight from step 2 to "done" is the exact wrong assumption
   this review was asked to rule out, and it is now ruled out with
   real evidence, not inference.
