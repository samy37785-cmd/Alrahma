-- Al-Rahma Final Corrections (Part A, payments completion): service_apply_
-- subscription_update() (0006_subscription_integrity.sql) deliberately
-- rejects any provider other than 'stripe' ("paypal/manual grants use
-- admin_activate_manual_subscription()" — an AAL2 admin-approval RPC, not
-- something a webhook can call). That leaves no automated path for a
-- PayPal-captured one-time payment to grant a subscription at all. This
-- migration adds that path as its own, separately-named RPC rather than
-- relaxing service_apply_subscription_update()'s existing, already-tested
-- stripe-only contract.
create or replace function public.service_grant_subscription_from_payment(
  p_user_id uuid,
  p_plan_id uuid,
  p_provider public.payment_gateway,
  p_provider_reference text,
  p_current_period_end timestamp with time zone
)
returns public.subscriptions
language plpgsql
set search_path = ''
as $$
declare
  result public.subscriptions;
begin
  if current_user <> 'service_role' then
    raise exception 'service_grant_subscription_from_payment: caller must be service_role';
  end if;
  if p_provider = 'stripe' then
    raise exception 'service_grant_subscription_from_payment: stripe must use service_apply_subscription_update() instead';
  end if;
  if p_provider_reference is null then
    raise exception 'service_grant_subscription_from_payment: p_provider_reference is required';
  end if;

  -- Idempotent re-delivery of the exact same payment/order (webhook retry
  -- or webhook+browser-capture racing each other) — update the existing
  -- row for it in place. provider/provider_subscription_id are unchanged
  -- here (matched WHERE clause), so this can never trip
  -- enforce_subscription_transition()'s immutability checks.
  update public.subscriptions
  set plan_id = p_plan_id, current_period_end = p_current_period_end, updated_at = now()
  where provider_subscription_id = p_provider_reference and provider = p_provider
  returning * into result;
  if result.id is not null then
    return result;
  end if;

  -- A different active subscription already exists for this user (e.g.
  -- switching provider) — subscriptions_one_active_per_user and
  -- enforce_subscription_transition()'s immutable provider/provider_
  -- subscription_id columns both forbid silently overwriting it in
  -- place, so it must be canceled (an allowed active -> canceled
  -- transition) before a fresh row for the new provider is inserted.
  update public.subscriptions
  set status = 'canceled', canceled_at = now(), updated_at = now()
  where user_id = p_user_id and status = 'active';

  insert into public.subscriptions (
    user_id, plan_id, provider, provider_subscription_id, status,
    current_period_start, current_period_end
  ) values (
    p_user_id, p_plan_id, p_provider, p_provider_reference, 'active', now(), p_current_period_end
  )
  returning * into result;

  return result;
end;
$$;
--> statement-breakpoint
revoke all on function public.service_grant_subscription_from_payment(uuid, uuid, public.payment_gateway, text, timestamp with time zone) from public, anon, authenticated;--> statement-breakpoint
grant execute on function public.service_grant_subscription_from_payment(uuid, uuid, public.payment_gateway, text, timestamp with time zone) to service_role;--> statement-breakpoint
