# Remote Supabase Inventory — `difzynyphojgisrfvrkd`

**Status:** read-only inventory, dated 2026-08-30. Nothing on the real
project was ever created, altered, or dropped to produce this document —
every fact below came from `SELECT`/CTE statements run in the Supabase
Studio SQL Editor (connected via the currently-open, already-authenticated
Google Chrome session, `chrome-devtools` MCP only) plus plain dashboard
navigation. **This document supersedes the "Current state of the real
project" findings in `docs/remote-reconciliation-proposal.md`'s earlier
draft and corrects two claims from an earlier chat-only report** (see
"Corrections" below) — this is the first version of this evidence
committed to the repo.

- **Project Ref:** `difzynyphojgisrfvrkd` (confirmed via the dashboard URL
  and the rendered, readonly Settings → General → "Project ID" field —
  both gates passed before any query ran).
- **Project name:** Alrahma. **Environment:** `main`, **PRODUCTION**.
- **Postgres version:** 17.6 (`x86_64-pc-linux-gnu`).

## Corrections to an earlier, chat-only version of this inventory

An earlier chat message (not committed) made two claims that turned out
to be wrong or imprecise on closer, SQL-verified inspection:

1. **"`auth.users` has 10 rows"** — wrong. That number came from
   misreading the Authentication → Users dashboard page. The real,
   exact `count(*)` (§C below) is **0**. There is no 10-account anomaly;
   `auth.users` and `public.profiles` are both empty and mutually
   consistent.
2. **"`handle_new_user()` and `rls_auto_enable()` are exposed via
   PostgREST RPC"** — this needs a sharper distinction than the earlier
   report drew. What is actually proven (§F) is that both functions have
   `EXECUTE` privilege granted to `anon`/`authenticated` (the WARN-level
   Supabase Advisor findings, and directly confirmed via `pg_proc`'s ACL
   in §F) — **that is a privilege fact, verified**. Supabase's Advisor
   additionally *asserts* a specific route
   (`/rest/v1/rpc/handle_new_user`) would resolve to these functions.
   That assertion was **not independently re-verified with a real HTTP
   call against PostgREST** in this pass — and both functions have a
   `RETURNS trigger` / `RETURNS event_trigger` return type, which
   Postgres itself refuses to execute outside trigger context (`select
   handle_new_user()` raises `2F004: trigger functions can only be
   called as triggers`), so even if PostgREST *does* route the request,
   the practical exposure is "the route exists and errors on invocation
   as of today's function bodies," not "the route usefully executes
   attacker-controlled logic." Both halves — EXECUTE privilege (real,
   proven) and PostgREST RPC exposure/behavior (Advisor's claim,
   plausible but not independently HTTP-tested here) — should be kept
   analytically separate. See `docs/option-a-migration-review.md` for
   the equivalent, actually-HTTP-tested check against the local design's
   trigger functions.

## A. Connection identity

```sql
select current_database() as db, current_user as usr, version() as pg_version, current_setting('transaction_read_only') as read_only;
```

| db | usr | pg_version | read_only |
|---|---|---|---|
| postgres | postgres | PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit | off |

The Studio SQL Editor connects as full owner (`read_only = off`); every
statement executed against it in this pass was deliberately a bare
`SELECT`/CTE — the read-only discipline is enforced by never typing
anything else, not by the session itself.

## B. Real row counts — all 34 `public` tables

```sql
select * from (
  select 'admin_lockouts' t, count(*) c from public.admin_lockouts
  union all select 'blogs', count(*) from public.blogs
  union all select 'certificates', count(*) from public.certificates
  union all select 'comments', count(*) from public.comments
  union all select 'contact_messages', count(*) from public.contact_messages
  union all select 'coupon_redemptions', count(*) from public.coupon_redemptions
  union all select 'coupons', count(*) from public.coupons
  union all select 'course_progress', count(*) from public.course_progress
  union all select 'courses', count(*) from public.courses
  union all select 'enrollments', count(*) from public.enrollments
  union all select 'hifz_progress', count(*) from public.hifz_progress
  union all select 'invoices', count(*) from public.invoices
  union all select 'live_classes', count(*) from public.live_classes
  union all select 'manual_payments', count(*) from public.manual_payments
  union all select 'messages', count(*) from public.messages
  union all select 'notifications', count(*) from public.notifications
  union all select 'payments', count(*) from public.payments
  union all select 'post_likes', count(*) from public.post_likes
  union all select 'posts', count(*) from public.posts
  union all select 'profile_children', count(*) from public.profile_children
  union all select 'profiles', count(*) from public.profiles
  union all select 'quran_bookmarks', count(*) from public.quran_bookmarks
  union all select 'quran_memorization_stats', count(*) from public.quran_memorization_stats
  union all select 'quran_reading_progress', count(*) from public.quran_reading_progress
  union all select 'rate_limit_counters', count(*) from public.rate_limit_counters
  union all select 'referrals', count(*) from public.referrals
  union all select 'reviews', count(*) from public.reviews
  union all select 'student_records', count(*) from public.student_records
  union all select 'subscribers', count(*) from public.subscribers
  union all select 'system_audit_log', count(*) from public.system_audit_log
  union all select 'system_config', count(*) from public.system_config
  union all select 'trial_requests', count(*) from public.trial_requests
  union all select 'tutor_conversations', count(*) from public.tutor_conversations
  union all select 'wishlist_items', count(*) from public.wishlist_items
) x order by c desc, t;
```

**Result — every one of the 34 tables is exactly `c = 0`:**
`admin_lockouts, blogs, certificates, comments, contact_messages,
coupon_redemptions, coupons, course_progress, courses, enrollments,
hifz_progress, invoices, live_classes, manual_payments, messages,
notifications, payments, post_likes, posts, profile_children, profiles,
quran_bookmarks, quran_memorization_stats, quran_reading_progress,
rate_limit_counters, referrals, reviews, student_records, subscribers,
system_audit_log, system_config, trial_requests, tutor_conversations,
wishlist_items`. This is a real, exact `COUNT(*)`, not a Table
Editor/dashboard estimate.

## C. `auth.users` aggregates (no PII)

```sql
select count(*) as total, min(created_at) as min_created, max(created_at) as max_created,
  count(*) filter (where email_confirmed_at is not null) as confirmed,
  count(*) filter (where email_confirmed_at is null) as unconfirmed,
  count(*) filter (where last_sign_in_at is not null) as signed_in_at_least_once
from auth.users;
```

| total | min_created | max_created | confirmed | unconfirmed | signed_in_at_least_once |
|---|---|---|---|---|---|
| 0 | null | null | 0 | 0 | 0 |

## D. `profiles` ↔ `auth.users` relationship

```sql
select
  (select count(*) from public.profiles) as profiles_count,
  (select count(*) from auth.users u left join public.profiles p on p.id = u.id where p.id is null) as auth_without_profile,
  (select count(*) from public.profiles p left join auth.users u on u.id = p.id where u.id is null) as profile_without_auth,
  (select jsonb_agg(jsonb_build_object('role', role, 'count', c)) from (select role, count(*) c from public.profiles group by role) x) as profiles_role_distribution;
```

| profiles_count | auth_without_profile | profile_without_auth | profiles_role_distribution |
|---|---|---|---|
| 0 | 0 | 0 | null |

Fully consistent — no orphans in either direction, because both sides
are empty.

## E. Migration-tracking tables

```sql
select
  to_regclass('supabase_migrations.schema_migrations')::text as supabase_migrations,
  to_regclass('drizzle.__drizzle_migrations')::text as drizzle_migrations_schema,
  to_regclass('public.__drizzle_migrations')::text as public_drizzle_migrations,
  (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'name', c.relname, 'kind', c.relkind))
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relname ilike '%migration%') as migration_like_objects;
```

| supabase_migrations | drizzle_migrations_schema | public_drizzle_migrations |
|---|---|---|
| null | null | null |

`migration_like_objects` found only Supabase's own internal service
tables: `auth.schema_migrations`, `storage.migrations`,
`realtime.schema_migrations` — these track Supabase's own platform
schema versions, not this application. **Neither the Supabase CLI's
migration table nor drizzle-orm's `__drizzle_migrations` table has ever
existed on this project.** No migration — CLI-based or drizzle-based —
has ever been applied here.

## F. Functions, triggers, RLS, grants, roles, extensions

**Functions in `public` — exactly 2:**

```sql
select jsonb_build_object(
  'functions', (select jsonb_agg(jsonb_build_object('name', proname, 'args', pg_get_function_identity_arguments(p.oid), 'security_definer', prosecdef, 'config', proconfig) order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'triggers', (select jsonb_agg(jsonb_build_object('schema', event_object_schema, 'table', event_object_table, 'name', trigger_name, 'timing', action_timing, 'event', event_manipulation, 'action', action_statement)) from information_schema.triggers where event_object_schema in ('public','auth')),
  'handle_new_user_def', (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='handle_new_user'),
  'rls_auto_enable_def', (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='rls_auto_enable')
) as result;
```

- `handle_new_user()` — `SECURITY DEFINER`, `search_path=public`.
  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS trigger
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public'
  AS $function$
  begin
    insert into public.profiles (id, email, name, role)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      case
        when new.raw_user_meta_data ->> 'role' = 'parent' then 'parent'::role
        else 'student'::role
      end
    );
    return new;
  end;
  $function$
  ```
  **This is the REMOTE project's OLD function — it is not, and must
  never be confused with, the local design's `handle_new_user()`.** The
  local design (`lib/db/drizzle/0001_functions_triggers.sql`) replaces
  this entirely: every new signup gets `role = 'user'` unconditionally,
  the metadata `role` claim is read nowhere, and `search_path` is set to
  `''` (empty) with every reference fully schema-qualified — see
  `docs/option-a-migration-review.md` §1 for the verified local text.
  Admin is never derived from `auth.users` metadata in either version,
  but the remote version's `parent`/`student` branch on
  `raw_user_meta_data ->> 'role'` is exactly the multi-role-from-metadata
  pattern the local design deliberately removes.
- `rls_auto_enable()` — `SECURITY DEFINER`, `search_path=pg_catalog`, an
  **event trigger** handler that auto-`ALTER TABLE ... ENABLE ROW LEVEL
  SECURITY`s any newly created `public` table. Confirmed to be
  Supabase Studio's own project default (not custom application code) —
  see `docs/option-a-cascade-scope.md` for the empirically-tested
  decision on what happens to it under Option A.

**Triggers:** exactly one exists anywhere: `on_auth_user_created AFTER
INSERT ON auth.users EXECUTE FUNCTION handle_new_user()`. No triggers on
any `public` table.

**RLS + policies + grants:**

```sql
select jsonb_build_object(
  'rls_summary', (select jsonb_agg(jsonb_build_object('table', relname, 'rowsecurity', relrowsecurity, 'forced', relforcerowsecurity) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
  'policy_count', (select count(*) from pg_policies where schemaname='public'),
  'policies', (select jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'cmd', cmd, 'roles', roles)) from pg_policies where schemaname='public'),
  'grants', (select jsonb_agg(jsonb_build_object('grantee', grantee, 'table', table_name, 'priv', privilege_type)) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role','supabase_privileged_role'))
) as result;
```

- `rowsecurity = true` on all 34 tables, `forced = false` on all
  (standard — owner/superuser still bypasses).
- **`policy_count = 0`** — confirmed directly via `pg_policies`, not
  inferred.
- **Grants: every one of the 34 tables grants full `INSERT / SELECT /
  UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER` to `anon`,
  `authenticated`, AND `service_role`.** With RLS enabled and zero
  policies, Postgres denies every operation for `anon`/`authenticated`
  today (only `service_role`/owner bypass RLS) — so the practical effect
  is "0 rows visible, 0 rows writable" via the Data API. But the GRANT
  layer itself is wide open, not narrowly scoped — today's lockout
  depends entirely on RLS staying enabled with no policies, not on a
  deliberately scoped permission model. `supabase_privileged_role` holds
  no explicit grants on any of the 34 tables.

**Roles, `supabase_privileged_role`, extensions, cron, storage:**

```sql
select jsonb_build_object(
  'supabase_migrations', to_regclass('supabase_migrations.schema_migrations')::text,
  'drizzle_migrations_schema', to_regclass('drizzle.__drizzle_migrations')::text,
  'public_drizzle_migrations', to_regclass('public.__drizzle_migrations')::text,
  'migration_like_objects', (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'name', c.relname, 'kind', c.relkind)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relname ilike '%migration%'),
  'roles', (select jsonb_agg(jsonb_build_object('rolname', rolname, 'super', rolsuper, 'login', rolcanlogin, 'bypassrls', rolbypassrls)) from pg_roles where rolname in ('anon','authenticated','service_role','postgres','supabase_privileged_role')),
  'privileged_role_memberships', (select jsonb_agg(jsonb_build_object('role', r.rolname, 'member_of', m.rolname)) from pg_auth_members am join pg_roles r on r.oid=am.member join pg_roles m on m.oid=am.roleid where r.rolname='supabase_privileged_role' or m.rolname='supabase_privileged_role'),
  'privileged_role_owned_objects', (select jsonb_agg(jsonb_build_object('name', c.relname, 'kind', c.relkind)) from pg_class c join pg_roles r on r.oid=c.relowner where r.rolname='supabase_privileged_role' and c.relnamespace='public'::regnamespace),
  'extensions', (select jsonb_agg(jsonb_build_object('name', extname, 'schema', extnamespace::regnamespace::text, 'version', extversion)) from pg_extension),
  'cron_job_table', to_regclass('cron.job')::text,
  'storage_buckets_count', (select count(*) from storage.buckets)
) as result;
```

- Roles: `postgres` (login, `bypassrls=true`, `super=false` — Supabase's
  managed `postgres` is not a real Postgres superuser), `anon` /
  `authenticated` (no login, no bypass — normal), `service_role` (no
  login, `bypassrls=true` — normal), `supabase_privileged_role` (no
  login, no bypass).
- `supabase_privileged_role`: **exists**; `postgres` and
  `supabase_etl_admin` are both members *of* it (a role group they
  belong to). Holds **zero grants** on any of the 34 tables and **owns
  zero objects** in `public`. Reads as a Supabase-platform-internal role
  (its `supabase_etl_admin` fellow member suggests their logical-
  replication/ETL feature), not anything the Alrahma application
  created or depends on.
- Extensions (all schemas): `plpgsql` (pg_catalog), `pg_stat_statements`
  (extensions), `uuid-ossp` (extensions), `pgcrypto` (extensions),
  `supabase_vault` (vault, v0.3.1 — **not visible on the dashboard's
  Extensions page, only found via this SQL query**). `pg_cron` is
  **not installed** (`cron_job_table` → `null`).
- `storage_buckets_count = 0` (matches dashboard: 0 buckets).

## G. Backup status

Checked via Database → Backups (dashboard, read-only, no SQL
equivalent): **"Free Plan does not include project backups."** No
scheduled daily backups, no Point-in-Time Recovery — both require
upgrading to the Pro plan. **There is currently no restorable backup of
this project, at all.** This is treated as a hard precondition for any
destructive option, independent of how empty the data turns out to be —
see `docs/option-a-cascade-scope.md` and the rehearsal report.

## What this document does not cover

Exact Advisor lint output (37 unindexed-FK / 34 `rls_enabled_no_policy` /
2 `no_primary_key` INFO findings, 4 WARN findings on the two functions'
PostgREST-RPC exposure) is summarized above and in the corrections
section, not reproduced verbatim here (it is not PII, but it is a large,
mechanically-generated block better read live in Advisors if needed
again). Full column-level types/defaults for all 34 tables were captured
during the read-only pass but are not reproduced verbatim here to keep
this document to what materially affects the Option A decision — see
`docs/remote-reconciliation-proposal.md` for the table-name-level
Remote-vs-Local comparison this document's facts feed into.
