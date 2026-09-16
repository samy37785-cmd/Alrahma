-- Corrective revision (see docs/current-project-status.md): an independent
-- review found that Postgres's enrollments_status_allowlist CHECK
-- constraint (last widened by 0025_booking_first_enrollment.sql) and the
-- shared JS admin-write allowlist both backends' admin PUT route enforces
-- (utils/enrollmentValidation.js's ENROLLMENT_STATUSES) had genuinely
-- diverged, not just in naming:
--
--   Postgres CHECK  : 'new','contacted','scheduled','awaiting_payment',
--                      'paid','enrolled','cancelled'
--   JS ENROLLMENT_STATUSES : 'pending','approved','enrolled','cancelled'
--
-- 'enrolled'/'cancelled' are the only values both sides ever agreed on.
-- Concretely, this meant an admin using the SAME status dropdown
-- (AdminBookingsTab.jsx) against DATA_BACKEND=supabase could select
-- "pending" or "approved" — both accepted by the JS-level validator, since
-- that's exactly what it's an allowlist of — and have the resulting
-- UPDATE fail with a raw Postgres check_violation instead of the clean 422
-- buildAdminUpdatePatch() is supposed to guarantee. It also meant
-- lib/drizzle/0028_admin_booking_activation.sql's admin_activate_
-- subscription_from_enrollment() (which claims a row via
-- `status not in ('enrolled','cancelled')`, the real Postgres allowlist,
-- not the JS one) was already written correctly against this divergence —
-- that RPC needs no change here.
--
-- Fix: widen the Postgres CHECK to a superset that ALSO accepts 'pending'
-- and 'approved' (additive, the same pattern 0025 itself already used when
-- it added 'awaiting_payment'/'paid' — no ALTER of any existing row, no
-- data migration, nothing destructive). This does not touch a single
-- existing row's value — every historical 'new'/'contacted'/'scheduled'/
-- 'awaiting_payment'/'paid' row is preserved exactly as it is, staying
-- fully readable and still a valid value at the database level, matching
-- the same "migration-safe, not a feature: no API can newly set them"
-- posture models/Enrollment.js already documents for the equivalent legacy
-- values on the Mongo side. ENROLLMENT_STATUSES itself (the JS allowlist)
-- is NOT widened to include the legacy Postgres-only values — they stay
-- exactly as un-settable-by-any-API as they already were; only the
-- database-level constraint is reconciled to match what the API layer has
-- always been willing to write.
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_status_allowlist";--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_status_allowlist" CHECK (
  "enrollments"."status" IN (
    'new', 'contacted', 'scheduled', 'awaiting_payment', 'paid',
    'pending', 'approved', 'enrolled', 'cancelled'
  )
);
