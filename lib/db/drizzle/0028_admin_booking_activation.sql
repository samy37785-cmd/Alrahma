-- Scope correction (see docs/current-project-status.md; mirrors backend's
-- controllers/enrollmentController.js's Mongo-side approveEnrollment):
-- closes the one genuinely missing piece for "admin approves a booking ->
-- activates the student's subscription" under DATA_BACKEND=supabase,
-- without weakening admin_activate_manual_subscription()'s existing,
-- deliberate requirement (0006_subscription_integrity.sql) that a real
-- evidentiary manual_payments row precede activation.
-- admin_review_manual_payment() (0002_rls.sql) already documented this
-- exact next step as deferred:
--   "Activating the corresponding subscriptions row on approval is a
--    separately-designed atomic RPC (deferred - docs/product-scope-
--    audit.md §14), deliberately NOT done here."
-- This RPC is that piece, scoped narrowly to the booking-approval path: an
-- AAL2-verified admin with the enrollments:write permission attests (from a
-- real booking, not a blank form) that a payment was verified off-platform,
-- which inserts a manual_payments row already in 'approved' state
-- (reviewer_admin_id = the calling admin, reviewed_at = now(), exactly as
-- admin_review_manual_payment sets them), then calls
-- admin_activate_manual_subscription() UNCHANGED to perform the actual
-- activation - every existing invariant on that function (its own FOR
-- UPDATE claim, the enforce_subscription_transition trigger, its own
-- audit-log write) still applies in full; nothing here bypasses it.
--
-- Corrective revision (post-review): the first version of this migration
-- took p_plan_id directly from the caller with no link back to what the
-- student actually requested at booking time (enrollments.
-- requested_plan_slug), and the frontend's Approve button never had a plan
-- picker to supply one anyway — it always calls approveEnrollment(id) with
-- no body, so every Supabase-mode approval 400'd. Fixed by resolving the
-- plan INSIDE this function, matching plans.slug or plans.name against
-- enrollment.requested_plan_slug (case-insensitive - requested_plan_slug is
-- free text captured from the public booking form's plan display name,
-- e.g. "Huffaz", and real deployments may have seeded plans.slug as either
-- a true slug or the same display string; matching both is what actually
-- ties the activated plan to the plan the student booked, rather than
-- letting any caller-chosen plan through). No p_plan_id parameter exists
-- any more - there is nothing left for a caller to pass instead of the
-- booking's own requested plan. p_period_end gets a default so a direct
-- RPC call needs only the enrollment id.
--
-- Also added the authorize('enrollments:write') check alongside
-- is_admin_aal2() - the Express route already has requirePermissions
-- ('enrollments:write'), but this RPC is SECURITY DEFINER and reachable
-- directly by any authenticated+AAL2 admin session (e.g. straight through
-- Supabase's RPC endpoint, bypassing Express entirely), so the permission
-- check belongs inside the function too, matching this table's own more
-- recent precedent (0018_admin_users_system_and_enrollment_gaps.sql's
-- enrollments_insert_admin_aal2 policy: "is_admin_aal2() AND
-- authorize('enrollments:write')") rather than the older payment RPCs
-- (admin_review_manual_payment/admin_activate_manual_subscription), which
-- predate that convention and check is_admin_aal2() alone.
--
-- Note: enrollments.status's real CHECK constraint (enrollments_status_
-- allowlist, last widened by 0025_booking_first_enrollment.sql) allows
-- ('new','contacted','scheduled','awaiting_payment','paid','enrolled',
-- 'cancelled') - NOT the Mongo-side 'pending'/'approved' vocabulary that
-- utils/enrollmentValidation.js's shared ENROLLMENT_STATUSES uses for both
-- backends' admin PUT validation. That mismatch predates this migration and
-- is out of scope here; this function's own claim condition is written
-- against the real Postgres allowlist (anything not already 'enrolled' or
-- 'cancelled'), not the Mongo-only labels, so it is correct regardless of
-- that pre-existing, separate gap.
create or replace function public.admin_activate_subscription_from_enrollment(
  p_enrollment_id uuid,
  p_period_end timestamp with time zone default (now() + interval '30 days')
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment public.enrollments;
  matched_profile public.profiles;
  plan public.plans;
  new_manual_payment public.manual_payments;
  result public.subscriptions;
begin
  if not public.is_admin_aal2() then
    raise exception 'admin_activate_subscription_from_enrollment: caller is not an AAL2-verified admin';
  end if;

  if not public.authorize('enrollments:write') then
    raise exception 'admin_activate_subscription_from_enrollment: caller lacks the enrollments:write permission' using errcode = '42501';
  end if;

  select * into enrollment
  from public.enrollments
  where id = p_enrollment_id
    and status not in ('enrolled', 'cancelled')
  for update;

  if not found then
    raise exception 'admin_activate_subscription_from_enrollment: % is not a booking awaiting approval (already enrolled/cancelled, or does not exist)', p_enrollment_id;
  end if;

  select * into matched_profile
  from public.profiles
  where lower(email) = lower(enrollment.email)
  limit 1;

  if not found then
    raise exception 'admin_activate_subscription_from_enrollment: no registered account found for % yet - ask the student to sign up, then retry', enrollment.email;
  end if;

  if enrollment.requested_plan_slug is null then
    raise exception 'admin_activate_subscription_from_enrollment: enrollment % has no requested_plan_slug on record - cannot resolve which plan to activate', p_enrollment_id;
  end if;

  select * into plan
  from public.plans
  where active = true
    and (lower(slug) = lower(enrollment.requested_plan_slug) or lower(name) = lower(enrollment.requested_plan_slug))
  order by (lower(slug) = lower(enrollment.requested_plan_slug)) desc
  limit 1;

  if not found then
    raise exception 'admin_activate_subscription_from_enrollment: no active plan matches the booking''s requested plan (%) - seed a matching plans.slug/name or correct the booking', enrollment.requested_plan_slug;
  end if;

  insert into public.manual_payments (
    user_id, plan_id, requested_plan_slug, amount_minor, currency_snapshot,
    method, reference, notes, status, admin_note, reviewer_admin_id, reviewed_at
  ) values (
    matched_profile.id, plan.id, enrollment.requested_plan_slug, plan.amount_minor, plan.currency,
    'admin_attested_booking', enrollment.booking_ref,
    'Admin-attested activation from enrollment ' || p_enrollment_id::text,
    'approved', 'Admin-attested booking approval - verified off-platform, no self-submitted proof required',
    auth.uid(), now()
  )
  returning * into new_manual_payment;

  result := public.admin_activate_manual_subscription(new_manual_payment.id, plan.id, p_period_end);

  update public.enrollments set status = 'enrolled' where id = p_enrollment_id;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
  values (
    auth.uid(), 'admin_activate_subscription_from_enrollment', 'enrollments', p_enrollment_id::text,
    jsonb_build_object('status', enrollment.status),
    jsonb_build_object('status', 'enrolled', 'manual_payment_id', new_manual_payment.id, 'subscription_id', result.id, 'plan_id', plan.id)
  );

  return result;
end;
$$;
--> statement-breakpoint

-- Explicit REVOKE first (Postgres auto-grants EXECUTE to PUBLIC on CREATE
-- FUNCTION) - this is a fresh function object, so this is not a redundant
-- REVOKE of a previously-granted function.
revoke execute on function public.admin_activate_subscription_from_enrollment(uuid, timestamp with time zone) from public, anon;--> statement-breakpoint
grant execute on function public.admin_activate_subscription_from_enrollment(uuid, timestamp with time zone) to authenticated;
