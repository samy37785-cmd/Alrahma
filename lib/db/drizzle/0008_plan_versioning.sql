-- RLS Remediation Round 3 (Section E — plan/pricing robustness).
-- Still NOT applied to the real Supabase project — verified only against
-- a throwaway local Docker Postgres, same discipline as every prior
-- migration.
--
-- Real bug: plans.ts's own doc comment already stated "a historical
-- price is never edited in place, a price change creates a new
-- version" — but plans_update_admin_aal2 (0002_rls.sql) plus its raw
-- GRANT UPDATE let any AAL2 admin change amount_minor/currency/
-- stripe_price_id/paypal_plan_id/slug/version directly on ANY row,
-- historically-used or not, with no audit trail. The schema diff above
-- (generated from plans.ts) also fixes the structural half of the bug:
-- the old flat unique(slug) made true versioning under the same slug
-- impossible in the first place.
ALTER TABLE "plans" DROP CONSTRAINT "plans_slug_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "plans_slug_active_unique" ON "plans" USING btree ("slug") WHERE "plans"."active" = true;--> statement-breakpoint

drop policy if exists plans_update_admin_aal2 on public.plans;--> statement-breakpoint
drop policy if exists plans_insert_admin_aal2 on public.plans;--> statement-breakpoint
revoke update, insert on public.plans from authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- enforce_plan_immutability() — BEFORE UPDATE, no role exception. Blocks
-- changing any catalog-defining column on an EXISTING row, for any
-- reason: amount_minor, currency, stripe_product_id, stripe_price_id,
-- paypal_plan_id, slug, version. name/billing_interval/sessions_per_
-- week/sessions_per_month are ALSO catalog-defining (plans.ts's doc
-- comment states this decision explicitly) and so are blocked too — the
-- only real edit paths left are display_order (admin_update_plan_
-- display(), below) and active (deactivate_plan()/create_plan_version(),
-- below).
-- ---------------------------------------------------------------------
create or replace function public.enforce_plan_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount_minor <> old.amount_minor then
    raise exception 'enforce_plan_immutability: amount_minor cannot be changed on an existing plan row (plan %)', old.id;
  end if;
  if new.currency <> old.currency then
    raise exception 'enforce_plan_immutability: currency cannot be changed on an existing plan row (plan %)', old.id;
  end if;
  if new.stripe_product_id is distinct from old.stripe_product_id then
    raise exception 'enforce_plan_immutability: stripe_product_id cannot be changed on an existing plan row (plan %)', old.id;
  end if;
  if new.stripe_price_id is distinct from old.stripe_price_id then
    raise exception 'enforce_plan_immutability: stripe_price_id cannot be changed on an existing plan row (plan %)', old.id;
  end if;
  if new.paypal_plan_id is distinct from old.paypal_plan_id then
    raise exception 'enforce_plan_immutability: paypal_plan_id cannot be changed on an existing plan row (plan %)', old.id;
  end if;
  if new.slug <> old.slug then
    raise exception 'enforce_plan_immutability: slug cannot be changed on an existing plan row (plan %)', old.id;
  end if;
  if new.version <> old.version then
    raise exception 'enforce_plan_immutability: version cannot be changed on an existing plan row (plan %)', old.id;
  end if;
  if new.name <> old.name then
    raise exception 'enforce_plan_immutability: name cannot be changed on an existing plan row (plan %) — create a new version instead', old.id;
  end if;
  if new.billing_interval is distinct from old.billing_interval then
    raise exception 'enforce_plan_immutability: billing_interval cannot be changed on an existing plan row (plan %) — create a new version instead', old.id;
  end if;
  if new.sessions_per_week is distinct from old.sessions_per_week then
    raise exception 'enforce_plan_immutability: sessions_per_week cannot be changed on an existing plan row (plan %) — create a new version instead', old.id;
  end if;
  if new.sessions_per_month is distinct from old.sessions_per_month then
    raise exception 'enforce_plan_immutability: sessions_per_month cannot be changed on an existing plan row (plan %) — create a new version instead', old.id;
  end if;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists plans_enforce_immutability on public.plans;--> statement-breakpoint
create trigger plans_enforce_immutability
before update on public.plans
for each row execute function public.enforce_plan_immutability();
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- create_plan_version() — AAL2. Handles BOTH real cases with one RPC:
-- p_old_plan_id NULL creates a brand-new plan (a new slug, version 1) —
-- the raw INSERT policy is gone, so this is now the only way to create
-- a plans row at all, keeping every plan creation audited, not just
-- price changes. p_old_plan_id set versions an existing plan: locks it,
-- requires it's currently active (a clear error instead of relying on
-- the partial unique index alone for this specific case), deactivates
-- it, and inserts the new row with the SAME slug, version + 1 — the
-- slug is always inherited from the old row, never caller-supplied for
-- this path (p_slug is validated to be NULL or match, never lets a
-- version silently rename the plan's slug). The lock + the partial
-- unique index together are what make a real 2-admin race produce
-- exactly one new active version: the index is the actual backstop
-- (catches a race the lock alone wouldn't, e.g. two calls racing from
-- two different p_old_plan_id values that happen to share a slug).
-- ---------------------------------------------------------------------
create or replace function public.create_plan_version(
  p_old_plan_id uuid,
  p_slug text,
  p_name text,
  p_amount_minor integer,
  p_currency public.currency_code,
  p_billing_interval text,
  p_stripe_product_id text,
  p_stripe_price_id text,
  p_paypal_plan_id text,
  p_sessions_per_week integer,
  p_sessions_per_month integer,
  p_display_order integer default 0
)
returns public.plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row public.plans;
  new_slug text;
  new_version integer;
  result public.plans;
begin
  if not public.is_admin_aal2() then
    raise exception 'create_plan_version: caller is not an AAL2-verified admin';
  end if;

  if p_old_plan_id is not null then
    select * into old_row from public.plans where id = p_old_plan_id for update;
    if not found then
      raise exception 'create_plan_version: no plans row %', p_old_plan_id;
    end if;
    if not old_row.active then
      raise exception 'create_plan_version: % is not currently active — pass the currently active plan for this slug, or NULL to create a brand-new plan', p_old_plan_id;
    end if;
    if p_slug is not null and p_slug <> old_row.slug then
      raise exception 'create_plan_version: p_slug (%) does not match the plan being versioned (%) — versioning never changes slug', p_slug, old_row.slug;
    end if;

    new_slug := old_row.slug;
    new_version := old_row.version + 1;

    update public.plans set active = false where id = p_old_plan_id;
  else
    if p_slug is null then
      raise exception 'create_plan_version: p_slug is required when p_old_plan_id is NULL (creating a brand-new plan)';
    end if;
    new_slug := p_slug;
    new_version := 1;
  end if;

  insert into public.plans (
    slug, name, amount_minor, currency, billing_interval,
    stripe_product_id, stripe_price_id, paypal_plan_id,
    sessions_per_week, sessions_per_month, active, display_order, version
  )
  values (
    new_slug, p_name, p_amount_minor, p_currency, p_billing_interval,
    p_stripe_product_id, p_stripe_price_id, p_paypal_plan_id,
    p_sessions_per_week, p_sessions_per_month, true, p_display_order, new_version
  )
  returning * into result;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'create_plan_version', 'plans', result.id::text,
    case when old_row.id is null then null else jsonb_build_object('old_plan_id', old_row.id, 'old_amount_minor', old_row.amount_minor, 'old_version', old_row.version) end,
    jsonb_build_object('plan_id', result.id, 'slug', result.slug, 'amount_minor', result.amount_minor, 'version', result.version)
  );

  return result;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- deactivate_plan() — AAL2. The narrow lifecycle-only edit: active =
-- false, nothing else. Audited like every other admin plans operation
-- (not just the price-affecting one), per the task's explicit ask.
-- ---------------------------------------------------------------------
create or replace function public.deactivate_plan(p_plan_id uuid)
returns public.plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.plans;
  after_row public.plans;
begin
  if not public.is_admin_aal2() then
    raise exception 'deactivate_plan: caller is not an AAL2-verified admin';
  end if;

  select * into before_row from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'deactivate_plan: no plans row %', p_plan_id;
  end if;

  update public.plans set active = false where id = p_plan_id
  returning * into after_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'deactivate_plan', 'plans', p_plan_id::text,
    jsonb_build_object('active', before_row.active),
    jsonb_build_object('active', after_row.active)
  );

  return after_row;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- admin_update_plan_display() — AAL2. The narrow "safe metadata" edit
-- the task allows: display_order only. Audited.
-- ---------------------------------------------------------------------
create or replace function public.admin_update_plan_display(p_plan_id uuid, p_display_order integer)
returns public.plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.plans;
  after_row public.plans;
begin
  if not public.is_admin_aal2() then
    raise exception 'admin_update_plan_display: caller is not an AAL2-verified admin';
  end if;

  select * into before_row from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'admin_update_plan_display: no plans row %', p_plan_id;
  end if;

  update public.plans set display_order = p_display_order where id = p_plan_id
  returning * into after_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'admin_update_plan_display', 'plans', p_plan_id::text,
    jsonb_build_object('display_order', before_row.display_order),
    jsonb_build_object('display_order', after_row.display_order)
  );

  return after_row;
end;
$$;
--> statement-breakpoint

-- EXECUTE — REVOKE first (fresh function objects; Postgres auto-grants
-- EXECUTE to PUBLIC on CREATE FUNCTION).
revoke execute on function public.create_plan_version(uuid, text, text, integer, public.currency_code, text, text, text, text, integer, integer, integer) from public, anon;--> statement-breakpoint
revoke execute on function public.deactivate_plan(uuid) from public, anon;--> statement-breakpoint
revoke execute on function public.admin_update_plan_display(uuid, integer) from public, anon;--> statement-breakpoint
grant execute on function public.create_plan_version(uuid, text, text, integer, public.currency_code, text, text, text, text, integer, integer, integer) to authenticated;--> statement-breakpoint
grant execute on function public.deactivate_plan(uuid) to authenticated;--> statement-breakpoint
grant execute on function public.admin_update_plan_display(uuid, integer) to authenticated;