-- Corrective revision (see docs/current-project-status.md): 0030 only
-- widened the enrollments_status_allowlist CHECK to also PERMIT 'pending'/
-- 'approved' — it never changed what a newly-created Supabase booking
-- actually gets written as. Every real write path still forced/defaulted
-- to 'new':
--   - submit_enrollment_booking() (0025_booking_first_enrollment.sql), the
--     only path a guest booking goes through, hard-codes status = 'new'.
--   - enrollments_insert_public's WITH CHECK (0002_rls.sql) still requires
--     status = 'new' for any direct (non-RPC) anon/authenticated insert.
--   - enrollments.status's own column DEFAULT (0000_init_20_table_baseline
--     .sql) is still 'new'.
--   - backend/data/supabase/admin/enrollmentsAdminController.js's admin
--     create path (POST /api/v1/admin/enrollments) still falls back to
--     COALESCE($16, 'new') when an admin-authored record omits status.
--
-- Net effect: AdminBookingsTab.jsx's "Approve & Activate" action is gated
-- on `status === 'pending' || status === 'approved'` (the shared,
-- Mongo-canonical ENROLLMENT_STATUSES vocabulary — Mongo's own default is
-- already 'pending', see models/Enrollment.js) and every fresh Supabase
-- booking arrived as 'new', which is not in that set — the action never
-- appeared, and the admin booking-to-activation flow was never actually
-- reachable end-to-end under DATA_BACKEND=supabase. 0028_admin_booking_
-- activation.sql's RPC itself claims a row via `status not in ('enrolled',
-- 'cancelled')`, so it was never blocked by this — only the UI's
-- visibility gate was.
--
-- Fix: make 'pending' the value every new-booking write path actually
-- produces, matching what Mongo has always done, and reconcile existing
-- rows.
--
-- Exact status mapping applied by this migration (recorded here as the
-- single source of truth, referenced by
-- lib/db/test/enrollment-status-reconciliation.local.test.mjs and this
-- migration's own dedicated test):
--   'new'                -> 'pending'   (both mean: newly submitted,
--                                         awaiting admin review — no
--                                         semantic difference, just a
--                                         vocabulary rename)
--   'contacted'           -> unchanged   (legacy offline-payment-bookkeeping
--   'scheduled'            unchanged     state; no unambiguous mapping to
--   'awaiting_payment'     unchanged     the new pending/approved/enrolled/
--   'paid'                 unchanged     cancelled vocabulary exists, so
--                                         these are preserved exactly as-is,
--                                         same posture 0030 already
--                                         documented for them — readable,
--                                         valid, just not newly settable by
--                                         any API)
--   'enrolled'/'cancelled' -> unchanged  (already canonical on both sides)
--
-- 1) Reconcile existing rows: 'new' and 'pending' are the same real-world
-- state (a freshly submitted booking, not yet reviewed), so this is a safe,
-- unambiguous, documented rename of existing data — unlike the other
-- legacy values, which stay untouched because no such unambiguous mapping
-- exists for them.
UPDATE "enrollments" SET "status" = 'pending' WHERE "status" = 'new';--> statement-breakpoint

-- 2) The column default: any future INSERT that omits status entirely
-- (there is currently none — every real path sets it explicitly — but the
-- default should still reflect the canonical value, not the retired one).
ALTER TABLE "enrollments" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint

-- 3) enrollments_insert_public (0002_rls.sql): the direct-insert RLS check
-- for anon/authenticated. submit_enrollment_booking() is SECURITY DEFINER
-- and bypasses this policy entirely, but it exists as defense-in-depth
-- against a future direct-insert path re-appearing — it must require the
-- same canonical value the RPC now writes, or a direct insert would be
-- capable of producing a non-canonical 'new' row that the RPC itself no
-- longer produces. ALTER POLICY keeps the same policy object/grants in
-- place and only changes its WITH CHECK expression.
ALTER POLICY "enrollments_insert_public" ON "enrollments"
  WITH CHECK ("status" = 'pending');--> statement-breakpoint

-- 4) submit_enrollment_booking(): identical parameter allowlist, identical
-- validation, identical REVOKE/GRANT — the only change is the literal
-- passed for status. CREATE OR REPLACE preserves the function's existing
-- grants (REVOKE/GRANT below are re-asserted for clarity, not because
-- CREATE OR REPLACE resets them).
CREATE OR REPLACE FUNCTION "public"."submit_enrollment_booking"(
  p_name text, p_email text, p_whatsapp text, p_country text, p_city text,
  p_timezone text, p_times jsonb, p_subjects jsonb, p_lang text, p_level text,
  p_age_group text, p_gender_pref text, p_teacher_key text, p_teacher_name text,
  p_plan_slug text, p_notes text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_ref text;
  v_attempts int := 0;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'email_required' using errcode = 'P0001';
  end if;
  if p_whatsapp is null or p_whatsapp !~ '^\+?[0-9]{7,15}$' then
    raise exception 'whatsapp_required' using errcode = 'P0001';
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_ref := 'AR-' || to_char(now(), 'YYYYMMDD') || '-' ||
             upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    begin
      insert into public.enrollments (
        name, email, whatsapp, country, city, timezone, times, subjects,
        lang, level, age_group, gender_pref, preferred_teacher_key,
        preferred_teacher_name, requested_plan_slug, notes, status, booking_ref
      ) values (
        p_name, p_email, p_whatsapp, p_country, p_city, p_timezone,
        coalesce(p_times, '[]'::jsonb), coalesce(p_subjects, '[]'::jsonb),
        p_lang, p_level, p_age_group, p_gender_pref, p_teacher_key,
        p_teacher_name, p_plan_slug, p_notes, 'pending', v_ref
      );
      exit;
    exception when unique_violation then
      if v_attempts >= 5 then
        raise;
      end if;
    end;
  end loop;

  return v_ref;
end;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."submit_enrollment_booking"(text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, text, text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."submit_enrollment_booking"(text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, text, text, text, text) TO anon, authenticated;
