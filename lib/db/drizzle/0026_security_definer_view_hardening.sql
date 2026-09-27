-- Supabase Security Advisor CRITICAL findings ("Security Definer View"),
-- confirmed live on the real project (Advisors > Security, 2026-09-27):
-- public.reviews_public and public.teachers_public were both created
-- (0016, 0019) as plain `CREATE VIEW` with no `security_invoker` option,
-- so Postgres runs them with the VIEW OWNER's privileges against their
-- underlying tables rather than the querying role's.
--
-- A naive fix (`ALTER VIEW ... SET (security_invoker = on);` alone) would
-- BREAK both views for `anon`: 0016's own comment states plainly that
-- "anon has zero GRANT on profiles at all" — under invoker semantics the
-- querying role needs its own privileges against the underlying tables,
-- which today it does not have. The other naive fix, a blanket
-- `GRANT SELECT ON profiles TO anon`, would be far WORSE than the bug
-- being fixed: Postgres RLS is row-level, not column-level, so it would
-- let anon read EVERY column of any matching profiles row (email, phone,
-- parent_link_code, ...) — never exposed publicly before, and exactly
-- what 0016/0019 were written to avoid.
--
-- The fix below keeps the exact same public-facing exposure as today
-- (same rows, same columns, same anon/authenticated grantees) while
-- closing the actual advisor finding, using Postgres's column-level GRANT
-- (a distinct, narrower privilege than the table-level GRANTs used
-- elsewhere in this codebase) combined with two new, additive RLS
-- policies — no existing policy, grant, or view column list is touched:
--
--   profiles: anon/authenticated get SELECT on ONLY the columns either
--     view actually needs. `is_teacher` must be included even though
--     teachers_public never selects it, because the view's own WHERE
--     clause references it, and under invoker mode that WHERE clause
--     runs as the querying role, which needs read privilege on any
--     column it references, not just the ones in the SELECT list.
--
--   reviews: already has anon SELECT (table-level, 0015) plus an
--     existing permissive policy covering status = 'approved'
--     (reviews_select_approved_own_or_admin) — nothing to add here, the
--     view's `reviews` half already works correctly under invoker mode.
--
-- security_barrier is set alongside security_invoker on both views: with
-- security_invoker alone, Postgres's planner is still free to push a
-- user-supplied predicate (e.g. `select * from reviews_public where
-- some_leaky_function(body)`) below the view's own internal
-- status = 'approved' filter for optimization, which could let a
-- crafted immutable function infer values from rows that were never
-- meant to be visible. security_barrier disables that reordering.
--
-- Verified empirically against a disposable local Postgres via this
-- project's own lib/db/test/orchestrate-db-tests.mjs (not merely reasoned
-- about) — see rls.local.test.mjs's "0026 security definer view
-- hardening" block for the exact assertions this migration must keep
-- passing: both views keep returning identical rows/columns to anon as
-- before, both views' security_invoker reloption is confirmed set, and
-- anon still cannot read any profiles column outside this narrow grant
-- (e.g. email) either directly or through either view.
--
-- NOT applied to the real Supabase project by this PR — proposed for
-- review only, per this engagement's standing rule that only the project
-- owner runs anything against production.

GRANT SELECT (id, name, specialization, bio, gender, languages, subjects, is_teacher) ON "profiles" TO anon, authenticated;--> statement-breakpoint

CREATE POLICY "profiles_select_public_teacher_columns" ON "profiles"
  FOR SELECT TO anon, authenticated
  USING (is_teacher = true);--> statement-breakpoint

CREATE POLICY "profiles_select_public_reviewer_name" ON "profiles"
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM "reviews" r WHERE r.student_id = "profiles".id AND r.status = 'approved'
  ));--> statement-breakpoint

ALTER VIEW "public"."reviews_public" SET (security_invoker = on, security_barrier = on);--> statement-breakpoint
ALTER VIEW "public"."teachers_public" SET (security_invoker = on, security_barrier = on);--> statement-breakpoint
