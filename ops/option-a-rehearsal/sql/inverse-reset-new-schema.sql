-- Option A — Inverse Reset (new schema -> old schema direction)
--
-- The rollback counterpart to sql/surgical-reset.sql. Surgical Reset
-- drops the 34 named OLD tables/enums so the NEW schema's migrations
-- can land cleanly; this file drops the 20 named NEW tables/enums/
-- functions so an OLD-schema restore (a real rg_restore of a pre-
-- Option-A backup bundle) can land cleanly on top of a database that
-- currently has the NEW schema applied.
--
-- Same discipline as surgical-reset.sql: every object is named
-- explicitly, nothing is discovered via CASCADE off a schema-level
-- DROP, and this file NEVER touches the public schema itself, its
-- owner/ACL, pg_default_acl, rls_auto_enable() + its event trigger,
-- the auth schema/auth.users, or any Supabase-managed role/extension/
-- storage/realtime/vault object.
--
-- Run only through scripts/restore-bundle.mjs's rollback path, which
-- enforces the same localhost-only guard as every other script here
-- and only invokes this file when explicitly asked to restore an OLD
-- bundle onto a target that currently has the NEW schema.
--
-- Every statement is `IF EXISTS` — safe to run against a database that
-- doesn't have the new schema at all (a no-op), or one that's only
-- partially migrated.
--
-- Functions are dropped via a dynamic DO block rather than hand-typed
-- `DROP FUNCTION name(arg_types...)` signatures — every signature here
-- is looked up live from pg_proc via `oid::regprocedure`, so this file
-- never has to be kept in sync by hand with each function's exact
-- argument list (which changes across migrations — e.g.
-- complete_provider_event's signature changed in 0005).

begin;

do $$
declare
  fn text;
  fn_oid regprocedure;
begin
  foreach fn in array array[
    'admin_activate_manual_subscription', 'admin_record_refund',
    'admin_review_manual_payment', 'admin_set_role',
    'admin_update_plan_display', 'claim_provider_event',
    'complete_provider_event', 'create_plan_version', 'deactivate_plan',
    'enforce_payment_status_transition', 'enforce_plan_immutability',
    'enforce_subscription_transition', 'forbid_audit_log_mutation',
    'forbid_invoice_mutation', 'forbid_payment_delete',
    'handle_new_user', 'is_admin', 'is_admin_aal2',
    'issue_invoice_from_payment', 'mark_notification_read',
    'reclaim_stale_provider_events', 'request_cancel_subscription',
    'service_apply_subscription_update', 'set_updated_at',
    'update_own_profile_name', 'validate_invoice_insert',
    'validate_refund_insert'
  ]
  loop
    for fn_oid in
      select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    loop
      execute format('drop function if exists %s cascade', fn_oid);
    end loop;
  end loop;
end;
$$;

drop table if exists public.admin_audit_log cascade;
drop table if exists public.blogs cascade;
drop table if exists public.coupon_redemptions cascade;
drop table if exists public.coupons cascade;
drop table if exists public.enrollments cascade;
drop table if exists public.invoices cascade;
drop table if exists public.manual_payments cascade;
drop table if exists public.notification_preferences cascade;
drop table if exists public.notifications cascade;
drop table if exists public.payments cascade;
drop table if exists public.plans cascade;
drop table if exists public.profiles cascade;
drop table if exists public.provider_events cascade;
drop table if exists public.quran_bookmarks cascade;
drop table if exists public.quran_memorization_stats cascade;
drop table if exists public.quran_reading_progress cascade;
drop table if exists public.subscribers cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.testimonials cascade;
drop table if exists public.trial_requests cascade;

drop type if exists public.account_role;
drop type if exists public.coupon_type;
drop type if exists public.currency_code;
drop type if exists public.discount_scope;
drop type if exists public.invoice_status;
drop type if exists public.manual_payment_status;
drop type if exists public.notification_type;
drop type if exists public.payment_gateway;
drop type if exists public.payment_kind;
drop type if exists public.payment_status;
drop type if exists public.provider_event_status;
drop type if exists public.subscription_status;

-- The new schema's migration journal must also go, so a subsequent
-- forward migrate() (if this environment is ever reused for the
-- forward direction again) starts clean rather than thinking 0000-0011
-- already applied against a database that no longer has any of it.
drop schema if exists drizzle cascade;

commit;
