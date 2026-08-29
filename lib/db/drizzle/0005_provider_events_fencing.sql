-- RLS Remediation Round 3 (Section B — fenced webhook lease).
-- Still NOT applied to the real Supabase project — verified only against
-- a throwaway local Docker Postgres, same discipline as every prior
-- migration.
--
-- Real bug in the Round 2 lease (0003_provider_events_lease.sql): it had
-- an expiry (claimed_at + staleness threshold) but no FENCING identity.
-- Sequence that actually broke it: worker A claims an event; A stalls
-- (GC pause, network partition, anything short of a crash) past the
-- staleness threshold; reclaim_stale_provider_events() resets the row to
-- 'pending'; worker B claims it and starts processing; A, still alive,
-- finally finishes its (stale) work and calls complete_provider_event(),
-- which only ever checked `id` + `processing_status = 'processing'` — it
-- has no idea A isn't the current owner, so A's call succeeds, silently
-- closing out B's still-in-flight claim (B's own later completion call
-- then matches zero rows, since the row is no longer 'processing').
--
-- Fix: an explicit fencing token. Chose a random UUID (`claim_token`)
-- over a monotonically-incrementing generation counter — both are valid
-- fencing-token designs (Chubby/Zookeeper's classic "fencing token"
-- pattern), but a UUID needs no separate sequence/counter column, can't
-- collide across concurrent claims without coordination, and the
-- generation-counter's only real advantage (ordering: "is this token
-- newer than that one") isn't needed here — completion only ever checks
-- CURRENT-token equality, never relative ordering.
--
-- claim_provider_event() (same signature — CREATE OR REPLACE in place)
-- now mints a fresh claim_token on every successful claim, including a
-- reclaim-then-reclaim by a new worker, and sets an explicit
-- lease_expires_at (a fixed, named 5-minute constant — see the function
-- body; the task sanctions a fixed duration as an alternative to a
-- caller-supplied one, and keeping this function's signature unchanged
-- avoids an unnecessary overload-cleanup step for a function real code
-- already depends on positionally). It also increments attempt_count.
--
-- complete_provider_event() signature CHANGES (new 2nd positional
-- parameter, p_claim_token) — DROP FUNCTION first (Postgres function
-- identity includes the parameter type list; this is a genuinely new
-- function object, not an in-place edit). It now only completes
-- `WHERE ... AND claim_token = p_claim_token`: a stale worker's old
-- token can never match a row a second claimant has since re-claimed
-- (the row's claim_token changed under it), so the stale completion
-- call matches zero rows — a silent no-op (this codebase's established
-- "0 rows = legitimately didn't apply to you" idiom, same as
-- mark_notification_read()), not an error, and critically: it does NOT
-- touch processed_at/error_code, so it can never overwrite the real
-- worker's outcome. Confirmed zero real call sites anywhere in the
-- tracked or untracked repo before this rename-by-signature (see the
-- approved plan's "Verified before planning" section) — nothing breaks.
--
-- reclaim_stale_provider_events() (same signature — CREATE OR REPLACE in
-- place) now: rejects a negative interval outright (a negative value
-- would mean "reclaim things whose lease hasn't expired yet" — a real
-- hazard, not a theoretical one, since it would let a worker's own
-- still-valid claim be stolen out from under it); matches on
-- lease_expires_at instead of claimed_at + a caller-supplied threshold
-- (the expiry is now decided once, at claim time, not re-decided at
-- every reclaim call with whatever threshold happens to be passed); and
-- treats a NULL lease_expires_at as stale (the IS NULL branch below) as
-- a safety net for any row that somehow still carries no lease — the
-- self-heal UPDATE right below is what actually clears out every such
-- row left over from BEFORE this migration, so in steady state after
-- this migration the IS NULL branch should never fire, but the function
-- stays correct even if one ever appears later (e.g. a hand-written
-- INSERT). What happens to processed_at/error_code on a reclaim:
-- NOTHING — a reclaim only ever resets processing_status/claimed_at/
-- lease_expires_at/claim_token; those two columns are set exclusively by
-- a SUCCESSFUL complete_provider_event() call, never by a reclaim,
-- documented here explicitly per the task's ask. attempt_count is left
-- untouched by reclaim (it only grows via claim_provider_event()) — a
-- bounded-retry policy (e.g. "give up and flip to failed after N
-- attempts") is a real, deliberately DEFERRED item this round: there is
-- no product signal anywhere in this codebase for what N should be, or
-- what "give up" should mean for a payment webhook (silently dropping a
-- real Stripe/PayPal event is not a decision to make by default). Left
-- as unbounded-retry-until-manually-investigated, named here rather than
-- silently implied to be handled — see docs/rls-matrix.md's fencing
-- section for the restated version of this same deferral.
--
-- IMPORTANT — what this DOES and does NOT guarantee: this is DB-level
-- fencing. It guarantees at most one worker's complete_provider_event()
-- call can ever succeed per claim (single-current-owner), i.e.
-- AT-LEAST-ONCE delivery with a safe single-owner completion. It does
-- NOT by itself make an external side effect (sending an email, calling
-- a payment gateway a second time) EXACTLY-once — a worker that starts
-- real side-effect work, THEN has its lease stolen by a reclaim, may
-- still have that side effect actually happen even though its eventual
-- complete_provider_event() call is rejected. True business-level
-- idempotency needs the worker's own mutation to be keyed on
-- provider_event_id (or, for the payment-recording side effect
-- specifically, payments' own unique(gateway, gateway_payment_id) index
-- already provides exactly that, independent of this table). This
-- migration does not claim exactly-once anywhere, and no documentation
-- produced by this round should either.
ALTER TABLE "provider_events" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "provider_events_processing_lease_idx" ON "provider_events" USING btree ("lease_expires_at") WHERE "provider_events"."processing_status" = 'processing';--> statement-breakpoint

-- Self-heal: any row left stuck in 'processing' from BEFORE this
-- migration has no fencing info at all (claim_token/lease_expires_at
-- both NULL by definition, since the columns didn't exist yet) — reset
-- it to 'pending' as part of applying this migration itself, not left
-- for a human to notice or for the IS NULL safety branch to paper over
-- forever. This is exactly the legacy shape Section I's Scenario 2
-- upgrade test injects and verifies gets healed.
update public.provider_events
set processing_status = 'pending',
    claimed_at = null
where processing_status = 'processing'
  and claim_token is null;--> statement-breakpoint

create or replace function public.claim_provider_event(p_id uuid)
returns setof public.provider_events
language sql
set search_path = ''
as $$
  update public.provider_events
  set processing_status = 'processing',
      claimed_at = now(),
      claim_token = gen_random_uuid(),
      lease_expires_at = now() + interval '5 minutes',
      attempt_count = attempt_count + 1
  where id = p_id
    and processing_status = 'pending'
  returning *;
$$;
--> statement-breakpoint

drop function if exists public.complete_provider_event(uuid, public.provider_event_status, text);--> statement-breakpoint

create function public.complete_provider_event(
  p_id uuid,
  p_claim_token uuid,
  p_result public.provider_event_status,
  p_error_code text default null
)
returns setof public.provider_events
language plpgsql
set search_path = ''
as $$
begin
  if p_result not in ('processed', 'failed', 'ignored') then
    raise exception 'complete_provider_event: p_result must be processed, failed, or ignored (got %)', p_result;
  end if;

  return query
  update public.provider_events
  set processing_status = p_result,
      processed_at = now(),
      error_code = p_error_code
  where id = p_id
    and processing_status = 'processing'
    and claim_token = p_claim_token
  returning *;
end;
$$;
--> statement-breakpoint

create or replace function public.reclaim_stale_provider_events(p_stale_after interval default '0 seconds')
returns setof public.provider_events
language plpgsql
set search_path = ''
as $$
begin
  if p_stale_after < interval '0' then
    raise exception 'reclaim_stale_provider_events: p_stale_after must not be negative (got %)', p_stale_after;
  end if;

  return query
  update public.provider_events
  set processing_status = 'pending',
      claimed_at = null,
      claim_token = null,
      lease_expires_at = null
  where processing_status = 'processing'
    and (lease_expires_at is null or lease_expires_at < now() - p_stale_after)
  returning *;
end;
$$;
--> statement-breakpoint

-- EXECUTE restated explicitly for all 3 functions in this same file, per
-- Section A's "never assume a prior grant is still correct" discipline —
-- even where technically redundant with 0002/0003/0004 and unchanged by
-- CREATE OR REPLACE. complete_provider_event() is a genuinely NEW
-- function object after the DROP above (a fresh CREATE FUNCTION, not an
-- in-place replace) — Postgres auto-grants EXECUTE to PUBLIC on function
-- creation by default (unlike tables, which start with no privileges),
-- so this REVOKE for it is NOT redundant: without it, the new function
-- would be callable by anon/authenticated despite never having been
-- granted to them, exactly the Round 2 finding-5 class of bug, now
-- against this round's own new function.
revoke execute on function public.claim_provider_event(uuid) from public, anon, authenticated;--> statement-breakpoint
revoke execute on function public.complete_provider_event(uuid, uuid, public.provider_event_status, text) from public, anon, authenticated;--> statement-breakpoint
revoke execute on function public.reclaim_stale_provider_events(interval) from public, anon, authenticated;--> statement-breakpoint
grant execute on function public.claim_provider_event(uuid) to service_role;--> statement-breakpoint
grant execute on function public.complete_provider_event(uuid, uuid, public.provider_event_status, text) to service_role;--> statement-breakpoint
grant execute on function public.reclaim_stale_provider_events(interval) to service_role;