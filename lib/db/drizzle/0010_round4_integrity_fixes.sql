-- RLS Remediation Round 4 (targeted closure of 3 real gaps a fresh
-- review of Round 3's own delivery found — plan-version duplication,
-- subscription invariants only enforced on UPDATE, invoice-issuance
-- audit trail). Still NOT applied to the real Supabase project —
-- verified only against a throwaway local Docker Postgres, same
-- discipline as every prior migration. 0000-0009 untouched.
--
-- Schema diff (generated from plans.ts by drizzle-kit generate): the
-- real DB-level backstop for section 1 below — no two plans rows may
-- ever share a (slug, version) pair, active or not.
CREATE UNIQUE INDEX "plans_slug_version_unique" ON "plans" USING btree ("slug","version");--> statement-breakpoint

-- =======================================================================
-- 1) Plan versioning could duplicate a "version 1" row per slug.
--
-- Real bug: create_plan_version(NULL, p_slug, ...) (the brand-new-plan
-- branch) hard-codes new_version := 1 and has no check that p_slug
-- already has history. plans_slug_active_unique (0008) only guards the
-- single ACTIVE row for a slug — once that row is deactivated (a normal
-- lifecycle step via create_plan_version() itself, or deactivate_plan()),
-- nothing stopped calling create_plan_version(NULL, same_slug, ...)
-- again, minting a second, unrelated row that ALSO claims slug + version
-- 1. plans_slug_version_unique (the schema diff above, generated from
-- plans.ts) is the real DB-level backstop: no two rows may ever share a
-- (slug, version) pair, active or not. This section closes the RPC-level
-- half of the same bug with a clear, named error instead of relying on
-- the index alone to surface a raw unique-violation.
-- =======================================================================
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
    if p_slug is not null and p_slug <> old_row.slug then
      raise exception 'create_plan_version: p_slug (%) does not match the plan being versioned (%) — versioning never changes slug', p_slug, old_row.slug;
    end if;

    -- RLS Remediation Round 4: this used to require old_row.active —
    -- which meant a slug fully retired via deactivate_plan() (rather
    -- than superseded via this same function) could never be revived at
    -- all, since the NULL branch below now correctly refuses to treat
    -- it as "brand new" either (that was the original bug this section
    -- fixes). The real invariant is narrower and more useful than
    -- "active": old_row must be the LATEST version for its slug — true
    -- for the normal active-row case (versions are always monotonic, so
    -- the active row is always the latest), and also true for a fully-
    -- inactive slug being deliberately revived. A stale, already-
    -- superseded version can still never be used to fork a new one.
    if exists (select 1 from public.plans where slug = old_row.slug and version > old_row.version) then
      raise exception 'create_plan_version: % (slug %, version %) is not the latest version for its slug — pass the latest version''s id as p_old_plan_id instead', p_old_plan_id, old_row.slug, old_row.version;
    end if;

    new_slug := old_row.slug;
    new_version := old_row.version + 1;

    update public.plans set active = false where id = p_old_plan_id;
  else
    if p_slug is null then
      raise exception 'create_plan_version: p_slug is required when p_old_plan_id is NULL (creating a brand-new plan)';
    end if;

    -- RLS Remediation Round 4: the real fix. A slug with ANY existing
    -- row (active or not) already has history — creating "brand new"
    -- again would either collide with plans_slug_version_unique (if the
    -- old row's version happens to match) or silently mint an unrelated
    -- second lineage under the same slug (if it doesn't). Either way is
    -- wrong: the caller must version the existing row instead, even if
    -- it's currently inactive.
    if exists (select 1 from public.plans where slug = p_slug) then
      raise exception 'create_plan_version: slug % already has plan history — pass its current (possibly inactive) plan id as p_old_plan_id instead of NULL to create a new version, rather than a second unrelated lineage under the same slug', p_slug;
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

-- =======================================================================
-- 2) Subscription invariants were only enforced BEFORE UPDATE — every
-- INSERT (both RPCs that create a row: service_apply_subscription_
-- update()'s insert branch, admin_activate_manual_subscription()) went
-- through completely unchecked. Concretely reachable before this fix:
--   * a row inserted with status = 'expired' and cancel_at_period_end =
--     true (cancel_at_period_end only makes sense pre-terminal — the
--     UPDATE-only trigger already rejected this on an UPDATE, but never
--     saw the INSERT that created the row this way in the first place).
--   * an 'active' row with current_period_end NULL or already in the
--     past — silently "active forever" or already-expired-but-labeled-
--     active, either one a real billing-logic hazard.
--   * admin_activate_manual_subscription() inserting a manual grant
--     whose p_current_period_end has already passed.
-- Fixed by making the SAME trigger function fire on INSERT too (the
-- OLD-dependent checks — immutable columns, the status-transition graph
-- — only apply when tg_op = 'update', since there is no OLD row to
-- compare against on an INSERT; the NEW-only checks, extended with 2 new
-- ones below, now apply unconditionally to both).
-- =======================================================================
create or replace function public.enforce_subscription_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
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
  end if;

  -- The remaining checks are NEW-only and apply to BOTH insert and
  -- update — a row can never exist, even transiently, in a state that
  -- violates them, regardless of which statement produced it.

  if (new.status = 'canceled') <> (new.canceled_at is not null) then
    raise exception 'enforce_subscription_transition: canceled_at must be set iff status = canceled (subscription %)', new.id;
  end if;

  if new.cancel_at_period_end and new.status not in ('active', 'past_due') then
    raise exception 'enforce_subscription_transition: cancel_at_period_end can only be true while status is active or past_due (subscription %)', new.id;
  end if;

  -- RLS Remediation Round 4 (new): a real period, when both ends are
  -- given, must end after it starts — regardless of status.
  if new.current_period_start is not null and new.current_period_end is not null
     and new.current_period_end <= new.current_period_start then
    raise exception 'enforce_subscription_transition: current_period_end (%) must be after current_period_start (%) (subscription %)', new.current_period_end, new.current_period_start, new.id;
  end if;

  -- RLS Remediation Round 4 (new): an ACTIVE subscription must have a
  -- real, future period end — never NULL, never already in the past.
  -- past_due is deliberately exempt: a real past_due row commonly
  -- carries an already-elapsed current_period_end (that's WHY it's
  -- past_due — the period ended and renewal hasn't succeeded yet).
  if new.status = 'active' and (new.current_period_end is null or new.current_period_end <= now()) then
    raise exception 'enforce_subscription_transition: an active subscription must have a current_period_end in the future (got %) (subscription %)', new.current_period_end, new.id;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists subscriptions_enforce_transition on public.subscriptions;--> statement-breakpoint
create trigger subscriptions_enforce_transition
before insert or update on public.subscriptions
for each row execute function public.enforce_subscription_transition();
--> statement-breakpoint

-- =======================================================================
-- 3) issue_invoice_from_payment() wrote no admin_audit_log row at all —
-- an AAL2 admin (or service_role) could issue a real, permanent
-- financial document with zero audit trail, unlike every other
-- financially-consequential admin RPC in this schema (create_plan_
-- version(), deactivate_plan(), admin_update_plan_display(),
-- admin_activate_manual_subscription() all audit). Fixed by writing
-- admin_audit_log exactly when a NEW invoice row is actually created —
-- NOT on an idempotent replay (a repeat call for the same payment_id
-- that returns the pre-existing row): the ON CONFLICT ... DO NOTHING
-- RETURNING pattern already distinguishes the two cases (result.id IS
-- NULL means the conflict branch fired, i.e. this call did not create
-- anything), reused here to gate the audit write on the real-creation
-- branch only, exactly as the task's own established discipline requires
-- ("write audit on the change, not on a no-op read of existing state").
--
-- admin_audit_log.actor_admin_id is NOT NULL with a real FK to
-- profiles(id) (0000_init_20_table_baseline.sql) — a genuine, verified
-- constraint this section's first draft got wrong (caught live: a
-- service_role call to this RPC crashed the whole INSERT on that NOT
-- NULL violation, since auth.uid() is NULL for a service_role session).
-- Every OTHER audited RPC in this schema is AAL2-admin-only, so this
-- never came up before — issue_invoice_from_payment() is the only one
-- also callable by service_role. The correct fix, matching what
-- admin_audit_log's own schema already asserts (it is an ADMIN action
-- log, not a general system-event log): write the audit row only when
-- BOTH a new invoice was actually created AND a real admin (auth.uid()
-- is not null) made the call. A service_role-issued invoice (a future
-- automated post-charge issuance path) still gets issued correctly —
-- it's simply not an "admin action" in the sense this table records,
-- exactly the same reasoning service_apply_subscription_update()
-- (0006_subscription_integrity.sql) already documented for why IT
-- writes no audit row at all.
-- =======================================================================
create or replace function public.issue_invoice_from_payment(p_payment_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.payments%rowtype;
  buyer public.profiles%rowtype;
  plan_row public.plans%rowtype;
  result public.invoices;
  newly_created boolean;
begin
  if not (public.is_admin_aal2() or current_setting('role', true) = 'service_role') then
    raise exception 'issue_invoice_from_payment: caller must be an AAL2-verified admin or service_role';
  end if;

  select * into charge from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'issue_invoice_from_payment: no payments row %', p_payment_id;
  end if;

  if charge.kind <> 'charge' or charge.status <> 'succeeded' then
    raise exception 'issue_invoice_from_payment: payment % is not a succeeded charge (kind=%, status=%) — invoices are never issued for a refund or a pending/failed payment', p_payment_id, charge.kind, charge.status;
  end if;

  select * into buyer from public.profiles where id = charge.user_id;
  if charge.plan_id is not null then
    select * into plan_row from public.plans where id = charge.plan_id;
  end if;

  insert into public.invoices (
    user_id, plan_id, payment_id, customer_name_snapshot, plan_name_snapshot,
    amount_minor_snapshot, discount_minor_snapshot, currency_snapshot, status
  )
  values (
    charge.user_id, charge.plan_id, charge.id,
    coalesce(buyer.name, buyer.email), plan_row.name,
    charge.amount_minor, charge.discount_minor_snapshot, charge.currency_snapshot, 'paid'
  )
  on conflict (payment_id) do nothing
  returning * into result;

  newly_created := result.id is not null;

  if result.id is null then
    select * into result from public.invoices where payment_id = p_payment_id;
  end if;

  -- auth.uid() is NULL for a service_role caller, and admin_audit_log.
  -- actor_admin_id is NOT NULL (a real FK to profiles) — only a real
  -- admin's genuine invoice issuance is audited here, same reasoning as
  -- service_apply_subscription_update()'s own "no audit — a service/
  -- webhook action, not an admin one" (0006_subscription_integrity.sql).
  if newly_created and auth.uid() is not null then
    insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
    values (
      auth.uid(), 'issue_invoice_from_payment', 'invoices', result.id::text,
      null,
      jsonb_build_object('invoice_id', result.id, 'payment_id', result.payment_id, 'amount_minor_snapshot', result.amount_minor_snapshot)
    );
  end if;

  return result;
end;
$$;
--> statement-breakpoint

-- No GRANT/REVOKE statements needed in this migration: all 3 functions
-- above are CREATE OR REPLACE at their existing, unchanged signatures —
-- Postgres preserves a function's existing GRANTs across a same-
-- signature REPLACE (unlike a fresh CREATE FUNCTION, which auto-grants
-- EXECUTE to PUBLIC and would need an explicit REVOKE) — verified
-- against 0006's/0007's/0008's own already-correct grants, unchanged
-- here.
