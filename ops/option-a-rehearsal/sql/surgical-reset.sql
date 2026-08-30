-- Option A — Surgical Reset
--
-- Replaces the Phase-2 "drop schema public cascade; create schema
-- public; ..." sequence. That sequence is no longer used: it drops and
-- recreates the `public` schema itself, which means its owner/ACL and
-- every `pg_default_acl` row for it must be reconstructed by hand
-- afterward (Phase 2's rehearsal used a broad
-- `alter default privileges ... grant all ... to anon, authenticated`
-- block to do that reconstruction — itself a separate, now-rejected
-- anti-pattern, see default-privileges-deny-by-default.sql) and it
-- relies on Postgres's CASCADE algorithm to discover what else depends
-- on `public` (which is how it reaches cross-schema objects like the
-- `auth.users` trigger and `rls_auto_enable_trigger` — correct in that
-- specific case, per docs/option-a-cascade-scope.md, but "correct by
-- accident of CASCADE's traversal" is not the same guarantee as
-- "explicitly named and reviewed").
--
-- This script instead:
--   - NEVER runs `drop schema public` or any statement targeting the
--     `public` schema itself.
--   - Drops ONLY the 34 explicitly-named old-application tables, the 3
--     explicitly-named old-application enums, and the explicitly-named
--     old handle_new_user()/on_auth_user_created (which
--     lib/db/drizzle/0001_functions_triggers.sql replaces idempotently
--     via CREATE OR REPLACE + DROP TRIGGER IF EXISTS/CREATE TRIGGER
--     anyway — dropped here too so this script's own post-condition
--     checks can assert a clean state without depending on migrate()
--     having already run).
--   - Never touches: the `public` schema itself (and therefore never
--     touches its owner, its ACL, or any `pg_default_acl` row for it —
--     those simply are not addressed by anything below, which is what
--     "preserved" means here); `rls_auto_enable()` and
--     `rls_auto_enable_trigger` (not named anywhere below); the `auth`
--     schema or `auth.users` itself (only a trigger ON auth.users is
--     dropped — the table, its rows, and every other trigger/policy on
--     it are untouched); any Supabase-managed role, extension, storage,
--     realtime, or vault object (none are named below).
--
-- Every statement is `IF EXISTS` so this script is safe to re-run
-- (e.g. against a database that's already been through migrate() once,
-- or a partially-reset one) — a no-op on the parts already gone rather
-- than an error.
--
-- Run only through scripts/03-surgical-reset.mjs, which enforces the
-- same localhost/127.0.0.1-only guard as run-migrate.mjs, and OWNS the
-- transaction boundary around this entire file plus its own before/
-- after fingerprint capture and post-condition checks — on the SAME
-- connection, in the SAME transaction, so a regression detected by the
-- wrapper's own checks means nothing was actually committed. (This
-- file used to wrap itself in begin/commit; a code review correctly
-- caught that the wrapper's after-fingerprint/comparison then ran
-- AFTER that commit had already landed — too late to prevent anything.
-- No `begin`/`commit` here anymore; the wrapper issues both.) The
-- wrapper also refuses to proceed if a dependent object outside the
-- named 34-table/3-enum list depends on any of them (a silent CASCADE
-- through an unexpected dependent is exactly what this design is
-- trying to avoid — surface it, don't drop through it).

-- ---------------------------------------------------------------------
-- 1. The old auth.users trigger + its function, named explicitly.
--    (Not strictly required before migrate() — 0001_functions_triggers.sql
--    replaces both idempotently — but the task requires the surgical
--    reset itself to remove them, and doing so lets this script assert
--    a clean post-condition independent of migrate() having run yet.)
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. The 34 named old-application tables. CASCADE is used per-table —
--    scoped to that one table's own dependents (FKs from the other 33
--    tables in this same named list, indexes/constraints/sequences it
--    owns) — never schema-wide. scripts/03-surgical-reset.mjs verifies
--    beforehand that no view/matview outside this list depends on any
--    of them, so CASCADE here has nothing surprising left to reach.
-- ---------------------------------------------------------------------
drop table if exists public.admin_lockouts cascade;
drop table if exists public.blogs cascade;
drop table if exists public.certificates cascade;
drop table if exists public.comments cascade;
drop table if exists public.contact_messages cascade;
drop table if exists public.coupon_redemptions cascade;
drop table if exists public.coupons cascade;
drop table if exists public.course_progress cascade;
drop table if exists public.courses cascade;
drop table if exists public.enrollments cascade;
drop table if exists public.hifz_progress cascade;
drop table if exists public.invoices cascade;
drop table if exists public.live_classes cascade;
drop table if exists public.manual_payments cascade;
drop table if exists public.messages cascade;
drop table if exists public.notifications cascade;
drop table if exists public.payments cascade;
drop table if exists public.post_likes cascade;
drop table if exists public.posts cascade;
drop table if exists public.profile_children cascade;
drop table if exists public.profiles cascade;
drop table if exists public.quran_bookmarks cascade;
drop table if exists public.quran_memorization_stats cascade;
drop table if exists public.quran_reading_progress cascade;
drop table if exists public.rate_limit_counters cascade;
drop table if exists public.referrals cascade;
drop table if exists public.reviews cascade;
drop table if exists public.student_records cascade;
drop table if exists public.subscribers cascade;
drop table if exists public.system_audit_log cascade;
drop table if exists public.system_config cascade;
drop table if exists public.trial_requests cascade;
drop table if exists public.tutor_conversations cascade;
drop table if exists public.wishlist_items cascade;

-- ---------------------------------------------------------------------
-- 3. The 3 named old-application enums. No CASCADE: every column that
--    used them was on one of the 34 tables just dropped, so this
--    should succeed as a plain DROP TYPE — if it doesn't, something
--    outside the named 34-table list still depends on one of these
--    types, which is exactly the kind of surprise this design wants
--    surfaced as a hard failure, not silently cascaded through.
--    (public.subscription_status collides by name with the NEW
--    schema's public.subscription_status enum, which has a different
--    value set — dropping the old one by name is required for
--    migration 0000's `CREATE TYPE "public"."subscription_status"` to
--    succeed.)
-- ---------------------------------------------------------------------
drop type if exists public.role;
drop type if exists public.subscription_provider;
drop type if exists public.subscription_status;
