-- Booking-First Enrollment: Mongo/Supabase parity for the admin booking
-- fields added to backend/models/Enrollment.js (see that file's own
-- comment for the product rationale — no in-app online payment; a booking
-- is followed up over WhatsApp and paid off-site, then an admin records
-- what was agreed and activates the account). Purely additive: every
-- existing `enrollments` row already satisfies the widened status
-- allowlist (it already had one of the 5 original values), and every new
-- column is nullable with no default, so no backfill is needed.
--
-- Hand-written, not `drizzle-kit generate`-produced: this project's
-- migrations/meta snapshots already drifted out of sync with src/schema/
-- before this change (several hand-written migrations, e.g. 0013-0022,
-- added columns without a matching `drizzle-kit generate` run updating the
-- meta/*.json snapshots) — a real, pre-existing condition, not something
-- introduced or fixed here. Running `drizzle-kit generate` for this change
-- reproduced that entire unrelated backlog as spurious duplicate-column
-- ALTERs; discarded in favor of hand-writing just the enrollments delta,
-- matching this file's own established convention (0018 is likewise
-- hand-written for the same reason). Fixing the snapshot drift itself is a
-- separate, unrelated migration-tooling task, out of scope here.

ALTER TABLE "enrollments" ADD COLUMN "booking_ref" text;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "agreed_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "payment_method_external" text;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "renewal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "admin_note" text;--> statement-breakpoint

-- Postgres unique indexes already treat every NULL as distinct from every
-- other NULL, so this behaves like Mongo's `unique: true, sparse: true` on
-- bookingRef with no extra partial-index predicate needed.
CREATE UNIQUE INDEX "enrollments_booking_ref_unique" ON "enrollments" USING btree ("booking_ref");--> statement-breakpoint

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_agreed_amount_non_negative" CHECK ("enrollments"."agreed_amount" IS NULL OR "enrollments"."agreed_amount" >= 0);--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_currency_format" CHECK ("enrollments"."currency" IS NULL OR "enrollments"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint

-- Widen the status allowlist: 'awaiting_payment'/'paid' are the two new
-- intermediate states (same vocabulary as models/Enrollment.js's Mongo
-- enum). Every existing row already satisfies this — it already had one of
-- the original 5 values — so no backfill/CHECK NOT VALID two-step is
-- needed.
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_status_allowlist";--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_status_allowlist" CHECK ("enrollments"."status" IN ('new','contacted','scheduled','awaiting_payment','paid','enrolled','cancelled'));--> statement-breakpoint

-- Mirrors backend/models/AdminUser.js's ROLE_PERMISSIONS.editor gaining
-- 'enrollments:write' (Booking-First Enrollment: an editor should be able
-- to run the Bookings tab's day-to-day status pipeline, just never touch
-- financial fields — that boundary is enforced in application code, not
-- RLS; see data/supabase/admin/enrollmentsAdminRoutes.js's
-- requireFinancialPermissionIfTouched). 0013_admin_rbac.sql's own seed
-- INSERT is never edited once published — this is a new, additive row.
INSERT INTO "role_permissions" ("role", "permission") VALUES ('editor', 'enrollments:write')
  ON CONFLICT ("role", "permission") DO NOTHING;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- submit_enrollment_booking(): the guest-submittable booking path.
--
-- enrollments_insert_public (0002_rls.sql) is column-restricted (excludes
-- booking_ref/status/id/created_at/updated_at) and anon/authenticated have
-- no SELECT grant on `enrollments` at all (0002_rls.sql's own documented
-- gap: a guest submission's RETURNING is unusable, same reason
-- createEnrollment's Supabase controller currently returns `id: null`).
-- Booking-First Enrollment needs the real booking_ref back in the 201
-- response (the frontend shows it and puts it in the WhatsApp message) —
-- widening the anon SELECT grant or adding an owner-read policy would leak
-- every guest's own row list to any other guest who can guess/enumerate
-- rows, so instead this is a narrow SECURITY DEFINER RPC that inserts the
-- row itself (bypassing RLS, like every other SECURITY DEFINER function in
-- this schema) and returns ONLY the generated booking_ref — never a row,
-- never an id, never any other guest's data.
--
-- This function is also the enforcement point for two more Booking-First
-- Enrollment requirements that the Mongo controller enforces in JS
-- (backend/controllers/enrollmentController.js): name/email/whatsapp are
-- required (whatsapp is how every booking gets followed up — there is no
-- other contact channel), and status is always forced to 'new' — mirroring
-- enrollments_insert_public's own WITH CHECK (status = 'new'), since this
-- function bypasses that policy entirely by virtue of being SECURITY
-- DEFINER. Its parameter list IS the allowlist: there is no way to pass a
-- status/agreedAmount/currency/paymentMethodExternal/paidAt/renewalAt/
-- adminNote through it at all, so mass-assignment is structurally
-- impossible here, not just filtered.
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
  -- Same E.164-ish shape as backend/utils/enrollmentValidation.js's
  -- normalizeWhatsapp() (optional leading +, 7-15 digits) — the caller
  -- (data/supabase/enrollmentController.js) normalizes/strips separators
  -- before calling this function, so this is a defense-in-depth re-check,
  -- not the only place the rule is enforced.
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
        p_teacher_name, p_plan_slug, p_notes, 'new', v_ref
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
