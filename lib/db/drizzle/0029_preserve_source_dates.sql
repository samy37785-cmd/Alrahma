-- Adds the timestamp columns these five tables were missing, so the Mongo
-- migration can keep every source date (owner decision
-- DATES_MUST_BE_PRESERVED). The source documents carry these dates; the
-- tables had nowhere to put them:
--   trial_requests.updated_at
--   subscribers.updated_at
--   quran_bookmarks.updated_at
--   quran_reading_progress.created_at, quran_reading_progress.updated_at
--   quran_memorization_stats.created_at, quran_memorization_stats.updated_at
--
-- Existing rows are never stamped with the time this migration runs: each
-- column is added with no default (existing rows get NULL, meaning "not
-- known"), and only afterwards gets DEFAULT now(), which applies to rows
-- inserted from then on. ADD COLUMN ... DEFAULT now() in one statement
-- would instead fill every existing row with the migration's own
-- timestamp. The columns stay nullable for the same reason, and because a
-- source document can lack the date: the data migration writes NULL then,
-- never an invented value.
--
-- updated_at gets the same BEFORE UPDATE set_updated_at() trigger every
-- other table with an updated_at has (0001, 0015), so the app keeps it
-- current. The data migration restores the source value after its own
-- updates with lib/source-dates.mjs restoreSourceTimestamps().
--
-- Grants are unchanged. anon/authenticated INSERT on trial_requests and
-- subscribers is column-restricted (0004) and does not include the new
-- columns, so a guest form cannot set them; the quran tables' existing
-- owner-only table grants cover them like their other columns, and the
-- trigger overrides any updated_at an UPDATE sends.
--
-- Forward-only and additive: no existing column, row, constraint,
-- function or grant changes. IF NOT EXISTS / DROP TRIGGER IF EXISTS keep a
-- re-run a no-op.
ALTER TABLE "public"."trial_requests" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public"."trial_requests" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "public"."subscribers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public"."subscribers" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "public"."quran_bookmarks" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public"."quran_bookmarks" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "public"."quran_reading_progress" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public"."quran_reading_progress" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "public"."quran_reading_progress" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public"."quran_reading_progress" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "public"."quran_memorization_stats" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public"."quran_memorization_stats" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "public"."quran_memorization_stats" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public"."quran_memorization_stats" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
DROP TRIGGER IF EXISTS "trial_requests_set_updated_at" ON "public"."trial_requests";--> statement-breakpoint
CREATE TRIGGER "trial_requests_set_updated_at" BEFORE UPDATE ON "public"."trial_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "subscribers_set_updated_at" ON "public"."subscribers";--> statement-breakpoint
CREATE TRIGGER "subscribers_set_updated_at" BEFORE UPDATE ON "public"."subscribers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "quran_bookmarks_set_updated_at" ON "public"."quran_bookmarks";--> statement-breakpoint
CREATE TRIGGER "quran_bookmarks_set_updated_at" BEFORE UPDATE ON "public"."quran_bookmarks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "quran_reading_progress_set_updated_at" ON "public"."quran_reading_progress";--> statement-breakpoint
CREATE TRIGGER "quran_reading_progress_set_updated_at" BEFORE UPDATE ON "public"."quran_reading_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "quran_memorization_stats_set_updated_at" ON "public"."quran_memorization_stats";--> statement-breakpoint
CREATE TRIGGER "quran_memorization_stats_set_updated_at" BEFORE UPDATE ON "public"."quran_memorization_stats" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
