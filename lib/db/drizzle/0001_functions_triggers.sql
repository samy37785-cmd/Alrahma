-- Hand-authored functions/triggers for the 20-table baseline
-- (docs/product-scope-audit.md). Drizzle's schema DSL (lib/db/src/schema)
-- only expresses tables/enums/CHECK constraints/indexes — everything below
-- needs to see the OLD row on UPDATE/DELETE or run atomically, so it can't
-- be a plain CHECK and is authored directly as migration SQL instead.
--
-- This is a clean-empty-database baseline migration, verified only against
-- a throwaway LOCAL Docker Postgres (see lib/db/test/). It has NOT been
-- applied to the real Supabase project. It is tracked by drizzle-orm's
-- migrate() runner via meta/_journal.json exactly like 0000, so re-running
-- migrate() a second time is a real no-op (tracked in __drizzle_migrations),
-- not just an assumption.
--
-- Every function below sets `search_path = ''` (empty, not merely
-- 'public') and fully schema-qualifies every referenced object
-- (public.profiles, auth.users, ...) — required for any SECURITY DEFINER
-- function so a same-named object planted in another schema on the
-- caller's search_path can never be substituted in; kept consistent on the
-- non-SECURITY-DEFINER functions here too, as a blanket discipline.

-- ---------------------------------------------------------------------
-- 1. handle_new_user() — auth.users AFTER INSERT trigger.
--
-- Simplified from Stage 1's version (lib/db/sql/0001_handle_new_user.sql,
-- now historical/superseded — it branched on a parent/student role claim
-- from the old system). The locked 2-role model
-- (docs/product-scope-audit.md §11) has exactly one self-service role
-- (`user`) and one out-of-band role (`admin`): this trigger
-- unconditionally inserts role='user', full stop, and ignores any
-- raw_user_meta_data role claim entirely — a client can never self-
-- register as admin no matter what metadata it sends. Promoting an
-- account to admin is a deliberate, audited, out-of-band DB action, never
-- a signup-time choice and never a client-callable RPC.
--
-- SECURITY DEFINER: runs with the privileges of its owner regardless of
-- who triggers it (any new signup, including the anon-driven client SDK
-- flow), so it must not trust the caller's search_path at all.
-- ---------------------------------------------------------------------
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
--> statement-breakpoint

drop trigger if exists on_auth_user_created on auth.users;
--> statement-breakpoint

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 2. enforce_payment_status_transition() — payments BEFORE UPDATE.
--
-- Once a row is succeeded/failed it is frozen entirely (no column may
-- change, not just `status`) — a refund is always a new row
-- (parent_payment_id), never a mutation of the original charge. While
-- `pending`, only a transition to succeeded/failed is allowed; any other
-- attempted status value is rejected. Other columns may still change
-- freely while pending (e.g. gateway_metadata filling in as webhook data
-- arrives before the payment finalizes).
-- ---------------------------------------------------------------------
create or replace function public.enforce_payment_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('succeeded', 'failed') then
    raise exception 'payments row % is frozen (status=%) and cannot be updated', old.id, old.status;
  end if;

  if new.status <> old.status
     and not (old.status = 'pending' and new.status in ('succeeded', 'failed')) then
    raise exception 'payments.status transition % -> % is not allowed (id=%)', old.status, new.status, old.id;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

create trigger payments_enforce_status_transition
  before update on public.payments
  for each row execute procedure public.enforce_payment_status_transition();
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 3. forbid_payment_delete() — payments BEFORE DELETE.
--
-- The ledger is append-only: nothing ever deletes a payments row, a
-- mistaken charge is corrected with a refund row instead. This is a real,
-- testable guard now, ahead of the RLS/grants layer that reinforces it
-- later.
-- ---------------------------------------------------------------------
create or replace function public.forbid_payment_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'payments rows cannot be deleted (id=%); the ledger is append-only', old.id;
end;
$$;
--> statement-breakpoint

create trigger payments_forbid_delete
  before delete on public.payments
  for each row execute procedure public.forbid_payment_delete();
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 4. forbid_refund_of_refund() — payments BEFORE INSERT.
--
-- The payments_kind_parent_consistency CHECK (0000) only guarantees a
-- refund row always names *some* parent_payment_id. This trigger is the
-- part that guarantees that parent is itself a charge, never another
-- refund — so a refund chain can never be built.
-- ---------------------------------------------------------------------
create or replace function public.forbid_refund_of_refund()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_kind public.payment_kind;
begin
  if new.kind = 'refund' then
    select kind into parent_kind from public.payments where id = new.parent_payment_id;

    if parent_kind is null then
      raise exception 'payments.parent_payment_id % does not reference an existing payments row', new.parent_payment_id;
    end if;

    if parent_kind <> 'charge' then
      raise exception 'payments row % cannot refund another refund (parent_payment_id=% has kind=%)', new.id, new.parent_payment_id, parent_kind;
    end if;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

create trigger payments_forbid_refund_of_refund
  before insert on public.payments
  for each row execute procedure public.forbid_refund_of_refund();
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 5. forbid_audit_log_mutation() — admin_audit_log BEFORE UPDATE OR DELETE.
--
-- A second, concrete layer ahead of RLS/grants (not built this pass):
-- every admin_audit_log row is immutable once written, regardless of who
-- is connecting.
-- ---------------------------------------------------------------------
create or replace function public.forbid_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log rows are append-only and cannot be %', lower(tg_op);
end;
$$;
--> statement-breakpoint

create trigger admin_audit_log_forbid_mutation
  before update or delete on public.admin_audit_log
  for each row execute procedure public.forbid_audit_log_mutation();
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 6. claim_provider_event() — atomic webhook-event claim.
--
-- provider_event_status stays exactly the user-specified 4 values
-- (pending/processed/failed/ignored) — no extra in-between 'processing'
-- state. Given that, "claim" and "record the outcome" collapse into one
-- atomic statement: the caller passes the outcome it computed, and this
-- function applies it ONLY if the row was still 'pending', so two workers
-- racing on the same webhook delivery can never both apply it. A NULL
-- return (empty result set) means the event was already claimed by
-- someone else — the caller's contract is to treat that as an idempotent
-- no-op, never a 500.
-- ---------------------------------------------------------------------
create or replace function public.claim_provider_event(
  p_id uuid,
  p_result public.provider_event_status,
  p_error_code text default null
)
returns setof public.provider_events
language plpgsql
set search_path = ''
as $$
begin
  if p_result not in ('processed', 'failed', 'ignored') then
    raise exception 'claim_provider_event: p_result must be processed, failed, or ignored (got %)', p_result;
  end if;

  return query
  update public.provider_events
  set processing_status = p_result,
      processed_at = now(),
      error_code = p_error_code
  where id = p_id
    and processing_status = 'pending'
  returning *;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 7. set_updated_at() — generic trigger, attached to every table that has
--    an `updated_at` column (profiles, plans, subscriptions, payments,
--    notification_preferences).
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
--> statement-breakpoint

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
--> statement-breakpoint

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute procedure public.set_updated_at();
--> statement-breakpoint

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();
--> statement-breakpoint

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute procedure public.set_updated_at();
--> statement-breakpoint

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- 8. gen_random_uuid() / pgcrypto: NOT re-declared here. Every `id uuid
-- primary key default gen_random_uuid()` in 0000 relies on
-- gen_random_uuid() being available with no extension. PostgreSQL has
-- shipped it as a built-in pg_catalog function (no CREATE EXTENSION
-- needed) since Postgres 13; Supabase's real project and the postgres:16
-- image this baseline is tested against are both well past that version.
-- No `CREATE EXTENSION pgcrypto` statement is added — confirmed, not
-- assumed, by lib/db/test's local migrate() run actually succeeding
-- against postgres:16 with these DEFAULTs in place.
-- ---------------------------------------------------------------------
