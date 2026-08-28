-- Baseline remediation: this migration used to open with
-- `CREATE SCHEMA "auth"` and `CREATE TABLE "auth"."users" (...)` here
-- (drizzle-kit generate always emits them because src/schema/auth.ts
-- declares a pgTable stub for FK-typing purposes — verified: setting
-- `schemaFilter: ["public"]` in drizzle.config.ts does NOT suppress
-- this for `generate`, only for `introspect`/`push`). Both statements
-- were removed by hand: the real Supabase project already has `auth`/
-- `auth.users` (Supabase Auth owns them, this project never creates or
-- migrates them — see src/schema/auth.ts), so running them there would
-- fail outright with "already exists". For LOCAL testing, the test
-- harness (lib/db/test/run-migrations.mjs) creates an equivalent local-
-- only `auth.users` stub itself, BEFORE calling migrate() — this
-- migration now only ever contains `public`-schema objects.
CREATE TYPE "public"."account_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('EUR');--> statement-breakpoint
CREATE TYPE "public"."discount_scope" AS ENUM('first_payment_only', 'fixed_duration', 'forever');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."manual_payment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('payment_received', 'payment_failed', 'subscription_renewed', 'subscription_expiring', 'trial_status', 'admin_announcement', 'daily_reminder');--> statement-breakpoint
CREATE TYPE "public"."payment_gateway" AS ENUM('stripe', 'paypal', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('charge', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."provider_event_status" AS ENUM('pending', 'processing', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"before" jsonb,
	"after" jsonb,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"coupon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_coupon_id_user_id_pk" PRIMARY KEY("coupon_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"type" "coupon_type" NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"discount_scope" "discount_scope" NOT NULL,
	"discount_duration_cycles" integer,
	"max_uses" integer,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "coupons_value_positive" CHECK ("coupons"."value" > 0),
	CONSTRAINT "coupons_percent_value_max_100" CHECK ("coupons"."type" != 'percent' OR "coupons"."value" <= 100),
	CONSTRAINT "coupons_duration_cycles_consistency" CHECK (("coupons"."discount_scope" = 'fixed_duration' AND "coupons"."discount_duration_cycles" IS NOT NULL) OR ("coupons"."discount_scope" != 'fixed_duration' AND "coupons"."discount_duration_cycles" IS NULL)),
	CONSTRAINT "coupons_max_uses_positive" CHECK ("coupons"."max_uses" IS NULL OR "coupons"."max_uses" > 0),
	CONSTRAINT "coupons_duration_cycles_positive" CHECK ("coupons"."discount_duration_cycles" IS NULL OR "coupons"."discount_duration_cycles" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid,
	"payment_id" uuid,
	"customer_name_snapshot" text,
	"plan_name_snapshot" text,
	"amount_minor_snapshot" integer NOT NULL,
	"discount_minor_snapshot" integer DEFAULT 0 NOT NULL,
	"currency_snapshot" "currency_code" DEFAULT 'EUR' NOT NULL,
	"status" "invoice_status" DEFAULT 'paid' NOT NULL,
	"gateway_invoice_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid,
	"requested_plan_slug" text,
	"amount_minor" integer NOT NULL,
	"currency_snapshot" "currency_code" DEFAULT 'EUR' NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"notes" text,
	"status" "manual_payment_status" DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"reviewer_admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_payments_amount_minor_nonneg" CHECK ("manual_payments"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text NOT NULL,
	"excerpt" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author_name" text,
	"author_role" text,
	"author_image" text,
	"published" boolean DEFAULT false NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blogs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "blogs_published_requires_timestamp" CHECK (("blogs"."published" = false) OR ("blogs"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'subscribed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_status_allowlist" CHECK ("subscribers"."status" IN ('subscribed','unsubscribed'))
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_name" text NOT NULL,
	"author_role" text,
	"quote" text NOT NULL,
	"rating" integer,
	"context" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonials_rating_range" CHECK ("testimonials"."rating" IS NULL OR "testimonials"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "trial_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"course" text,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_requests_status_allowlist" CHECK ("trial_requests"."status" IN ('new','contacted','scheduled'))
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"whatsapp" text,
	"country" text,
	"city" text,
	"timezone" text,
	"times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lang" text,
	"level" text,
	"age_group" text,
	"gender_pref" text,
	"preferred_teacher_key" text,
	"preferred_teacher_name" text,
	"requested_plan_slug" text,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_times_is_array" CHECK (jsonb_typeof("enrollments"."times") = 'array'),
	CONSTRAINT "enrollments_subjects_is_array" CHECK (jsonb_typeof("enrollments"."subjects") = 'array'),
	CONSTRAINT "enrollments_name_len" CHECK (char_length("enrollments"."name") <= 255),
	CONSTRAINT "enrollments_email_len" CHECK (char_length("enrollments"."email") <= 255),
	CONSTRAINT "enrollments_notes_len" CHECK (char_length("enrollments"."notes") <= 4000),
	CONSTRAINT "enrollments_times_size" CHECK (pg_column_size("enrollments"."times") <= 8192),
	CONSTRAINT "enrollments_subjects_size" CHECK (pg_column_size("enrollments"."subjects") <= 8192),
	CONSTRAINT "enrollments_status_allowlist" CHECK ("enrollments"."status" IN ('new','contacted','scheduled','enrolled','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "account_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quran_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"verse_key" text NOT NULL,
	"chapter_id" integer NOT NULL,
	"verse_num" integer NOT NULL,
	"note" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quran_memorization_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"goal" integer,
	"total_recordings" integer DEFAULT 0 NOT NULL,
	"total_practice_time" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quran_reading_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"resume" jsonb,
	"goal" integer,
	"streak" integer DEFAULT 0 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" "currency_code" DEFAULT 'EUR' NOT NULL,
	"billing_interval" text,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"paypal_plan_id" text,
	"sessions_per_week" integer,
	"sessions_per_month" integer,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug"),
	CONSTRAINT "plans_amount_minor_nonneg" CHECK ("plans"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid,
	"provider" "payment_gateway" NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"status" "subscription_status" NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"plan_id" uuid,
	"kind" "payment_kind" DEFAULT 'charge' NOT NULL,
	"parent_payment_id" uuid,
	"amount_minor" integer NOT NULL,
	"plan_amount_minor_snapshot" integer,
	"discount_minor_snapshot" integer DEFAULT 0 NOT NULL,
	"currency_snapshot" "currency_code" DEFAULT 'EUR' NOT NULL,
	"provider_price_id_snapshot" text,
	"gateway" "payment_gateway" NOT NULL,
	"gateway_payment_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"gateway_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_kind_parent_consistency" CHECK (("payments"."kind" = 'charge' AND "payments"."parent_payment_id" IS NULL) OR ("payments"."kind" = 'refund' AND "payments"."parent_payment_id" IS NOT NULL)),
	CONSTRAINT "payments_amount_minor_nonneg" CHECK ("payments"."amount_minor" >= 0),
	CONSTRAINT "payments_amount_reconciles_to_plan_snapshot" CHECK (("payments"."kind" = 'refund') OR ("payments"."plan_amount_minor_snapshot" IS NULL) OR ("payments"."amount_minor" = "payments"."plan_amount_minor_snapshot" - "payments"."discount_minor_snapshot"))
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "payment_gateway" NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload_summary" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_status" "provider_event_status" DEFAULT 'pending' NOT NULL,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"daily_reminder_enabled" boolean DEFAULT false NOT NULL,
	"daily_reminder_time" time,
	"timezone" text,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_language_allowlist" CHECK ("notification_preferences"."language" IS NULL OR "notification_preferences"."language" IN ('en','ar','it','es','de','fr'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"meta" jsonb,
	"scheduled_for" timestamp with time zone,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_admin_id_profiles_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_reviewer_admin_id_profiles_id_fk" FOREIGN KEY ("reviewer_admin_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_bookmarks" ADD CONSTRAINT "quran_bookmarks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_memorization_stats" ADD CONSTRAINT "quran_memorization_stats_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_reading_progress" ADD CONSTRAINT "quran_reading_progress_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_parent_payment_id_payments_id_fk" FOREIGN KEY ("parent_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_admin_id_idx" ON "admin_audit_log" USING btree ("actor_admin_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_id_idx" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_upper_unique" ON "coupons" USING btree (upper("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_gateway_invoice_id_unique" ON "invoices" USING btree ("gateway_invoice_id") WHERE "invoices"."gateway_invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_user_id_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "manual_payments_user_id_idx" ON "manual_payments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_email_lower_unique" ON "subscribers" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_lower_unique" ON "profiles" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "quran_bookmarks_user_verse_unique" ON "quran_bookmarks" USING btree ("user_id","verse_key");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_stripe_price_id_unique" ON "plans" USING btree ("stripe_price_id") WHERE "plans"."stripe_price_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_paypal_plan_id_unique" ON "plans" USING btree ("paypal_plan_id") WHERE "plans"."paypal_plan_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_unique" ON "subscriptions" USING btree ("provider_subscription_id") WHERE "subscriptions"."provider_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_active_per_user" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_payment_id_unique" ON "payments" USING btree ("gateway","gateway_payment_id") WHERE "payments"."gateway_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_user_id_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_provider_event_unique" ON "provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_unique" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");