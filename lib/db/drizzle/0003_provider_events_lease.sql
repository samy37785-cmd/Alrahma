-- RLS Remediation Round 2 (finding 7): webhook claim lease/timeout.
-- Still NOT applied to the real Supabase project — verified only against
-- a throwaway local Docker Postgres, same discipline as 0000-0002.
--
-- claim_provider_event() (0001_functions_triggers.sql) does the atomic
-- pending -> processing claim, but had no lease/timeout at all: a worker
-- that claimed an event and then crashed mid-processing left it stuck in
-- 'processing' forever, with no recovery path — a real, undiscussed gap.
--
-- The auto-generated column addition below (provider_events.claimed_at)
-- is followed by hand-authored SQL: claim_provider_event() is redefined
-- (via CREATE OR REPLACE, overriding 0001's version — it must live here,
-- not in 0001, since it references a column that doesn't exist until
-- this migration runs) to also set claimed_at = now() on claim, and a
-- new reclaim_stale_provider_events() gives a real recovery contract —
-- atomically resets any event stuck in 'processing' past a staleness
-- threshold back to 'pending' (clearing claimed_at) so a fresh
-- claim_provider_event() call can pick it up again. service_role-only,
-- same as the other webhook-worker functions (0002_rls.sql's GRANT
-- scheme) — never a client call.
ALTER TABLE "provider_events" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint

create or replace function public.claim_provider_event(p_id uuid)
returns setof public.provider_events
language sql
set search_path = ''
as $$
  update public.provider_events
  set processing_status = 'processing',
      claimed_at = now()
  where id = p_id
    and processing_status = 'pending'
  returning *;
$$;
--> statement-breakpoint

create or replace function public.reclaim_stale_provider_events(p_stale_after interval default '10 minutes')
returns setof public.provider_events
language sql
set search_path = ''
as $$
  update public.provider_events
  set processing_status = 'pending',
      claimed_at = null
  where processing_status = 'processing'
    and claimed_at < now() - p_stale_after
  returning *;
$$;
--> statement-breakpoint

grant execute on function public.reclaim_stale_provider_events(interval) to service_role;
