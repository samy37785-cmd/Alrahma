-- RLS Remediation Round 3 (Section D — invoice issuance integrity).
-- Still NOT applied to the real Supabase project — verified only against
-- a throwaway local Docker Postgres, same discipline as every prior
-- migration.
--
-- Real gaps in the previous state: validate_invoice_insert() (0001)
-- proved the linked payment exists, is a succeeded charge, and that
-- user_id/currency_snapshot match — but NOT that amount/discount/plan/
-- status match, and nothing stopped multiple invoices for the same
-- payment (payment_id was nullable and unconstrained). 0001's own doc
-- comment deliberately left the amount/discount/plan checks out for a
-- real reason ("no documented formula for how these relate to the
-- linked payment") — this migration is exactly what establishes that
-- formula: an invoice's financial fields are ALWAYS the linked payment's
-- own fields, verbatim, because issue_invoice_from_payment() (below) is
-- now the only real issuance path and that's exactly what it does.
--
-- payment_id is now NOT NULL + a real unique index (schema diff above,
-- generated from billing.ts) — one invoice per payment, the decided
-- policy (see that file's doc comment for the reasoning).
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "payment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_payment_id_unique" ON "invoices" USING btree ("payment_id");--> statement-breakpoint

-- validate_invoice_insert() — same signature, CREATE OR REPLACE in
-- place (trigger functions take no explicit params). Adds the 4 checks
-- 0001 deliberately deferred, now that a real derivation formula exists.
-- Stays a real backstop even against a hypothetical direct service_role
-- INSERT that bypasses issue_invoice_from_payment() entirely — a
-- defensive trigger, not just an RPC-level assumption, per the task's
-- explicit ask that snapshot integrity not rely on the RPC alone.
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

  if new.amount_minor_snapshot <> linked.amount_minor then
    raise exception 'invoice amount_minor_snapshot (%) does not match its linked payment''s amount_minor (%)', new.amount_minor_snapshot, linked.amount_minor;
  end if;

  if new.discount_minor_snapshot <> linked.discount_minor_snapshot then
    raise exception 'invoice discount_minor_snapshot (%) does not match its linked payment''s discount_minor_snapshot (%)', new.discount_minor_snapshot, linked.discount_minor_snapshot;
  end if;

  if new.plan_id is distinct from linked.plan_id then
    raise exception 'invoice plan_id (%) does not match its linked payment''s plan_id (%)', new.plan_id, linked.plan_id;
  end if;

  if new.status <> 'paid' then
    raise exception 'invoices row % must be issued with status = paid (got %) — an invoice is only ever issued for an already-succeeded charge', new.id, new.status;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

-- issue_invoice_from_payment() — the ONLY real issuance path. Callable
-- by an AAL2 admin OR service_role (a future automated post-charge
-- issuance flow). SECURITY DEFINER is genuinely needed here (unlike
-- service_apply_subscription_update() in the previous migration): an
-- AAL2 admin has no raw INSERT grant on invoices after this migration
-- revokes it (below), so the admin-caller branch needs the privilege
-- escalation. Detecting a service_role caller therefore can NOT use
-- current_user (verified live while building the previous migration:
-- current_user inside a SECURITY DEFINER function is always the
-- function OWNER, never the original caller, for the function's entire
-- duration) — current_setting('role', true) is used instead, which was
-- verified live to correctly survive the SECURITY DEFINER boundary
-- (it reflects whatever the session's most recent SET ROLE actually
-- was, unaffected by privilege-context switching).
--
-- Never accepts amount/currency/discount/plan-name from the caller —
-- every financial field is derived from the LOCKED payment row only.
-- Idempotent via the new unique index: a repeat call for the same
-- payment_id returns the existing invoice, never creates a duplicate,
-- proven safe under real (not just sequential) concurrency by the
-- ON CONFLICT ... DO NOTHING + fallback SELECT pattern (same idiom as
-- this codebase's other idempotent claims).
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

  if result.id is null then
    select * into result from public.invoices where payment_id = p_payment_id;
  end if;

  return result;
end;
$$;
--> statement-breakpoint

-- Close the raw admin INSERT path — issuance only via the RPC above.
drop policy if exists invoices_insert_admin_aal2 on public.invoices;--> statement-breakpoint
revoke insert on public.invoices from authenticated;--> statement-breakpoint

-- Real, hard immutability — genuinely enforced, not just implied by the
-- absence of an UPDATE/DELETE policy. Direct verification while writing
-- this migration found a real gap: 0004's blanket service_role grant
-- (SELECT/INSERT/UPDATE/DELETE on ALL tables, never revoked for
-- service_role) combined with service_role's BYPASSRLS meant NOTHING
-- actually stopped a raw service_role UPDATE/DELETE on an already-
-- issued invoice — invoices_set_updated_at (0001) only bumps
-- updated_at, it doesn't block the UPDATE itself. Mirrors forbid_
-- audit_log_mutation()'s exact pattern (0001) — a hard RAISE EXCEPTION
-- on BEFORE UPDATE OR DELETE, no role exception, holds even for
-- service_role. invoices_set_updated_at is dropped as an explicit
-- consequence: an UPDATE can never succeed any more, so a trigger whose
-- only job is bumping updated_at on UPDATE is now genuinely dead code,
-- not just redundant — keeping it would be exactly the "comment claims
-- mutable, RLS says immutable" contradiction this section exists to
-- resolve, just moved into an unused trigger instead of a stale comment.
drop trigger if exists invoices_set_updated_at on public.invoices;--> statement-breakpoint

create or replace function public.forbid_invoice_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'invoices rows are immutable once issued and cannot be %', lower(tg_op);
end;
$$;
--> statement-breakpoint

drop trigger if exists invoices_forbid_mutation on public.invoices;--> statement-breakpoint
create trigger invoices_forbid_mutation
  before update or delete on public.invoices
  for each row execute procedure public.forbid_invoice_mutation();
--> statement-breakpoint

-- EXECUTE — REVOKE first (fresh function object at this exact
-- signature the first time this migration runs on a given database;
-- Postgres auto-grants EXECUTE to PUBLIC on CREATE FUNCTION).
revoke execute on function public.issue_invoice_from_payment(uuid) from public, anon;--> statement-breakpoint
grant execute on function public.issue_invoice_from_payment(uuid) to authenticated, service_role;