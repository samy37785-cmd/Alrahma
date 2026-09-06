-- Stage 2F — schema changes closing every field-level gap documented in
-- docs/option-a-mongo-supabase-parity-map.md (the Stage 2E findings).
-- Split from the RLS migration (0015) because several new-domain policies
-- (messages, referrals) depend on the profiles columns added here existing
-- first. NOT yet applied to the real Supabase project.

-- ---------------------------------------------------------------------
-- profiles: close the User/profiles gap (gamification, teacher-linking,
-- teacher-profile fields, referral code). Role stays a 2-value enum
-- (user/admin) — see 0013's admin_role_assignments for the finer-grained
-- role a human actually holds; profiles.role is unrelated to student vs.
-- teacher vs. parent, which was never really an "admin" concept and is
-- represented below by teacher_id/family_name instead.
-- ---------------------------------------------------------------------
ALTER TABLE "profiles" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_study_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "badges" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "parent_link_code" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "specialization" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "languages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "subjects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_referral_code_unique" UNIQUE("referral_code");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_parent_link_code_unique" UNIQUE("parent_link_code");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_teacher_id_idx" ON "profiles" ("teacher_id") WHERE "teacher_id" IS NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- invoices: invoice-number gap. Uses the same next_document_number()
-- counter certificates uses (0012), scoped separately ('invoice' vs
-- 'certificate' — each has its own year-sequence).
-- ---------------------------------------------------------------------
ALTER TABLE "invoices" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number");--> statement-breakpoint

-- ---------------------------------------------------------------------
-- coupons: plan-scoping + minimum-order gaps.
-- ---------------------------------------------------------------------
ALTER TABLE "coupons" ADD COLUMN "applicable_plan_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "min_order_minor" integer;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_min_order_minor_positive" CHECK ("coupons"."min_order_minor" IS NULL OR "coupons"."min_order_minor" > 0);--> statement-breakpoint

-- ---------------------------------------------------------------------
-- notifications: the 9 event types that exist in Mongo's NOTIFICATION_
-- TYPES enum but not in Postgres's notification_type (see Stage 2E's
-- parity map). ALTER TYPE ADD VALUE cannot run in the same transaction as
-- a statement that USES the new value — this migration only adds them,
-- nothing here or in this same file references them.
-- ---------------------------------------------------------------------
ALTER TYPE "public"."notification_type" ADD VALUE 'class_scheduled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'class_cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'class_reminder';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'message_received';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'enrollment_approved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'enrollment_rejected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'certificate_issued';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'coupon_received';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'review_approved';--> statement-breakpoint

-- ---------------------------------------------------------------------
-- admin_audit_log: severity gap.
-- ---------------------------------------------------------------------
ALTER TABLE "admin_audit_log" ADD COLUMN "severity" text DEFAULT 'info' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_severity_check" CHECK ("admin_audit_log"."severity" IN ('info', 'warning', 'critical'));--> statement-breakpoint

-- ---------------------------------------------------------------------
-- blogs: category/coverImage/readTime gaps.
-- ---------------------------------------------------------------------
ALTER TABLE "blogs" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "cover_image" text;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "read_time" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "canonical_url" text;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- plans: originalAmount/discountPct display-only gap.
-- ---------------------------------------------------------------------
ALTER TABLE "plans" ADD COLUMN "original_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "discount_pct" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_discount_pct_range" CHECK ("plans"."discount_pct" IS NULL OR "plans"."discount_pct" BETWEEN 0 AND 100);--> statement-breakpoint

-- Mirrors admin_update_plan_display()'s pattern (0008_plan_versioning.sql)
-- exactly — same AAL2 gate, same "only the two display-only marketing
-- fields are touched, never the immutable pricing columns" discipline.
CREATE OR REPLACE FUNCTION "public"."admin_update_plan_marketing"(p_plan_id uuid, p_original_amount_minor integer, p_discount_pct integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
begin
  if not public.is_admin_aal2() then
    raise exception 'insufficient_privilege: AAL2 required' using errcode = '42501';
  end if;

  update public.plans
     set original_amount_minor = p_original_amount_minor,
         discount_pct = p_discount_pct
   where id = p_plan_id;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, after, severity)
  values (auth.uid(), 'plan.marketing.update', 'plans', p_plan_id::text,
          jsonb_build_object('originalAmountMinor', p_original_amount_minor, 'discountPct', p_discount_pct), 'info');
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."admin_update_plan_marketing"(uuid, integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."admin_update_plan_marketing"(uuid, integer, integer) TO authenticated;
