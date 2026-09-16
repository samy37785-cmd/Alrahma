-- Scope correction follow-up (see docs/current-project-status.md): item 4
-- of the corrected booking spec requires that a failed booking-notification
-- email be "logged clearly with a retry/outbox mechanism if the current
-- architecture allows". Mongo-mode already has one (models/EmailOutbox.js +
-- controllers/cronController.js's retryFailedEmails, same GET /api/cron/*
-- CRON_SECRET-gated pattern as the pre-existing renewal-reminders/weekly-
-- parent-reports jobs) — this table is the Supabase-mode equivalent so the
-- same retry job (data/supabase/cronController.js) can run against either
-- backend.
--
-- service_role-only, matching migration_source_ledger's precedent
-- (0022_lossless_migration_support.sql): this is server bookkeeping, never
-- admin-UI- or end-user-facing, so RLS is enabled+forced with NO policy at
-- all — service_role reaches it via its own table GRANT below (its
-- BYPASSRLS role attribute is not itself a GRANT), and every other role is
-- denied at the GRANT layer, not merely filtered by a missing policy.
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_addresses" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "email_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON "email_outbox" FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_outbox" TO service_role;
