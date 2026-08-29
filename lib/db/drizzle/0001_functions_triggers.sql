-- Hand-authored functions/triggers for the 20-table baseline
-- (docs/product-scope-audit.md). Drizzle's schema DSL (lib/db/src/schema)
-- only expresses tables/enums/CHECK constraints/indexes — everything below
-- needs to see the OLD row on UPDATE/DELETE, read OTHER rows, or run
-- atomically under a lock, so it can't be a plain CHECK and is authored
-- directly as migration SQL instead.
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
-- 4. validate_refund_insert() — payments BEFORE INSERT.
--
-- Baseline remediation: replaces forbid_refund_of_refund(), which only
-- checked the parent row's `kind`. A real review found that left the
-- ledger open to financial corruption: nothing stopped a refund larger
-- than its charge, refunds summing past the charge total, refunding a
-- charge that never succeeded, a refund quietly disagreeing with its
-- parent's user/currency/gateway, or two concurrent refunds each passing
-- a stale sum check. This function closes all of those:
--
--   1. `SELECT ... FOR UPDATE` locks the parent row for the rest of this
--      transaction — a second, concurrent refund INSERT against the same
--      parent blocks until the first commits, so the sum check below can
--      never race.
--   2. The parent must exist, have kind = 'charge', and status =
--      'succeeded' (refunding a pending or failed charge makes no sense).
--   3. The new row's user_id / currency_snapshot / gateway must exactly
--      match the parent's — a refund can't quietly disagree with what it
--      refunds.
--   4. sum(existing succeeded-or-pending refunds against this parent) +
--      this row's amount_minor must not exceed the parent's amount_minor
--      — pending refunds count too (conservative: a pending refund that
--      later fails just frees the room back up; overcommitting while it's
--      still pending is the unsafe direction).
--
-- None of this is expressible as a plain CHECK — it needs to read other
-- rows and lock against a race, not just look at the row being inserted.
-- ---------------------------------------------------------------------
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

create trigger payments_validate_refund_insert
  before insert on public.payments
  for each row execute procedure public.validate_refund_insert();
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
-- 6 & 7. claim_provider_event() / complete_provider_event() — a real
-- two-phase webhook-event claim.
--
-- Baseline remediation: the first version of this collapsed "claim" and
-- "record outcome" into one function, called by the worker AFTER it had
-- already performed the webhook's side effect. That didn't actually
-- prevent a race: two workers could both see the row as 'pending', both
-- perform the side effect, and only then race on who gets to write
-- 'processed' — only the DB write was exclusive, not the work itself.
--
-- provider_event_status now has 5 values (pending/processing/processed/
-- failed/ignored — 'processing' added). claim_provider_event() does the
-- atomic pending -> processing claim FIRST, before any side-effect work
-- runs; only the worker that gets a row back may proceed. Once the work
-- is done, complete_provider_event() does the atomic processing ->
-- processed/failed transition. A second claim attempt on an already-
-- claimed event returns zero rows (idempotent no-op, not an error) — the
-- expected outcome when a duplicate webhook delivery arrives while the
-- first is still being processed.
-- ---------------------------------------------------------------------
create or replace function public.claim_provider_event(p_id uuid)
returns setof public.provider_events
language sql
set search_path = ''
as $$
  update public.provider_events
  set processing_status = 'processing'
  where id = p_id
    and processing_status = 'pending'
  returning *;
$$;
--> statement-breakpoint

create or replace function public.complete_provider_event(
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
    raise exception 'complete_provider_event: p_result must be processed, failed, or ignored (got %)', p_result;
  end if;

  return query
  update public.provider_events
  set processing_status = p_result,
      processed_at = now(),
      error_code = p_error_code
  where id = p_id
    and processing_status = 'processing'
  returning *;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 8. set_updated_at() — generic trigger, attached to every table that has
--    an `updated_at` column (profiles, plans, subscriptions, payments,
--    notification_preferences, manual_payments, invoices, testimonials,
--    enrollments — baseline remediation added the last 4).
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
--> statement-breakpoint

create trigger manual_payments_set_updated_at
  before update on public.manual_payments
  for each row execute procedure public.set_updated_at();
--> statement-breakpoint

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute procedure public.set_updated_at();
--> statement-breakpoint

create trigger testimonials_set_updated_at
  before update on public.testimonials
  for each row execute procedure public.set_updated_at();
--> statement-breakpoint

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- 9. validate_invoice_insert() — invoices BEFORE INSERT.
--
-- RLS Remediation Round 2 (finding 1): invoices has no RPC wrapping
-- issuance the way profiles/manual_payments/payments do — it's a
-- receipt snapshot, not a ledger mutation with a concurrency race, so
-- there's no atomicity/locking need an RPC would add. The raw admin
-- INSERT policy on invoices (0002_rls.sql) stays the real write path,
-- but without this trigger nothing stopped it from fabricating a
-- receipt for a payment that never happened. Mirrors validate_refund_
-- insert()'s pattern, scoped to what's unambiguous: the new row must
-- name a real, succeeded charge with a matching user_id/
-- currency_snapshot. Amount reconciliation is deliberately NOT checked
-- here (no documented formula for how amount_minor_snapshot/
-- discount_minor_snapshot on an invoice are meant to relate to the
-- linked payment's own amount_minor — payments.ts's own CHECK already
-- guarantees the underlying charge is internally consistent; guessing a
-- formula here risked rejecting a legitimate invoice on a wrong
-- assumption).
-- ---------------------------------------------------------------------
create or replace function public.validate_invoice_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked public.payments%rowtype;
begin
  if new.payment_id is null then
    raise exception 'invoices row % must reference a real payments row (payment_id is null)', new.id;
  end if;

  select * into linked
  from public.payments
  where id = new.payment_id;

  if not found then
    raise exception 'invoices.payment_id % does not reference an existing payments row', new.payment_id;
  end if;

  if linked.kind <> 'charge' or linked.status <> 'succeeded' then
    raise exception 'invoices row % must reference a succeeded charge (payment_id=% has kind=%, status=%)', new.id, new.payment_id, linked.kind, linked.status;
  end if;

  if new.user_id <> linked.user_id then
    raise exception 'invoice user_id (%) does not match its linked payment''s user_id (%)', new.user_id, linked.user_id;
  end if;

  if new.currency_snapshot <> linked.currency_snapshot then
    raise exception 'invoice currency_snapshot (%) does not match its linked payment''s currency_snapshot (%)', new.currency_snapshot, linked.currency_snapshot;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

create trigger invoices_validate_insert
  before insert on public.invoices
  for each row execute procedure public.validate_invoice_insert();
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 10. gen_random_uuid() / pgcrypto: NOT re-declared here. Every `id uuid
-- primary key default gen_random_uuid()` in 0000 relies on
-- gen_random_uuid() being available with no extension. PostgreSQL has
-- shipped it as a built-in pg_catalog function (no CREATE EXTENSION
-- needed) since Postgres 13; Supabase's real project and the postgres:16
-- image this baseline is tested against are both well past that version.
-- No `CREATE EXTENSION pgcrypto` statement is added — confirmed, not
-- assumed, by lib/db/test's local migrate() run actually succeeding
-- against postgres:16 with these DEFAULTs in place.
-- ---------------------------------------------------------------------
