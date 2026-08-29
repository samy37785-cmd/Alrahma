-- Row Level Security for the 20-table baseline (docs/rls-matrix.md).
-- This is the schema+RLS+grants release the earlier commits' warning
-- banners describe — written and tested here, still NOT applied to the
-- real Supabase project (see docs/product-scope-audit.md §13's Migration
-- Policy and docs/remote-reconciliation-proposal.md). Verified only
-- against a throwaway local Docker Postgres.
--
-- Roles referenced (anon, authenticated, service_role) are Supabase-
-- standard roles the real project already provisions automatically —
-- this migration does not create them (same discipline as auth.users:
-- never create what Supabase already owns). The local test harness
-- creates matching local roles before migrate() runs — local-only
-- scaffolding, not part of this file.
--
-- GRANT strategy matches Supabase's own convention: broad SQL-level
-- privileges to anon/authenticated, with RLS policies as the real
-- row-level gate — not fine-grained per-table GRANTs pretending to be
-- the security boundary.

-- ---------------------------------------------------------------------
-- Helper functions.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
--> statement-breakpoint

-- AAL2 = the admin's session has completed Supabase Auth MFA step-up
-- ("Admin auth = full Supabase Auth convergence", decided earlier in
-- this engagement). Required for every read/write that touches money,
-- role, or the audit log itself — an AAL1 (password-only) admin session
-- is NOT enough for those, tightened per an explicit user decision
-- during baseline remediation (was AAL1-sufficient-for-everything in
-- the first RLS matrix draft).
create or replace function public.is_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() and (auth.jwt() ->> 'aal') = 'aal2';
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Enable RLS on all 20 tables.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;--> statement-breakpoint
alter table public.quran_bookmarks enable row level security;--> statement-breakpoint
alter table public.quran_reading_progress enable row level security;--> statement-breakpoint
alter table public.quran_memorization_stats enable row level security;--> statement-breakpoint
alter table public.enrollments enable row level security;--> statement-breakpoint
alter table public.plans enable row level security;--> statement-breakpoint
alter table public.subscriptions enable row level security;--> statement-breakpoint
alter table public.payments enable row level security;--> statement-breakpoint
alter table public.provider_events enable row level security;--> statement-breakpoint
alter table public.manual_payments enable row level security;--> statement-breakpoint
alter table public.invoices enable row level security;--> statement-breakpoint
alter table public.coupons enable row level security;--> statement-breakpoint
alter table public.coupon_redemptions enable row level security;--> statement-breakpoint
alter table public.blogs enable row level security;--> statement-breakpoint
alter table public.testimonials enable row level security;--> statement-breakpoint
alter table public.trial_requests enable row level security;--> statement-breakpoint
alter table public.subscribers enable row level security;--> statement-breakpoint
alter table public.notifications enable row level security;--> statement-breakpoint
alter table public.notification_preferences enable row level security;--> statement-breakpoint
alter table public.admin_audit_log enable row level security;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 1. profiles
-- RLS Remediation Round 2 (finding 1): a raw profiles_update_admin_aal2
-- policy used to sit alongside admin_set_role() below, letting the same
-- AAL2 admin session UPDATE role (or anything else) directly, bypassing
-- the RPC's audit-log write entirely — a real, tested bypass, not
-- hypothetical. Removed: NO raw UPDATE policy exists for `authenticated`
-- at all now, for anyone, admin included. admin_set_role() still works
-- regardless (SECURITY DEFINER bypasses RLS by privilege, not by this
-- policy's presence) and is now the ONLY way to change a profiles row.
-- Owner UPDATE (name only) is the same story, one level down:
-- update_own_profile_name()/mark_notification_read() below are the only
-- owner-write paths, sidestepping the column-privilege problem entirely
-- (a `role` column raw grant would let a user self-promote to admin in
-- the same UPDATE) rather than trying to solve it with GRANT/REVOKE
-- column privileges.
-- ---------------------------------------------------------------------
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());
--> statement-breakpoint

-- Returns SETOF, not a single row: a plain `RETURNS public.profiles`
-- function always returns exactly one row from `SELECT * FROM func()`,
-- even when nothing matched (an all-NULL row) — found by actually
-- running the RLS test suite, which needs "0 rows" to genuinely mean
-- "nothing happened," not "here's a row of NULLs" the caller has to
-- separately check for.
create or replace function public.update_own_profile_name(p_name text)
returns setof public.profiles
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'update_own_profile_name: no authenticated user';
  end if;

  return query
  update public.profiles
  set name = p_name
  where id = auth.uid()
  returning *;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 2-4. quran_bookmarks / quran_reading_progress / quran_memorization_stats
-- Pure per-user tool data — owner has full CRUD, admin AAL1 can read for
-- support. RLS Remediation Round 2 (finding, "your call" — decided:
-- fix now): these 3 tables used to share one FOR ALL policy whose WITH
-- CHECK bound INSERT/UPDATE but not DELETE (Postgres only applies USING
-- to a DELETE, never WITH CHECK) — so admin's `is_admin()` in the USING
-- clause let them delete another user's row with zero audit trail, even
-- though the same policy's WITH CHECK blocked them from meaningfully
-- editing/inserting on that user's behalf. Split into two clean
-- policies per table instead: a pure owner FOR ALL (no admin clause at
-- all) plus a read-only admin SELECT. Admin now has ZERO write/delete
-- capability on this data, at either AAL level — a real capability
-- reduction, deliberate.
-- ---------------------------------------------------------------------
create policy quran_bookmarks_owner_all on public.quran_bookmarks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
--> statement-breakpoint

create policy quran_bookmarks_select_admin on public.quran_bookmarks
  for select to authenticated
  using (public.is_admin());
--> statement-breakpoint

create policy quran_reading_progress_owner_all on public.quran_reading_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
--> statement-breakpoint

create policy quran_reading_progress_select_admin on public.quran_reading_progress
  for select to authenticated
  using (public.is_admin());
--> statement-breakpoint

create policy quran_memorization_stats_owner_all on public.quran_memorization_stats
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
--> statement-breakpoint

create policy quran_memorization_stats_select_admin on public.quran_memorization_stats
  for select to authenticated
  using (public.is_admin());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 5. enrollments — guest-submittable (anon insert), admin-managed
-- otherwise. No rate limiting on the anon INSERT policy — an explicitly
-- DEFERRED item, but a BLOCKING one before any public/production
-- exposure of this endpoint (docs/product-scope-audit.md §14,
-- docs/rls-matrix.md): the earlier "Postgres counters" decision
-- conflicts with rate_limit_counters being on the DROP list, and the
-- user chose to defer rather than pick a mechanism now — acceptable
-- only because this baseline is local-only and never applied anywhere.
-- WITH CHECK now also forces status = 'new' (RLS Remediation Round 2,
-- finding 3): used to be `with check (true)`, letting a guest submit
-- e.g. status = 'enrolled' directly, forging the admin-review outcome
-- on arrival.
-- ---------------------------------------------------------------------
create policy enrollments_insert_public on public.enrollments
  for insert to anon, authenticated
  with check (status = 'new');
--> statement-breakpoint

create policy enrollments_select_admin on public.enrollments
  for select to authenticated
  using (public.is_admin());
--> statement-breakpoint

create policy enrollments_update_admin_aal2 on public.enrollments
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy enrollments_delete_admin_aal2 on public.enrollments
  for delete to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 6. plans — public read of active plans only; admin-managed otherwise.
-- No DELETE policy at all for any authenticated/anon/admin role — plans
-- are never hard-deleted (deactivated + superseded instead), matching
-- plans.ts's own "never mutate historical price" design.
-- ---------------------------------------------------------------------
create policy plans_select_active_or_admin on public.plans
  for select to anon, authenticated
  using (active = true or public.is_admin());
--> statement-breakpoint

create policy plans_insert_admin_aal2 on public.plans
  for insert to authenticated
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy plans_update_admin_aal2 on public.plans
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 7. subscriptions — owner + admin read; writes are service_role/RPC-
-- driven, not raw client INSERT/UPDATE (a user-initiated cancellation
-- goes through a deferred RPC, not a direct client write — see
-- docs/rls-matrix.md note 6). AAL2-tightened (RLS Remediation Round 2,
-- finding: was AAL1-readable — this table carries provider_customer_id/
-- provider_subscription_id, real payment-gateway identifiers, joining
-- the already-tightened payments/manual_payments/invoices/provider_
-- events/admin_audit_log group).
-- ---------------------------------------------------------------------
create policy subscriptions_select_own_or_admin_aal2 on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_aal2());
--> statement-breakpoint

create policy subscriptions_update_admin_aal2 on public.subscriptions
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 8. payments — the ledger. AAL2-tightened (baseline remediation): was
-- AAL1-readable in the first RLS matrix draft, a user review flagged
-- that as too permissive for financial data, tightened per an explicit
-- user decision. No raw client INSERT at all, for any role including
-- admin — RLS Remediation Round 2 (finding 1): a raw payments_insert_
-- admin_aal2 policy used to sit alongside admin_issue_refund() below,
-- letting the same AAL2 admin session INSERT a payments row directly —
-- including a fabricated kind='charge' status='succeeded' row, since no
-- trigger governs INSERT the way validate_refund_insert() governs
-- kind='refund' rows. Removed entirely. admin_issue_refund() is now the
-- ONLY INSERT path for anyone but service_role (the real webhook/
-- gateway writer), and it still works regardless (SECURITY DEFINER
-- bypasses RLS by privilege, not by this policy's presence). No UPDATE
-- policy for any authenticated role at all — even admin never hand-
-- edits a payment row (the real enforce_payment_status_transition()
-- trigger governs service_role's own updates regardless of RLS).
-- ---------------------------------------------------------------------
create policy payments_select_own_or_admin_aal2 on public.payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 9. provider_events — AAL2-tightened, same reasoning as payments. No
-- INSERT/UPDATE policy for authenticated at all (service_role only,
-- via claim_provider_event()/complete_provider_event()).
-- ---------------------------------------------------------------------
create policy provider_events_select_admin_aal2 on public.provider_events
  for select to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 10. manual_payments — AAL2-tightened. Owner can submit their own
-- proof-of-payment; review is exclusively admin_review_manual_payment()
-- below. RLS Remediation Round 2 (finding 1): a raw manual_payments_
-- update_admin_aal2 policy used to sit alongside that RPC, letting the
-- same AAL2 admin session UPDATE status/admin_note/reviewer_admin_id/
-- reviewed_at directly, bypassing the RPC's FOR UPDATE pending-claim
-- (so the same row could be "approved" twice by two racing raw UPDATEs)
-- and its audit-log write. Removed entirely — the RPC is now the ONLY
-- review path, and still works regardless (SECURITY DEFINER bypasses
-- RLS by privilege, not by this policy's presence).
--
-- manual_payments_insert_own's WITH CHECK (finding 2, Round 2): used to
-- only test user_id = auth.uid() — status/reviewer_admin_id/reviewed_at/
-- admin_note are real columns on this table a client could set on
-- insert, e.g. submitting a proof-of-payment already marked 'approved'.
-- Now forces every owner-submitted row to actually be a fresh, unreviewed
-- pending claim.
-- ---------------------------------------------------------------------
create policy manual_payments_select_own_or_admin_aal2 on public.manual_payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_aal2());
--> statement-breakpoint

create policy manual_payments_insert_own on public.manual_payments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewer_admin_id is null
    and reviewed_at is null
    and admin_note is null
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 11. invoices — AAL2-tightened, read-only receipts (no UPDATE policy
-- at all — an invoice is an immutable snapshot once issued). No RPC
-- wraps invoice issuance (unlike payments/manual_payments/profiles) —
-- it's a receipt snapshot, not a ledger mutation with a concurrency
-- race, so there's no atomicity/locking need an RPC would add. Instead
-- (RLS Remediation Round 2, finding 1) the raw INSERT below is backed by
-- a real trigger, validate_invoice_insert() (0001_functions_triggers.sql,
-- mirrors validate_refund_insert()'s pattern): rejects unless payment_id
-- names a real, succeeded payments row with a matching user_id/
-- currency_snapshot — a raw insert can no longer fabricate a receipt
-- disconnected from an actual successful charge.
-- ---------------------------------------------------------------------
create policy invoices_select_own_or_admin_aal2 on public.invoices
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_aal2());
--> statement-breakpoint

create policy invoices_insert_admin_aal2 on public.invoices
  for insert to authenticated
  with check (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 12. coupons — no anon/authenticated SELECT at all (code validation at
-- checkout is intended to go through a server-side RPC, deferred — not
-- built this pass, so the full active-coupon list is never queryable by
-- a client). Admin AAL1 can read (catalog data, not financial-PII in
-- the tightened sense); writes require AAL2.
-- ---------------------------------------------------------------------
create policy coupons_select_admin on public.coupons
  for select to authenticated
  using (public.is_admin());
--> statement-breakpoint

create policy coupons_insert_admin_aal2 on public.coupons
  for insert to authenticated
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy coupons_update_admin_aal2 on public.coupons
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy coupons_delete_admin_aal2 on public.coupons
  for delete to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 13. coupon_redemptions — owner read only; writes are service_role-
-- driven (recorded by the checkout flow, not a direct client insert).
-- ---------------------------------------------------------------------
create policy coupon_redemptions_select_own_or_admin on public.coupon_redemptions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 14-15. blogs / testimonials — public read of published rows only;
-- admin-managed otherwise (AAL1 read for drafts, AAL2 write).
-- ---------------------------------------------------------------------
create policy blogs_select_published_or_admin on public.blogs
  for select to anon, authenticated
  using (published = true or public.is_admin());
--> statement-breakpoint

create policy blogs_insert_admin_aal2 on public.blogs
  for insert to authenticated
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy blogs_update_admin_aal2 on public.blogs
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy blogs_delete_admin_aal2 on public.blogs
  for delete to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

create policy testimonials_select_published_or_admin on public.testimonials
  for select to anon, authenticated
  using (published = true or public.is_admin());
--> statement-breakpoint

create policy testimonials_insert_admin_aal2 on public.testimonials
  for insert to authenticated
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy testimonials_update_admin_aal2 on public.testimonials
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy testimonials_delete_admin_aal2 on public.testimonials
  for delete to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 16. trial_requests — same shape as enrollments. Deferred-but-blocking
-- rate limiting applies here too (see the enrollments comment above).
-- WITH CHECK forces status = 'new', same reasoning as enrollments
-- (finding 3).
-- ---------------------------------------------------------------------
create policy trial_requests_insert_public on public.trial_requests
  for insert to anon, authenticated
  with check (status = 'new');
--> statement-breakpoint

create policy trial_requests_select_admin on public.trial_requests
  for select to authenticated
  using (public.is_admin());
--> statement-breakpoint

create policy trial_requests_update_admin_aal2 on public.trial_requests
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy trial_requests_delete_admin_aal2 on public.trial_requests
  for delete to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 17. subscribers — same guest-insert shape. No UPDATE policy for
-- anon/authenticated at all (unsubscribe is a signed-link, service_role
-- flow, matching content.ts's doc comment on this table). Deferred-but-
-- blocking rate limiting applies here too — see docs/rls-matrix.md's
-- "Deferred / explicitly out of scope" section. WITH CHECK forces
-- status = 'subscribed', same reasoning as enrollments (finding 3) — a
-- guest signing up can't insert themselves as already 'unsubscribed'.
-- ---------------------------------------------------------------------
create policy subscribers_insert_public on public.subscribers
  for insert to anon, authenticated
  with check (status = 'subscribed');
--> statement-breakpoint

create policy subscribers_select_admin on public.subscribers
  for select to authenticated
  using (public.is_admin());
--> statement-breakpoint

create policy subscribers_update_admin_aal2 on public.subscribers
  for update to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy subscribers_delete_admin_aal2 on public.subscribers
  for delete to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 18. notifications — owner reads/dismisses their own; no raw UPDATE
-- policy at all (the "mark read" mutation goes through
-- mark_notification_read() below, so a column-privilege problem on
-- title/body/meta never arises — same pattern as profiles.name).
-- RLS Remediation Round 2 ("your call" — decided: AAL2 for full read):
-- there used to be NO admin read policy on this table at all, unlike
-- every other owner-scoped table here — now AAL2 admin gets full read
-- access (support/compliance); AAL1 admin still gets none.
-- ---------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());
--> statement-breakpoint

create policy notifications_select_admin_aal2 on public.notifications
  for select to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

create policy notifications_insert_admin_aal2 on public.notifications
  for insert to authenticated
  with check (public.is_admin_aal2());
--> statement-breakpoint

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());
--> statement-breakpoint

-- SETOF, same reasoning as update_own_profile_name() above.
create or replace function public.mark_notification_read(p_id uuid)
returns setof public.notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'mark_notification_read: no authenticated user';
  end if;

  return query
  update public.notifications
  set read = true
  where id = p_id and user_id = auth.uid()
  returning *;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 19. notification_preferences — owner-managed settings singleton;
-- admin AAL1 read for support.
-- ---------------------------------------------------------------------
create policy notification_preferences_select_own_or_admin on public.notification_preferences
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
--> statement-breakpoint

create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());
--> statement-breakpoint

create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 20. admin_audit_log — AAL2-tightened read; no INSERT/UPDATE/DELETE
-- policy at all, for any role. RLS Remediation Round 2 (finding 1): a
-- raw admin_audit_log_insert_admin_aal2 policy used to let any AAL2
-- admin session insert arbitrary audit rows directly — forging a fake
-- "this happened" entry, or omitting one, entirely independent of
-- whether the mutation it claims to record actually occurred. Removed
-- entirely. Every real audit-log write happens ONLY from inside
-- admin_set_role()/admin_review_manual_payment()/admin_issue_refund()
-- below, as the function owner (SECURITY DEFINER bypasses RLS by
-- privilege, not by this policy's presence) — the mutation and its audit
-- row are atomic and neither can happen without the other. UPDATE/
-- DELETE remain policy-less too, same as before (the real forbid_audit_
-- log_mutation() trigger already blocks both, regardless of role — a
-- second, redundant-by-design layer, not the only one).
-- ---------------------------------------------------------------------
create policy admin_audit_log_select_admin_aal2 on public.admin_audit_log
  for select to authenticated
  using (public.is_admin_aal2());
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Highest-risk admin mutations: SECURITY DEFINER RPCs bundling the
-- mutation and its admin_audit_log row into one atomic transaction,
-- never relying on separate application-code calls that could forget
-- the audit write. Each re-checks admin+AAL2 itself (never trust RLS
-- alone inside a SECURITY DEFINER function, since it bypasses RLS by
-- privilege).
-- ---------------------------------------------------------------------
create or replace function public.admin_set_role(p_user_id uuid, p_role public.account_role)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.profiles;
  after_row public.profiles;
begin
  if not public.is_admin_aal2() then
    raise exception 'admin_set_role: caller is not an AAL2-verified admin';
  end if;

  select * into before_row from public.profiles where id = p_user_id;
  if not found then
    raise exception 'admin_set_role: no profiles row for %', p_user_id;
  end if;

  update public.profiles set role = p_role where id = p_user_id
  returning * into after_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'admin_set_role', 'profiles', p_user_id::text,
    jsonb_build_object('role', before_row.role),
    jsonb_build_object('role', after_row.role)
  );

  return after_row;
end;
$$;
--> statement-breakpoint

create or replace function public.admin_review_manual_payment(
  p_id uuid,
  p_decision public.manual_payment_status,
  p_admin_note text default null
)
returns public.manual_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.manual_payments;
  after_row public.manual_payments;
begin
  if not public.is_admin_aal2() then
    raise exception 'admin_review_manual_payment: caller is not an AAL2-verified admin';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'admin_review_manual_payment: p_decision must be approved or rejected (got %)', p_decision;
  end if;

  select * into before_row
  from public.manual_payments
  where id = p_id and status = 'pending'
  for update;

  if not found then
    raise exception 'admin_review_manual_payment: % is not a pending manual_payments row', p_id;
  end if;

  update public.manual_payments
  set status = p_decision,
      admin_note = p_admin_note,
      reviewer_admin_id = auth.uid(),
      reviewed_at = now()
  where id = p_id
  returning * into after_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'admin_review_manual_payment', 'manual_payments', p_id::text,
    jsonb_build_object('status', before_row.status),
    jsonb_build_object('status', after_row.status, 'admin_note', after_row.admin_note)
  );

  -- Activating the corresponding subscriptions row on approval is a
  -- separately-designed atomic RPC (deferred — docs/product-scope-
  -- audit.md §14), deliberately NOT done here.
  return after_row;
end;
$$;
--> statement-breakpoint

create or replace function public.admin_issue_refund(p_charge_id uuid, p_amount_minor integer)
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
    raise exception 'admin_issue_refund: caller is not an AAL2-verified admin';
  end if;

  select * into charge from public.payments where id = p_charge_id;
  if not found then
    raise exception 'admin_issue_refund: no payments row %', p_charge_id;
  end if;

  -- validate_refund_insert() (0001) still independently enforces every
  -- real constraint (locked-parent-row, succeeded-only, amount cap,
  -- matching user/currency/gateway) — this RPC does not duplicate that
  -- logic, it relies on it.
  insert into public.payments (user_id, plan_id, subscription_id, kind, parent_payment_id, amount_minor, currency_snapshot, gateway, status)
  values (charge.user_id, charge.plan_id, charge.subscription_id, 'refund', charge.id, p_amount_minor, charge.currency_snapshot, charge.gateway, 'succeeded')
  returning * into refund;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'admin_issue_refund', 'payments', refund.id::text,
    jsonb_build_object('charge_id', charge.id, 'charge_amount_minor', charge.amount_minor),
    jsonb_build_object('refund_id', refund.id, 'refund_amount_minor', refund.amount_minor)
  );

  return refund;
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- GRANT strategy — RLS Remediation Round 2 (finding 5): the previous
-- version of this block granted blanket SELECT/INSERT/UPDATE/DELETE on
-- ALL tables and EXECUTE on ALL functions to anon/authenticated/
-- service_role, relying entirely on RLS policies as the real boundary.
-- Two real problems with that: (1) Postgres auto-grants EXECUTE on a
-- newly created function to PUBLIC by default (unlike tables, which
-- default to owner-only) — so every SECURITY DEFINER admin RPC below
-- was reachable by literally anyone regardless of the blanket grant,
-- protected only by each function's own internal is_admin_aal2() check,
-- not by any privilege boundary; (2) a blanket INSERT grant on
-- enrollments/trial_requests/subscribers let anon/authenticated specify
-- ANY column on insert, including created_at (backdating a lead-capture
-- row) — the WITH CHECK additions above already block a forged status
-- value, but not a forged created_at.
--
-- REVOKE-from-PUBLIC first, then explicit, minimal per-role grants:
-- anon gets read-only catalog access plus column-restricted guest-form
-- inserts, nothing else; authenticated gets the broader base access RLS
-- is the real gate for (admin-vs-owner is a row value checked INSIDE
-- policies via is_admin()/is_admin_aal2(), not a separate Postgres
-- role — so authenticated must still have base access to every table
-- an admin policy targets, admin sessions ARE 'authenticated'), except
-- the same 3 tables' INSERT is column-restricted here too, for the same
-- reason as anon; service_role keeps full unrestricted access (the
-- trusted server role, bypasses RLS by design via BYPASSRLS — but
-- BYPASSRLS only skips row-level policies, not base SQL privileges, so
-- it still needs real GRANTs, a bug this engagement already caught
-- once before).
--
-- Functions get individual EXECUTE grants matched to who's actually
-- meant to call them: is_admin() is referenced by an anon-visible
-- policy (plans/blogs/testimonials SELECT), so anon needs it too;
-- is_admin_aal2() and every owner/admin RPC are authenticated-only
-- (the admin ones stay self-guarded internally on top of this);
-- claim_provider_event()/complete_provider_event() are service_role-
-- only (the webhook worker, never a client call); every 0001 trigger
-- function gets NO grant to any client role at all — Postgres does not
-- check EXECUTE privilege to fire a trigger, only to call a function
-- directly in a query, so none is needed.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from public;--> statement-breakpoint
revoke execute on all functions in schema public from public;--> statement-breakpoint

grant usage on schema public to anon, authenticated, service_role;--> statement-breakpoint

-- anon — read-only public catalog + the 3 guest-insert forms only.
grant select on public.plans, public.blogs, public.testimonials to anon;--> statement-breakpoint
grant insert (
  name, email, whatsapp, country, city, timezone, times, subjects, lang,
  level, age_group, gender_pref, preferred_teacher_key,
  preferred_teacher_name, requested_plan_slug, status, notes
) on public.enrollments to anon, authenticated;--> statement-breakpoint
grant insert (name, email, phone, course, message, status)
  on public.trial_requests to anon, authenticated;--> statement-breakpoint
grant insert (email, status) on public.subscribers to anon, authenticated;--> statement-breakpoint

-- authenticated — enumerated per operation to match the actual policy
-- set exactly (not a blanket grant minus exceptions — a table-level
-- grant is purely additive in Postgres, so a broad grant can never be
-- narrowed by a more specific one layered after it; the only way to
-- keep "no policy → no privilege either" true for a table is to never
-- grant that operation in the first place). Every table has a SELECT
-- policy for authenticated (owner or admin), so SELECT alone stays a
-- clean blanket grant; INSERT/UPDATE/DELETE are listed only for the
-- tables that actually have a matching authenticated-targeted policy —
-- notably profiles (no UPDATE — RPC-only), payments (no UPDATE/INSERT —
-- RPC-only/service_role-only), manual_payments (no UPDATE — RPC-only),
-- provider_events/subscriptions (no INSERT — service_role/RPC-only),
-- and admin_audit_log (no INSERT/UPDATE/DELETE — RPC-internal-only) are
-- deliberately absent from the corresponding list below, so a raw
-- attempt on any of those fails at the GRANT layer, before RLS is even
-- evaluated — true defense in depth, not RLS as the sole boundary.
grant select on all tables in schema public to authenticated;--> statement-breakpoint
grant insert on public.quran_bookmarks, public.quran_reading_progress,
  public.quran_memorization_stats, public.plans, public.manual_payments,
  public.invoices, public.coupons, public.blogs, public.testimonials,
  public.notifications, public.notification_preferences
  to authenticated;--> statement-breakpoint
grant update on public.quran_bookmarks, public.quran_reading_progress,
  public.quran_memorization_stats, public.enrollments, public.plans,
  public.subscriptions, public.coupons, public.blogs,
  public.testimonials, public.trial_requests, public.subscribers,
  public.notification_preferences
  to authenticated;--> statement-breakpoint
grant delete on public.quran_bookmarks, public.quran_reading_progress,
  public.quran_memorization_stats, public.enrollments, public.coupons,
  public.blogs, public.testimonials, public.trial_requests,
  public.subscribers, public.notifications
  to authenticated;--> statement-breakpoint

-- service_role — full, unrestricted (the trusted server role).
grant select, insert, update, delete on all tables in schema public to service_role;--> statement-breakpoint

-- Function EXECUTE grants, one per intended caller.
grant execute on function public.is_admin() to anon, authenticated;--> statement-breakpoint
grant execute on function public.is_admin_aal2() to authenticated;--> statement-breakpoint
grant execute on function public.update_own_profile_name(text) to authenticated;--> statement-breakpoint
grant execute on function public.mark_notification_read(uuid) to authenticated;--> statement-breakpoint
grant execute on function public.admin_set_role(uuid, public.account_role) to authenticated;--> statement-breakpoint
grant execute on function public.admin_review_manual_payment(uuid, public.manual_payment_status, text) to authenticated;--> statement-breakpoint
grant execute on function public.admin_issue_refund(uuid, integer) to authenticated;--> statement-breakpoint
grant execute on function public.claim_provider_event(uuid) to service_role;--> statement-breakpoint
grant execute on function public.complete_provider_event(uuid, public.provider_event_status, text) to service_role;
