-- RLS Remediation Round 3 (Section F — refund integrity).
-- Still NOT applied to the real Supabase project — verified only against
-- a throwaway local Docker Postgres, same discipline as every prior
-- migration.
--
-- Two real gaps:
--   1. validate_refund_insert() (0001) never rejected a zero or negative
--      amount_minor. payments' own table-level CHECK
--      (payments_amount_minor_nonneg) only guarantees `>= 0` — that's
--      correct for a CHARGE row (a 100%-discounted charge can
--      legitimately be 0), but a REFUND of 0 or less is never
--      meaningful and was never actually blocked.
--   2. admin_issue_refund()'s name claims it "issues a refund" — but it
--      never calls Stripe/PayPal. It only writes a row to this ledger
--      recording that a refund happened (or is being tracked). Confirmed
--      via git grep across the entire tracked AND untracked repo before
--      this migration: zero real callers exist anywhere (see the
--      approved plan's "Verified before planning" section) — this is a
--      free, honest rename, not a breaking change to anything real.
--
-- validate_refund_insert() — same signature, CREATE OR REPLACE in place
-- (trigger functions take no explicit params). Adds an explicit
-- amount_minor > 0 check for refund rows specifically (the `> 0` rule
-- belongs here, not as a table-wide CHECK, exactly because a charge row
-- legitimately allows 0). Every other check from 0001 (locked parent,
-- succeeded-charge-only, user/currency/gateway match, refund-sum-vs-
-- charge-amount cap) is unchanged — already real, re-verified as part of
-- this round's full test run, not rebuilt.
create or replace function public.validate_refund_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent public.payments%rowtype;
  already_refunded integer;
begin
  if new.kind <> 'refund' then
    return new;
  end if;

  if new.amount_minor is null or new.amount_minor <= 0 then
    raise exception 'refund amount_minor must be greater than zero (got %)', new.amount_minor;
  end if;

  select * into parent
  from public.payments
  where id = new.parent_payment_id
  for update;

  if not found then
    raise exception 'payments.parent_payment_id % does not reference an existing payments row', new.parent_payment_id;
  end if;

  if parent.kind <> 'charge' then
    raise exception 'payments row % cannot refund another refund (parent_payment_id=% has kind=%)', new.id, new.parent_payment_id, parent.kind;
  end if;

  if parent.status <> 'succeeded' then
    raise exception 'payments row % cannot refund a charge that has not succeeded (parent_payment_id=% has status=%)', new.id, new.parent_payment_id, parent.status;
  end if;

  if new.user_id <> parent.user_id then
    raise exception 'refund user_id (%) does not match its parent charge''s user_id (%)', new.user_id, parent.user_id;
  end if;

  if new.currency_snapshot <> parent.currency_snapshot then
    raise exception 'refund currency_snapshot (%) does not match its parent charge''s currency_snapshot (%)', new.currency_snapshot, parent.currency_snapshot;
  end if;

  if new.gateway <> parent.gateway then
    raise exception 'refund gateway (%) does not match its parent charge''s gateway (%)', new.gateway, parent.gateway;
  end if;

  select coalesce(sum(amount_minor), 0) into already_refunded
  from public.payments
  where parent_payment_id = parent.id
    and kind = 'refund'
    and status in ('succeeded', 'pending');

  if already_refunded + new.amount_minor > parent.amount_minor then
    raise exception 'refund of % would exceed the refundable balance on payments row % (already refunded %, charge amount %)',
      new.amount_minor, parent.id, already_refunded, parent.amount_minor;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

-- admin_issue_refund(uuid, integer) -> admin_record_refund(uuid,
-- integer, text). Renamed AND re-scoped: p_gateway_refund_id (optional)
-- is stored in the new row's existing gateway_payment_id column (reused
-- — that column is already generically "this row's identifier at the
-- gateway" per payments.ts's own doc comment, not a new column) — the
-- existing unique(gateway, gateway_payment_id) index then gives a real,
-- free guarantee against recording the same gateway-side refund twice.
-- Doc comment states plainly what this function does NOT do: it never
-- calls Stripe/PayPal. The actual gateway-side refund call is the
-- admin's (or a future webhook handler's) own responsibility, entirely
-- out of scope here — recording this function as though it performed a
-- real refund would be dishonest about what the code actually does.
-- Ordering contract, stated explicitly since there is no real gateway
-- integration to order against yet: this ledger row is written
-- immediately, not gated on any external confirmation — a real gateway-
-- call-first ordering is a genuine, deferred design point for whenever
-- gateway integration is actually built (see docs/rls-matrix.md's
-- refund/provider-integration section), not solved by this migration.
-- Also fails fast on a zero/negative amount at the RPC layer (redundant
-- with the trigger fix above, matching this codebase's established
-- multi-layer-defense discipline — a clearer message at the call site,
-- not a substitute for the trigger's own real enforcement). The parent-
-- charge row lock and its concurrency guarantee are entirely
-- validate_refund_insert()'s (unchanged, re-verified this round) — this
-- RPC does not duplicate that logic, it relies on it, same as before.
drop function if exists public.admin_issue_refund(uuid, integer);--> statement-breakpoint

create function public.admin_record_refund(
  p_charge_id uuid,
  p_amount_minor integer,
  p_gateway_refund_id text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.payments;
  refund public.payments;
begin
  if not public.is_admin_aal2() then
    raise exception 'admin_record_refund: caller is not an AAL2-verified admin';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'admin_record_refund: p_amount_minor must be greater than zero (got %)', p_amount_minor;
  end if;

  select * into charge from public.payments where id = p_charge_id;
  if not found then
    raise exception 'admin_record_refund: no payments row %', p_charge_id;
  end if;

  -- validate_refund_insert() (0001, amended by this migration) still
  -- independently enforces every real constraint (locked-parent-row,
  -- succeeded-only, amount cap, amount > 0, matching user/currency/
  -- gateway) — this RPC relies on it, never duplicates it.
  insert into public.payments (user_id, plan_id, subscription_id, kind, parent_payment_id, amount_minor, currency_snapshot, gateway, gateway_payment_id, status)
  values (charge.user_id, charge.plan_id, charge.subscription_id, 'refund', charge.id, p_amount_minor, charge.currency_snapshot, charge.gateway, p_gateway_refund_id, 'succeeded')
  returning * into refund;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'admin_record_refund', 'payments', refund.id::text,
    jsonb_build_object('charge_id', charge.id, 'charge_amount_minor', charge.amount_minor),
    jsonb_build_object('refund_id', refund.id, 'refund_amount_minor', refund.amount_minor, 'gateway_refund_id', refund.gateway_payment_id)
  );

  return refund;
end;
$$;
--> statement-breakpoint

-- EXECUTE — REVOKE first. admin_record_refund is a fresh function object
-- at this signature (a genuine DROP + CREATE, not a same-signature
-- REPLACE of a previously-granted function) — Postgres auto-grants
-- EXECUTE to PUBLIC on CREATE FUNCTION, so this is not redundant.
revoke execute on function public.admin_record_refund(uuid, integer, text) from public, anon;--> statement-breakpoint
grant execute on function public.admin_record_refund(uuid, integer, text) to authenticated;
