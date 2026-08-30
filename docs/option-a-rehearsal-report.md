# Option A — Supabase-Local-Stack Rehearsal Report

**Environment:** Supabase CLI (`npx supabase`, v2.116.0) local stack —
real Postgres 17.6, real `gotrue`/Auth, real `PostgREST`, real `Kong`
gateway, real `anon`/`authenticated`/`service_role` roles and
`auth.uid()`/`auth.jwt()` functions — started in
`ops/option-a-rehearsal/` via `supabase start`. **Never the real
project; never `postgres:16` alone** (that plain-Postgres harness is
what `lib/db/test/` already uses for its own, separate, faster suite —
this rehearsal is additional, against the real Supabase-shaped stack,
specifically to test what the plain harness cannot: real PostgREST
routing, real Auth-issued JWT semantics, real cross-schema/event-trigger
CASCADE behavior).

## Sequence actually run

1. Applied `fixtures/old_public_schema.sql` (see
   `docs/option-a-backup-restore.md`) — the "before" state: 34 tables, 0
   policies, the OLD `handle_new_user()`.
2. Ran the full backup/restore rehearsal (`docs/option-a-backup-restore.md`)
   — disaster-simulated, restored, verified structurally and
   functionally, on this same stack.
3. **Ran the real Option A sequence**:
   ```sql
   drop schema if exists public cascade;
   create schema public;
   grant usage on schema public to postgres, anon, authenticated, service_role;
   alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
   alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
   alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
   ```
   then `node scripts/run-migrate.mjs` (drizzle-orm's `migrate()`
   against `lib/db/drizzle/*.sql`, **not** `drizzle-kit push`).

## Post-migration verification — real queries, real results

```sql
select jsonb_pretty(jsonb_build_object(
  'table_count', (select count(*) from pg_tables where schemaname='public'),
  'tables', (select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public'),
  'auth_users_count', (select count(*) from auth.users),
  'auth_users_trigger_present', (select count(*)>0 from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_created' and not tgisinternal),
  'rls_all_enabled', (select bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
  'policy_count', (select count(*) from pg_policies where schemaname='public'),
  'drizzle_migrations_applied', (select count(*) from drizzle.__drizzle_migrations)
));
```

| Check | Result |
|---|---|
| Table count | **20** (exact match to the design) |
| `auth.users` count | **2** (the fixture's 1 seed row + 1 inserted during the restore-liveness check — untouched by the entire drop/migrate sequence, exactly as `docs/option-a-cascade-scope.md` predicted) |
| `on_auth_user_created` present | **true** — recreated by migration `0001`, not by the schema/grant step alone |
| RLS enabled on all `public` tables | **true** (`bool_and` over all 20) |
| Policy count | **47** |
| `drizzle.__drizzle_migrations` rows | **11** — exactly the 11 migration files, tracked |
| Old LMS-only tables remaining (`courses`, `course_progress`, `live_classes`, `messages`, `profile_children`, `student_records`, `reviews`, `wishlist_items`, `post_likes`, `certificates`, `comments`, `contact_messages`, `hifz_progress`, `admin_lockouts`, `system_audit_log`, `system_config`, `tutor_conversations`, `rate_limit_counters`) | **zero** remain — confirmed by exact set-difference against the live table list, not by sampling |

**Policy count note (47, not 51):** a plain `grep -c "^create policy"
lib/db/drizzle/0002_rls.sql` returns 51, but later migrations
legitimately drop/replace a handful of those as part of RLS Remediation
Round 3/4's own fixes; 47 is the live, post-migration count, and the
existing `rls-full-matrix.local.test.mjs` suite (61/61 passing, see
below) independently sweeps every policy against `docs/rls-matrix.md`
row by row — this is the systematic check that actually validates the
policy set, not the raw count.

## Behavioral checks — real data, not inferred

**Signup always creates `role = 'user'`, regardless of metadata claim**
(inserted 4 real `auth.users` rows with `raw_user_meta_data.role` unset,
`'admin'`, `'teacher'`, and `'parent'`):
```
               email               | role 
-----------------------------------+------
 sig-admin-claim@example.invalid   | user
 sig-parent-claim@example.invalid  | user
 sig-plain@example.invalid         | user
 sig-teacher-claim@example.invalid | user
```
**No metadata value produced anything but `user`.**

**Admin provisioning is only possible out-of-band** (a direct `UPDATE`
as `postgres`/`service_role` — there is no other path; confirmed no
client-callable function can set `role='admin'` in
`docs/option-a-migration-review.md` §4).

**AAL1/AAL2 contract, tested with 3 real role-switched sessions**
(`SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '...'`,
calling `admin_set_role`, matching PostgREST's real session mechanism):

| Case | Caller | Expected | Actual |
|---|---|---|---|
| A | non-admin, `authenticated` | rejected | `ERROR: admin_set_role: caller is not an AAL2-verified admin` |
| B | real admin, AAL1 (no MFA) | rejected | `ERROR: admin_set_role: caller is not an AAL2-verified admin` |
| C | real admin, AAL2 | succeeds | `role → admin` (promoted the target user, audit row written) |

All three matched the design contract exactly.

**`RETURNS trigger`/`RETURNS event_trigger` PostgREST-RPC exposure —
tested with real HTTP calls against the local Kong/PostgREST gateway**
(`http://127.0.0.1:54321/rest/v1/rpc/...`, as `anon`):

| Function | Return type | Result |
|---|---|---|
| `handle_new_user` | `trigger` | `404 PGRST202` — *"Could not find the function public.handle_new_user... in the schema cache"* |
| `rls_auto_enable` | `event_trigger` | `404 PGRST202` — same |
| `admin_set_role` (control — a real, intentionally-exposed RPC) | `profiles` | `401` — *"permission denied for function admin_set_role"* (expected: `anon` has no grant) |

**This directly resolves the correction the task asked for**:
`EXECUTE` privilege on a `RETURNS trigger`/`RETURNS event_trigger`
function (real, and — on the remote project — actually granted to
`anon`/`authenticated`, per `docs/remote-supabase-inventory.md` §F) is
a *different fact* from PostgREST RPC exposure. Tested directly: **
PostgREST's schema-cache introspection excludes `RETURNS trigger`/
`RETURNS event_trigger` functions from RPC routing entirely** — the
route 404s before any permission check even runs, in contrast to the
control case (`admin_set_role`), which reaches a real permission check
and correctly denies `anon`. Supabase Advisor's WARN-level finding on
the remote project (worded as "can be executed... via /rest/v1/rpc/...")
is best read as flagging the `EXECUTE`-privilege half only; the RPC-
route half, tested here, does not actually expose these two functions.

## Result

Every check in the task's post-application list (item 5) that is
testable without a real client app is confirmed: 20 tables exactly,
`auth.users` preserved throughout (both the disaster/restore rehearsal
and the real forward sequence), correct migration journal (11 rows),
enums/functions/triggers/RLS all present and matching the design, no
old-LMS object remains, no orphaned cross-schema dependency (the only
cross-schema edge, `auth.users`'s trigger, was proven present and
live), a real signup produces `role='user'` under every metadata value
tried, admin provisioning only via the sanctioned out-of-band path, and
AAL1/AAL2 behave exactly per contract.
