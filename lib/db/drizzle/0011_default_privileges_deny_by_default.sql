-- Deny-by-default posture for FUTURE functions in schema public.
--
-- This is a clean-empty-database baseline migration, verified only
-- against a throwaway LOCAL Docker Postgres / local Supabase CLI
-- stack. It has NOT been applied to the real Supabase project. It is
-- tracked by drizzle-orm's migrate() runner via meta/_journal.json
-- exactly like every migration before it.
--
-- Every EXISTING function's PUBLIC-default EXECUTE grant is already
-- revoked: 0002_rls.sql and 0004_privilege_reconciliation.sql each run
-- a blanket `revoke execute on all functions in schema public from
-- public` (covering every function that existed at the time each ran),
-- and every function added after 0002 (0005-0009) carries its own
-- explicit `revoke execute ... from public, anon[, authenticated]`
-- alongside its `grant execute ... to service_role`/etc. That closes
-- the gap for every function this migration set has ever created SO
-- FAR — but says nothing about a FUTURE migration's function.
--
-- ---------------------------------------------------------------------
-- A REAL, TESTED CORRECTION to the first version of this migration
-- ---------------------------------------------------------------------
-- The obvious-looking fix —
--   alter default privileges in schema public
--     revoke execute on functions from public;
-- — was written first, and empirically tested (not assumed) against a
-- disposable local Postgres 16 database before being committed. It
-- does NOT work: it runs without error but produces no `pg_default_acl`
-- row and has zero effect on a subsequently-created function. Root
-- cause, confirmed by direct catalog inspection
-- (`select * from pg_default_acl`) and a real behavioral test (a fresh
-- role created after the ALTER could still EXECUTE a function created
-- after the ALTER): `pg_default_acl` only stores a DELTA against
-- Postgres's hard-coded built-in default privilege set, and a REVOKE
-- that would need to express "less than the hard-coded default" simply
-- deletes any matching row instead of storing one (confirmed
-- separately: explicitly GRANTing to PUBLIC first, to force a row to
-- exist, then REVOKEing it, deletes the row back to 0 — reverting to
-- the hard-coded default rather than recording "nothing"). Postgres's
-- hard-coded default for a newly created FUNCTION is EXECUTE granted
-- to PUBLIC, and `ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM PUBLIC`
-- has no mechanism to override that hard-coded default — only to undo
-- a previous `ALTER DEFAULT PRIVILEGES ... GRANT` in the same role/
-- schema/object-type slot. This is a real, general PostgreSQL
-- limitation (not Supabase- or version-specific — reproduced on plain
-- `postgres:16`), and this migration's first version would have shipped
-- a silent no-op that looked like a real safeguard.
--
-- The REAL fix uses the same tool the real project's own
-- `rls_auto_enable()` already uses for the mirror-image problem
-- (new tables not getting RLS enabled automatically): an event
-- trigger. `revoke_public_execute_auto()` fires on every
-- `ddl_command_end` for a `CREATE FUNCTION`/`CREATE PROCEDURE` inside
-- `public` (this also fires on `CREATE OR REPLACE FUNCTION`, which
-- reports the same `CREATE FUNCTION` command tag — confirmed by
-- testing, not assumed) and explicitly revokes PUBLIC's EXECUTE on the
-- object just created, every time, unconditionally. A later, separate
-- `grant execute on function ... to service_role` (or any other role)
-- in the same or a later migration is unaffected — this only ever
-- removes the PUBLIC pseudo-role's blanket grant, never a specific
-- role's own grant.
--
-- Verified empirically after writing this version: created an
-- `experimental_future_function()` with zero grants/revokes of its own
-- immediately after applying this migration — confirmed via
-- `has_function_privilege('anon', ..., 'execute')`,
-- `has_function_privilege('authenticated', ..., 'execute')`, and a
-- real `SET ROLE`-based call attempt, all denied. See
-- docs/option-a-surgical-reset-design.md for the full test transcript.
create or replace function public.revoke_public_execute_auto()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('revoke execute on function %s from public', cmd.object_identity);
        raise log 'revoke_public_execute_auto: revoked PUBLIC execute on %', cmd.object_identity;
      exception
        when others then
          raise log 'revoke_public_execute_auto: failed to revoke PUBLIC execute on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;
--> statement-breakpoint

revoke execute on function public.revoke_public_execute_auto() from public;
--> statement-breakpoint

drop event trigger if exists revoke_public_execute_auto_trigger;
--> statement-breakpoint

create event trigger revoke_public_execute_auto_trigger on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  execute function public.revoke_public_execute_auto();
