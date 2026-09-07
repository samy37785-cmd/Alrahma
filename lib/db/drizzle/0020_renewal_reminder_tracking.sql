-- Al-Rahma Final Corrections (Part A, route-parity sweep): /api/cron is
-- mounted unconditionally in app.js (no isSupabaseBackend() branch at all)
-- and controllers/cronController.js imports Mongoose models directly — a
-- second, previously-undocumented route-parity gap found by the same
-- app.js route-mount audit that found /api/search. sendRenewalReminders'
-- idempotency (never re-email the same billing period) relies on Mongo's
-- subscription.renewalReminderSentFor field, which has no Postgres
-- equivalent — added here as an additive column on subscriptions, same
-- semantics: records the current_period_end value we last emailed for.
ALTER TABLE "subscriptions" ADD COLUMN "renewal_reminder_sent_for" timestamp with time zone;--> statement-breakpoint
