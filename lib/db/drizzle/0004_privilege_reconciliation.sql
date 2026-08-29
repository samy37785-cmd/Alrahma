-- RLS Remediation Round 3 (Section A — privilege reconciliation).
-- Still NOT applied to the real Supabase project — verified only against
-- a throwaway local Docker Postgres, same discipline as every prior
-- migration.
--
-- Real gap in 0002_rls.sql's closing GRANT block: it only ever
-- `REVOKE ... FROM PUBLIC`. In Postgres, `REVOKE FROM PUBLIC` removes
-- only the implicit everyone-gets-this grant — it does NOT touch a
-- grant made directly to a named role (anon/authenticated/service_role).
-- A real Supabase project that ever had a broader direct grant to one
-- of these roles at some point before this engagement (or picked one up
-- from any other process) would NOT actually be cleaned up by applying
-- 0002/0003 alone. The test suite never caught this because every local
-- test run always starts from freshly-created, grant-free local roles —
-- it can prove the policies are right, but it can never prove old
-- grants get removed, because there never were any to remove.
--
-- This migration is deliberately NOT a diff against 0002/0003's intent —
-- it is a full, explicit RESTATEMENT of the exact grant matrix those two
-- migrations already established, this time revoking from anon,
-- authenticated, AND service_role by name (not just PUBLIC) before
-- re-granting. Against a freshly-migrated local DB this is a no-op
-- (proven by the standard clean-database test run); against a DB
-- carrying real prior drift it is what actually fixes it (proven by
-- lib/db/test/upgrade-scenario.local.test.mjs, which deliberately
-- injects broad legacy-style grants before applying this file and then
-- asserts they're gone afterward, via has_table_privilege/
-- has_column_privilege/has_function_privilege — direct ACL checks, not
-- inference from an error message).
--
-- Scope: `schema public` only. `schema auth` stays Supabase-owned —
-- this project never asserts ownership over it (same discipline as
-- auth.users itself). No sequences exist anywhere in this schema (every
-- id column defaults via gen_random_uuid(), not serial/identity) —
-- verified before writing this file, not assumed; there is nothing to
-- revoke/re-grant on that front, noted here rather than silently
-- skipped.
--
-- Column-level privileges: also restated explicitly below (the 3
-- guest-insert tables' column-restricted INSERT grants) — a table-level
-- REVOKE ALL does revoke column-level grants on that table too (column
-- privileges are a subset of table privileges in Postgres's ACL model,
-- not a separate object), so the REVOKE step below already clears them;
-- this file just re-grants them precisely, same as everything else.

-- ---------------------------------------------------------------------
-- REVOKE step — explicit, from all 4 roles, not just PUBLIC.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from public, anon, authenticated, service_role;--> statement-breakpoint
revoke execute on all functions in schema public from public, anon, authenticated, service_role;--> statement-breakpoint
revoke usage on schema public from public, anon, authenticated, service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- GRANT step — restates 0002/0003's exact intended matrix.
-- ---------------------------------------------------------------------
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
-- set exactly, same discipline 0002 established (a table-level grant is
-- purely additive in Postgres, so it can never be narrowed by a more
-- specific one layered after it — the only way to keep "no policy means
-- no privilege either" true is to never grant that operation at all).
grant select on all tables in schema public to authenticated;--> statement-breakpoint
grant insert on public.quran_bookmarks, public.quran_reading_progress,
  public.quran_memorization_stats, public.plans, public.subscriptions,
  public.manual_payments, public.invoices, public.coupons, public.blogs,
  public.testimonials, public.notifications, public.notification_preferences
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

-- Function EXECUTE grants, one per intended caller (unchanged from
-- 0002/0003, restated explicitly).
grant execute on function public.is_admin() to anon, authenticated;--> statement-breakpoint
grant execute on function public.is_admin_aal2() to authenticated;--> statement-breakpoint
grant execute on function public.update_own_profile_name(text) to authenticated;--> statement-breakpoint
grant execute on function public.mark_notification_read(uuid) to authenticated;--> statement-breakpoint
grant execute on function public.admin_set_role(uuid, public.account_role) to authenticated;--> statement-breakpoint
grant execute on function public.admin_review_manual_payment(uuid, public.manual_payment_status, text) to authenticated;--> statement-breakpoint
grant execute on function public.admin_issue_refund(uuid, integer) to authenticated;--> statement-breakpoint
grant execute on function public.claim_provider_event(uuid) to service_role;--> statement-breakpoint
grant execute on function public.complete_provider_event(uuid, public.provider_event_status, text) to service_role;--> statement-breakpoint
grant execute on function public.reclaim_stale_provider_events(interval) to service_role;

-- Note on public.subscriptions being included in the INSERT-less /
-- UPDATE-included lists above: as of 0002/0003, subscriptions still had
-- a raw admin UPDATE policy (removed by 0006_subscription_integrity.sql,
-- which also REVOKEs this UPDATE grant specifically). This file restates
-- the grant matrix AS IT STOOD at the end of Round 2 — later migrations
-- in this same round (0006/0007/0008) are each responsible for revoking
-- exactly what they make obsolete, the normal multi-migration pattern,
-- not this file predicting the rest of the round.
