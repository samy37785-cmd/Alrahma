-- Al-Rahma Final Corrections (Part A, route-parity sweep): /api/search is a
-- fully public route (no `protect` at all — see backend/routes/searchRoutes.js
-- / backend/app.js) that Stage 2F never gave a Supabase adapter, discovered
-- only by auditing every mounted route in app.js rather than trusting the
-- "28 domains" list (exactly the audit the task asked for). Its Mongo
-- implementation (controllers/searchController.js) queries `User.find({role:
-- 'teacher', ...})` directly with a public, unauthenticated caller — but
-- `profiles` has no anon/public SELECT policy at all (profiles_select_own_or_
-- admin, 0002_rls.sql, only ever allows a caller's own row or an admin's).
-- Same pattern as reviews_public (0016): a narrow, PII-free VIEW is the
-- RLS-legitimate way to expose a public teacher directory, never a blanket
-- profiles GRANT to anon.
CREATE VIEW "public"."teachers_public" AS
  SELECT id, name, specialization, bio, gender, languages, subjects
    FROM public.profiles
   WHERE is_teacher = true;
--> statement-breakpoint
GRANT SELECT ON "public"."teachers_public" TO anon, authenticated;--> statement-breakpoint
