# Option A — Migration Review (pre-rehearsal checklist)

Static review of `lib/db/drizzle/0000`-`0010` against the task's
checklist, each item backed by an actual grep/read of the migration
source (paths and line evidence below), not a restated assumption.

## 1. `auth.users` is never created or dropped

```sh
grep -n "auth\.users\|CREATE SCHEMA\|DROP TABLE\|DROP SCHEMA" lib/db/drizzle/*.sql
```

Only hits: `0000_init_20_table_baseline.sql`'s own header comment
explicitly documenting that it does **not** `CREATE SCHEMA "auth"` /
`CREATE TABLE "auth"."users"` (Supabase Auth owns them), and
`0001_functions_triggers.sql`'s trigger definition, which only
*references* `auth.users` (`AFTER INSERT ON auth.users`) — never
creates, alters, or drops it. Confirmed: nothing in 0000-0010 touches
`auth.users`'s existence.

## 2. `on_auth_user_created` is created safely (idempotent)

`0001_functions_triggers.sql:59-65`:
```sql
drop trigger if exists on_auth_user_created on auth.users;
--> statement-breakpoint

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```
`drop trigger if exists` first means re-running this migration (or
applying it after a prior partial state) never errors on "trigger
already exists" — this is also exactly the statement that recreates the
trigger after Option A's schema drop (see
`docs/option-a-cascade-scope.md`).

## 3. `handle_new_user()`: `SECURITY DEFINER`, empty `search_path`, qualified names

`0001_functions_triggers.sql:42-56`:
```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'user'
  );
  return new;
end;
$$;
```
`search_path = ''` (empty, not `'public'`), and the only referenced
table is fully qualified (`public.profiles`) — confirmed, matches the
checklist exactly. This is a real, deliberate hardening over the
**remote** project's current `handle_new_user()`, which uses
`search_path = 'public'` (non-empty) — see
`docs/remote-supabase-inventory.md` §F for the remote text side by side.

## 4. Public signup creates `role = 'user'` only; metadata can never create admin

Same block above: the `role` column is set to the **literal string
`'user'`**, full stop — `new.raw_user_meta_data` is read only for the
display `name` fallback, never for `role`. There is no code path in
0000-0010 where any `INSERT`/`UPDATE` driven by `authenticated`/`anon`
can set `profiles.role = 'admin'`. The only function capable of
assigning `role` at all besides this trigger is `admin_set_role(uuid,
account_role)` (`0002_rls.sql`), which is itself `REVOKE`d from
`public`/`anon` and only `GRANT`ed to `authenticated` — gated by RLS/the
function body requiring the *caller* already be an admin (existing
`is_admin()`/`is_admin_aal2()` checks, confirmed in `0002_rls.sql:23-53`
— see `docs/remote-supabase-inventory.md` §F for how `is_admin()` is
defined: `profiles.role = 'admin'`, never metadata). Promotion to admin
is exclusively an out-of-band, already-admin-gated DB action.

## 5. Exactly the 20 tables

```sh
grep -c '^CREATE TABLE' lib/db/drizzle/0000_init_20_table_baseline.sql
```
→ `20`. Names: `admin_audit_log, coupon_redemptions, coupons, invoices,
manual_payments, blogs, subscribers, testimonials, trial_requests,
enrollments, profiles, quran_bookmarks, quran_memorization_stats,
quran_reading_progress, plans, subscriptions, payments, provider_events,
notification_preferences, notifications`. No `CREATE TABLE` appears in
any other migration file (0001-0010 only add constraints, indexes,
functions, triggers, RLS, and policies on top of these 20).

## 6. RLS / Policies / Grants applied in full

`0002_rls.sql`: `grep -c "enable row level security"` → `20` (one per
table); `grep -c "^create policy"` → `51`. Grants use Supabase's own
convention (broad `anon`/`authenticated` SQL-level privilege, RLS as the
real row-level gate), matching the file's own header comment.

## 7. Every `SECURITY DEFINER` function: `REVOKE EXECUTE FROM PUBLIC` then specific grants

`0002_rls.sql:753` issues the baseline blanket
`revoke execute on all functions in schema public from public;` once,
then every migration that introduces new `SECURITY DEFINER` functions
re-does its own explicit revoke+grant for exactly those new functions
(because `CREATE FUNCTION` re-grants `PUBLIC` EXECUTE by default unless
revoked again): confirmed present in `0002_rls.sql:806-814`,
`0004_privilege_reconciliation.sql:50,97-106`,
`0005_provider_events_fencing.sql:194-199`,
`0006_subscription_integrity.sql:312-317`,
`0007_invoice_integrity.sql:202-203`, `0008_plan_versioning.sql:256-261`,
`0009_refund_integrity.sql:169-170`. `0010_round4_integrity_fixes.sql`
only `CREATE OR REPLACE`s two *existing*, already-granted functions
(`create_plan_version`, `issue_invoice_from_payment`) — `CREATE OR
REPLACE FUNCTION` preserves existing grants in Postgres, so no new,
ungranted `SECURITY DEFINER` function is introduced by 0010. No
function was found with `security definer` and no matching
revoke/grant pair.

**RETURNS trigger / RPC-exposure distinction, tested for real (not
asserted):** the local design's own `handle_new_user()` and every other
trigger-only function are `SECURITY DEFINER` with `RETURNS trigger`.
Whether that combination is *actually* invokable via a PostgREST RPC
call is verified empirically against the local Supabase stack rehearsal
(§ in the rehearsal report) by making a real HTTP request to
`/rest/v1/rpc/handle_new_user`, rather than asserted from the function's
catalog metadata alone.

## 8. `admin`/AAL2 contract

`0002_rls.sql:23-53`:
```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_admin_aal2()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin() and (auth.jwt() ->> 'aal') = 'aal2';
$$;
```
`is_admin()` reads only `profiles.role`, never JWT/session metadata.
`is_admin_aal2()` additionally requires the session's AAL claim to be
`'aal2'` (MFA step-up completed) — used to gate every policy touching
money, role, or the audit log (`enrollments_update_admin_aal2`,
`plans_update_admin_aal2`, etc., `0002_rls.sql:199-228` and onward).
Matches the design contract this engagement's prior rounds fixed in
place.

## 9. Not relying on `drizzle-kit push`

`lib/db/test/run-migrations.mjs:17-18` imports
`drizzle-orm/node-postgres/migrator`'s `migrate()` — this is the only
mechanism used to apply `lib/db/drizzle/*.sql` anywhere in this repo's
test/rehearsal tooling. `drizzle-kit push` exists only as a manual,
separate `pnpm run push`/`push-force` script in `lib/db/package.json`,
documented and used for schema *drafting* against a scratch database,
never as part of any applied-migration path.

## 10. Checksum guard precedes applying published migrations

`lib/db/package.json`'s `test:db` script:
```
check:published-migrations && run-migrations.mjs && schema.local.test.mjs && ...
```
`check:published-migrations` (pure filesystem sha256 + journal-timestamp
check against `0000`-`0003`, no DB needed) runs first and is a real,
blocking gate — a failure there (`process.exit(1)`) stops the `&&` chain
before `run-migrations.mjs` ever connects to a database. Established and
verified in RLS Remediation Round 4; unchanged since.

## Conclusion

All ten checklist items are independently verified against the actual
migration source, not restated from memory. No item required a fix in
this pass — the migrations were already correct on all of these axes
going into this task. The rehearsal (next section) is what proves this
holds when actually *applied*, not merely read.
