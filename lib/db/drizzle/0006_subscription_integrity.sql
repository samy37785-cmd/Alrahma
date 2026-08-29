-- RLS Remediation Round 3 (Section C — subscriptions are RPC-only).
-- Still NOT applied to the real Supabase project — verified only against
-- a throwaway local Docker Postgres, same discipline as every prior
-- migration.
--
-- Real bug: subscriptions_update_admin_aal2 (0002_rls.sql) plus its
-- table-level GRANT UPDATE let ANY AAL2 admin change EVERY column on a
-- subscriptions row directly with a plain UPDATE — including user_id,
-- provider, provider_customer_id, provider_subscription_id, status —
-- with no transition validation and no audit trail. This migration:
-- drops that raw policy/grant, adds a real invariant-enforcing trigger
-- that applies to every UPDATE regardless of role (including
-- service_role — real constraint enforcement, not just an RLS bypass
-- concern), and replaces free-form admin/service writes with 3 narrow,
-- purpose-built RPCs.
ALTER TABLE "manual_payments" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint

drop policy if exists subscriptions_update_admin_aal2 on public.subscriptions;--> statement-breakpoint
revoke update on public.subscriptions from authenticated;--> statement-breakpoint

-- 0004_privilege_reconciliation.sql's restated matrix (deliberately, per
-- its own closing comment, a faithful restatement of Round 2's END
-- state, not a prediction of this round) also carried forward a raw
-- INSERT grant on subscriptions to authenticated — but subscriptions
-- never had a matching INSERT policy at any point (0002_rls.sql only
-- ever defined SELECT/UPDATE policies for it), so that grant was
-- already unusable: RLS, not the GRANT layer, was the real (if
-- accidental) reason a raw authenticated INSERT always failed. Now that
-- subscriptions is genuinely RPC-only end to end, this closes the
-- leftover grant explicitly rather than leaving an unusable-but-present
-- privilege sitting on the table — the "no policy ⇒ no privilege
-- either" discipline this codebase has held since Round 2's finding 5,
-- applied completely rather than partially.
revoke insert on public.subscriptions from authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- enforce_subscription_transition() — BEFORE UPDATE, no role exception.
-- Real invariants a raw UPDATE (from any role, including service_role)
-- can never violate:
--   * user_id is immutable — a subscription never transfers owners.
--   * provider is immutable — a provider switch is a new row, not an
--     edit of an existing one.
--   * provider_customer_id/provider_subscription_id may only go from
--     NULL to a value ONCE — never value -> a DIFFERENT value. A real
--     identifier change means a new subscription at the provider, not
--     an edit of this one.
--   * status only moves along the real graph: active <-> past_due, and
--     either -> canceled/expired. canceled/expired are terminal — no
--     transition out of either (deliberately does NOT special-case
--     service_role: a webhook resync that needs to "revive" a canceled
--     subscription should create a new row, matching how Stripe itself
--     treats a canceled subscription as gone).
--   * canceled_at is set if and only if status = 'canceled'.
--   * cancel_at_period_end can only be true while status is active or
--     past_due (matches real-world "takes effect at period end" UX —
--     it's meaningless once the subscription is already terminal).
-- Deliberately does NOT enforce period-monotonicity (current_period_end
-- moving backward, etc.) — no reliable product rule was found for a
-- legitimate webhook resync/proration case; a real, named, DEFERRED
-- scope boundary (see docs/rls-matrix.md's subscription-transition
-- section), not silently assumed covered.
-- ---------------------------------------------------------------------
create or replace function public.enforce_subscription_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'enforce_subscription_transition: user_id cannot be changed (subscription %)', old.id;
  end if;

  if new.provider is distinct from old.provider then
    raise exception 'enforce_subscription_transition: provider cannot be changed (subscription %)', old.id;
  end if;

  if old.provider_customer_id is not null and new.provider_customer_id is distinct from old.provider_customer_id then
    raise exception 'enforce_subscription_transition: provider_customer_id cannot be changed once set (subscription %)', old.id;
  end if;

  if old.provider_subscription_id is not null and new.provider_subscription_id is distinct from old.provider_subscription_id then
    raise exception 'enforce_subscription_transition: provider_subscription_id cannot be changed once set (subscription %)', old.id;
  end if;

  if old.status is distinct from new.status then
    if not (
      (old.status = 'active' and new.status in ('past_due', 'canceled', 'expired'))
      or (old.status = 'past_due' and new.status in ('active', 'canceled', 'expired'))
    ) then
      raise exception 'enforce_subscription_transition: % -> % is not an allowed status transition (subscription %)', old.status, new.status, old.id;
    end if;
  end if;

  if (new.status = 'canceled') <> (new.canceled_at is not null) then
    raise exception 'enforce_subscription_transition: canceled_at must be set iff status = canceled (subscription %)', old.id;
  end if;

  if new.cancel_at_period_end and new.status not in ('active', 'past_due') then
    raise exception 'enforce_subscription_transition: cancel_at_period_end can only be true while status is active or past_due (subscription %)', old.id;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists subscriptions_enforce_transition on public.subscriptions;--> statement-breakpoint
create trigger subscriptions_enforce_transition
before update on public.subscriptions
for each row execute function public.enforce_subscription_transition();
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- service_apply_subscription_update() — the recurring-subscription
-- webhook-upsert path. service_role-only (checked via current_user,
-- since auth.uid() is NULL for a service_role session — no JWT claim to
-- read). Scoped to provider = 'stripe' only: Stripe is the one gateway
-- with real recurring auto-renewal in this schema's own design
-- (subscriptions.ts's doc comment); PayPal/manual are one-shot
-- fixed-period grants, handled by admin_activate_manual_subscription()
-- below, not this function. Upserts via the existing partial unique
-- index on provider_subscription_id — a real, provider-verified
-- identifier is the only valid conflict target; user_id/provider/
-- provider_customer_id are deliberately NOT included in the DO UPDATE
-- SET list (left untouched on conflict), matching the trigger's own
-- immutability rules above rather than fighting them. canceled_at is
-- derived from p_status here so callers don't have to keep the two
-- columns consistent themselves. The trigger above still fires and
-- fully applies even to this service_role path — real invariant
-- enforcement, not merely an RLS bypass.
--
-- Deliberately NOT security definer. service_role already has direct
-- SELECT/INSERT/UPDATE/DELETE on this table (0004_privilege_
-- reconciliation.sql) and BYPASSRLS as a role attribute (see
-- lib/db/test/run-migrations.mjs's local role setup, matching the real
-- Supabase service_role), so no privilege escalation is needed — and
-- skipping it sidesteps a genuine Postgres gotcha verified live while
-- building this migration: current_user (and session_user) inside a
-- SECURITY DEFINER function reflects the FUNCTION OWNER, not the
-- calling role, for the function's entire duration — a naive `current_
-- user <> 'service_role'` check inside a security definer function can
-- never be true no matter who calls it, silently locking the RPC out
-- for everyone. Kept as a plain SECURITY INVOKER (the default) function
-- specifically so this check works correctly, and GRANT EXECUTE (below)
-- remains the enforced boundary either way — this check is defense in
-- depth, not the only barrier. (Section D's issue_invoice_from_payment()
-- genuinely needs SECURITY DEFINER for its admin-caller branch and uses
-- current_setting('role', true) instead, which does survive the
-- SECURITY DEFINER boundary — verified the same way.)
-- ---------------------------------------------------------------------
create or replace function public.service_apply_subscription_update(
  p_user_id uuid,
  p_plan_id uuid,
  p_provider public.payment_gateway,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_status public.subscription_status,
  p_current_period_start timestamp with time zone,
  p_current_period_end timestamp with time zone,
  p_cancel_at_period_end boolean default false
)
returns public.subscriptions
language plpgsql
set search_path = ''
as $$
declare
  result public.subscriptions;
begin
  if current_user <> 'service_role' then
    raise exception 'service_apply_subscription_update: caller must be service_role';
  end if;

  if p_provider <> 'stripe' then
    raise exception 'service_apply_subscription_update: only provider = stripe is supported by this RPC (got %); paypal/manual grants use admin_activate_manual_subscription()', p_provider;
  end if;

  if p_provider_subscription_id is null then
    raise exception 'service_apply_subscription_update: p_provider_subscription_id is required';
  end if;

  insert into public.subscriptions (
    user_id, plan_id, provider, provider_customer_id, provider_subscription_id,
    status, current_period_start, current_period_end, cancel_at_period_end, canceled_at
  )
  values (
    p_user_id, p_plan_id, p_provider, p_provider_customer_id, p_provider_subscription_id,
    p_status, p_current_period_start, p_current_period_end, p_cancel_at_period_end,
    case when p_status = 'canceled' then now() else null end
  )
  on conflict (provider_subscription_id) where provider_subscription_id is not null
  do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- request_cancel_subscription() — owner-only, authenticated. Sets
-- cancel_at_period_end = true only (real-world "takes effect at period
-- end" UX, not an immediate cancel — an immediate admin-driven cancel
-- was not asked for, so not built). Fails loudly (not a silent 0-row
-- no-op) when the target isn't found, isn't owned by the caller, or
-- isn't in a cancelable state — this is a user-initiated action where a
-- silent no-op would be a confusing UX, unlike the webhook/lease RPCs'
-- "0 rows = legitimately didn't apply to you" idiom.
-- ---------------------------------------------------------------------
create or replace function public.request_cancel_subscription(p_subscription_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.subscriptions;
begin
  update public.subscriptions
  set cancel_at_period_end = true
  where id = p_subscription_id
    and user_id = auth.uid()
    and status in ('active', 'past_due')
  returning * into result;

  if not found then
    raise exception 'request_cancel_subscription: % is not a cancelable subscription owned by the caller', p_subscription_id;
  end if;

  return result;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- admin_activate_manual_subscription() — AAL2. The atomic second claim
-- manual_payments.ts's own doc comment already named as deferred: locks
-- the manual_payments row, requires status = 'approved' AND
-- activated_at IS NULL (so double-activation of the same approved
-- record is structurally impossible, not just discouraged), inserts the
-- subscriptions row, and marks activated_at in the same transaction.
-- Deliberately requires the admin to pass p_plan_id/p_current_period_end
-- explicitly rather than the RPC guessing a duration from
-- plans.billing_interval's free-text value — no reliable duration-
-- parsing rule exists in the schema today (a real, named scope
-- boundary, not a guessed business rule). Cross-checks p_plan_id against
-- manual_payments.plan_id when the requester named one at submission
-- time, but doesn't require it (a walk-in/manual-method payment may
-- never have named a plan up front).
-- ---------------------------------------------------------------------
create or replace function public.admin_activate_manual_subscription(
  p_manual_payment_id uuid,
  p_plan_id uuid,
  p_current_period_end timestamp with time zone
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  mp public.manual_payments;
  result public.subscriptions;
begin
  if not public.is_admin_aal2() then
    raise exception 'admin_activate_manual_subscription: caller is not an AAL2-verified admin';
  end if;

  select * into mp
  from public.manual_payments
  where id = p_manual_payment_id
    and status = 'approved'
    and activated_at is null
  for update;

  if not found then
    raise exception 'admin_activate_manual_subscription: % is not an approved, not-yet-activated manual_payments row', p_manual_payment_id;
  end if;

  if mp.plan_id is not null and mp.plan_id <> p_plan_id then
    raise exception 'admin_activate_manual_subscription: p_plan_id (%) does not match manual_payments.plan_id (%)', p_plan_id, mp.plan_id;
  end if;

  insert into public.subscriptions (user_id, plan_id, provider, status, current_period_start, current_period_end)
  values (mp.user_id, p_plan_id, 'manual', 'active', now(), p_current_period_end)
  returning * into result;

  update public.manual_payments set activated_at = now() where id = p_manual_payment_id;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'admin_activate_manual_subscription', 'subscriptions', result.id::text,
    jsonb_build_object('manual_payment_id', mp.id, 'plan_id', p_plan_id),
    jsonb_build_object('subscription_id', result.id, 'current_period_end', result.current_period_end)
  );

  return result;
end;
$$;
--> statement-breakpoint

-- EXECUTE grants — explicit REVOKE first (Postgres auto-grants EXECUTE
-- to PUBLIC on CREATE FUNCTION; every one of these is a fresh function
-- object, none is a same-signature CREATE OR REPLACE of a previously-
-- granted function, so none of these REVOKEs are redundant).
revoke execute on function public.service_apply_subscription_update(uuid, uuid, public.payment_gateway, text, text, public.subscription_status, timestamp with time zone, timestamp with time zone, boolean) from public, anon, authenticated;--> statement-breakpoint
revoke execute on function public.request_cancel_subscription(uuid) from public, anon;--> statement-breakpoint
revoke execute on function public.admin_activate_manual_subscription(uuid, uuid, timestamp with time zone) from public, anon;--> statement-breakpoint
grant execute on function public.service_apply_subscription_update(uuid, uuid, public.payment_gateway, text, text, public.subscription_status, timestamp with time zone, timestamp with time zone, boolean) to service_role;--> statement-breakpoint
grant execute on function public.request_cancel_subscription(uuid) to authenticated;--> statement-breakpoint
grant execute on function public.admin_activate_manual_subscription(uuid, uuid, timestamp with time zone) to authenticated;