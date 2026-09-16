-- Full production cutover, Phase 0 item 5: closes the documented Supabase-
-- mode session-invalidation gap for real (backend/config/validateEnv.js's
-- SUPABASE_SESSION_INVALIDATION_GAP_ACKNOWLEDGED production gate; see that
-- file's own comment for the full history). Under Mongo, a password
-- change/reset bumps User.tokenVersion, and every request's JWT carries the
-- version it was issued under (`v` claim, utils/authCookie.js) —
-- middleware/auth.js's protect() rejects a token whose `v` no longer
-- matches the current value, so a stolen/leaked session token stops
-- working the moment the real owner changes their password. Postgres
-- `profiles` had no equivalent column at all, so data/supabase/loadUser.js
-- hardcoded `tokenVersion: 0` and the comparison in protect() always
-- matched — every previously-issued session under DATA_BACKEND=supabase
-- silently kept working forever, even after a password reset.
--
-- This migration adds the column and the one owner-only RPC that can bump
-- it (profiles has no general UPDATE policy at all — see
-- update_own_profile_name()'s own comment in 0002_rls.sql for why: a raw
-- column-privilege UPDATE grant on profiles would also expose the `role`
-- column to self-promotion, so every profiles write goes through a
-- narrowly-scoped SECURITY DEFINER RPC instead). No other file in this
-- migration changes — backend/data/supabase/authController.js (calls the
-- new RPC from updateMe()/resetPassword()) and loadUser.js (reads the real
-- column instead of hardcoding 0) are application-code changes, not schema.
--
-- Purely additive: new nullable-free column with a DEFAULT, so every
-- existing profiles row is already valid; new function; no data touched.
ALTER TABLE "profiles" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0;--> statement-breakpoint

-- SETOF, not a single row — same reasoning as update_own_profile_name()
-- and mark_notification_read() (0002_rls.sql): a plain `RETURNS public.
-- profiles` always returns one (possibly all-NULL) row even when nothing
-- matched, and callers need "0 rows" to genuinely mean nothing happened.
CREATE OR REPLACE FUNCTION "public"."bump_token_version"()
RETURNS SETOF "public"."profiles"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'bump_token_version: no authenticated user';
  END IF;

  RETURN QUERY
  UPDATE "public"."profiles"
  SET "token_version" = "token_version" + 1
  WHERE "id" = auth.uid()
  RETURNING *;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."bump_token_version"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."bump_token_version"() TO authenticated;
