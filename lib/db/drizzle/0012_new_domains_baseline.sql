-- Stage 2F — new domain tables closing the 12 previously-missing Mongo
-- domains (see docs/option-a-mongo-supabase-parity-map.md's "Missing"
-- list). NOT yet applied to the real Supabase project — same discipline as
-- every prior migration in this folder: local/rehearsal only until an
-- explicit, separately-authorized cutover.
--
-- Design choice: Course modules/lessons are stored as a single `modules`
-- jsonb column on `courses` (mirroring Mongo's embedded moduleSchema/
-- lessonSchema subdocuments) rather than fully normalized into separate
-- tables. Mongo never queries into individual lessons independently of
-- their parent course — the whole document is always read/written as one
-- unit (see backend/controllers/courseController.js) — so normalizing here
-- would add join complexity with no real access-pattern benefit, and would
-- make the RLS/locking model (published/subscription-gated content) harder
-- to reason about than a single-row check.

CREATE TYPE "public"."live_class_status" AS ENUM('scheduled', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused', 'unmarked');--> statement-breakpoint
CREATE TYPE "public"."certificate_type" AS ENUM('ijazah', 'completion', 'hifz', 'attendance');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'converted', 'rewarded', 'expired');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('new', 'in_progress', 'resolved', 'spam');--> statement-breakpoint
CREATE TYPE "public"."course_level" AS ENUM('Beginner', 'Intermediate', 'Advanced', 'All levels');--> statement-breakpoint

-- ---------------------------------------------------------------------
-- courses / course_progress
-- ---------------------------------------------------------------------
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"icon" text DEFAULT '📘' NOT NULL,
	"level" "course_level" DEFAULT 'All levels' NOT NULL,
	"price_minor" integer DEFAULT 0 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_price_minor_nonneg" CHECK ("courses"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "course_progress" (
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_progress_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- live_classes
-- ---------------------------------------------------------------------
CREATE TABLE "live_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"meeting_url" text,
	"notes" text,
	"status" "live_class_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_classes_duration_range" CHECK ("live_classes"."duration_min" BETWEEN 5 AND 240)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- messages (student <-> assigned teacher DMs only, enforced in RLS via
-- profiles.teacher_id — see 0015_close_partial_gaps.sql for that column
-- and can_message() in 0013)
-- ---------------------------------------------------------------------
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_length" CHECK (char_length("messages"."body") <= 4000)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- student_records (teacher grading/attendance notes)
-- ---------------------------------------------------------------------
CREATE TABLE "student_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"course_id" uuid,
	"record_date" timestamp with time zone DEFAULT now() NOT NULL,
	"grade" integer,
	"grade_label" text,
	"attendance" "attendance_status" DEFAULT 'unmarked' NOT NULL,
	"memo_from" text,
	"memo_to" text,
	"review" text,
	"tajweed" text,
	"homework" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_records_grade_range" CHECK ("student_records"."grade" IS NULL OR "student_records"."grade" BETWEEN 0 AND 100)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- hifz_progress (per-surah verse-range memorization — distinct from
-- quran_memorization_stats, which only tracks practice time/streaks)
-- ---------------------------------------------------------------------
CREATE TABLE "hifz_progress" (
	"user_id" uuid NOT NULL,
	"chapter_id" integer NOT NULL,
	"chapter_name" text,
	"total_verses" integer DEFAULT 0 NOT NULL,
	"memorized_verses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_revised" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hifz_progress_user_id_chapter_id_pk" PRIMARY KEY("user_id","chapter_id"),
	CONSTRAINT "hifz_progress_chapter_range" CHECK ("hifz_progress"."chapter_id" BETWEEN 1 AND 114)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Shared human-readable document numbering (CERT-YYYY-#### /
-- INV-YYYY-####), replacing Mongo's atomic Counter model. One row per
-- (scope, year); next_document_number() below does the atomic increment.
-- ---------------------------------------------------------------------
CREATE TABLE "document_counters" (
	"scope" text NOT NULL,
	"year" integer NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_counters_scope_year_pk" PRIMARY KEY("scope","year")
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"student_name" text NOT NULL,
	"type" "certificate_type" NOT NULL,
	"title" text NOT NULL,
	"course_id" uuid,
	"issued_by" text,
	"grade" text,
	"notes" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_certificate_number_unique" UNIQUE("certificate_number")
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid,
	"course_id" uuid,
	"rating" integer NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"helpful" integer DEFAULT 0 NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------------
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referee_id" uuid,
	"code" text NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"converted_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referrer_referee_unique" ON "referrals" ("referrer_id","referee_id") WHERE "referee_id" IS NOT NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- wishlists
-- ---------------------------------------------------------------------
CREATE TABLE "wishlists" (
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- contact_messages
-- ---------------------------------------------------------------------
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"subject" text,
	"message" text NOT NULL,
	"status" "contact_status" DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"admin_note" text,
	"replied_at" timestamp with time zone,
	"ip_anon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- system_config — key/value flags only (maintenance_mode,
-- financials_frozen). Mongo's AES-encrypted-value support is NOT
-- replicated: the only two keys ever actually set today are plain
-- booleans, not secrets — see docs/option-a-mongo-supabase-parity-map.md.
-- ---------------------------------------------------------------------
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign keys (added after all referenced tables exist).
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_user_id_profiles_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_to_user_id_profiles_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_records" ADD CONSTRAINT "student_records_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_records" ADD CONSTRAINT "student_records_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_records" ADD CONSTRAINT "student_records_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_progress" ADD CONSTRAINT "hifz_progress_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_profiles_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_profiles_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "live_classes_teacher_starts_idx" ON "live_classes" ("teacher_id","starts_at");--> statement-breakpoint
CREATE INDEX "live_classes_student_starts_idx" ON "live_classes" ("student_id","starts_at");--> statement-breakpoint
CREATE INDEX "messages_from_to_created_idx" ON "messages" ("from_user_id","to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "student_records_student_date_idx" ON "student_records" ("student_id","record_date");--> statement-breakpoint
CREATE INDEX "reviews_teacher_status_idx" ON "reviews" ("teacher_id","status");--> statement-breakpoint
CREATE INDEX "reviews_course_status_idx" ON "reviews" ("course_id","status");--> statement-breakpoint
CREATE INDEX "contact_messages_status_created_idx" ON "contact_messages" ("status","created_at");--> statement-breakpoint

-- ---------------------------------------------------------------------
-- next_document_number(): atomic CERT-YYYY-#### / INV-YYYY-#### style
-- numbering, replacing Mongo's Counter.nextSeq(). SECURITY DEFINER so it
-- can be granted narrowly (see 0013) without exposing document_counters
-- itself for direct writes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."next_document_number"(p_scope text, p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_year int := extract(year from now())::int;
  v_seq int;
begin
  insert into public.document_counters (scope, year, seq)
  values (p_scope, v_year, 1)
  on conflict (scope, year) do update set seq = public.document_counters.seq + 1
  returning seq into v_seq;

  return p_prefix || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;
