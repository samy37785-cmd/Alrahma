-- Al-Rahma Final Corrections (Part A): closes two named gaps left open by
-- Stage 2F (0012-0015, already merged/rehearsed) — deliberately a NEW
-- migration rather than editing 0012-0015, per this engagement's standing
-- "never edit a migration that's already been applied/rehearsed" rule.
--
-- 1. Parent<->child account linking. profiles.parent_link_code (0014) has
--    existed since Stage 2F but nothing ever read or wrote it — there was no
--    table recording which parent is linked to which student, so
--    data/supabase/parentController.js's 4 handlers were explicit 501s. This
--    adds that table plus the RPC/helper functions needed to link, read, and
--    unlink, following the exact is_teacher_of()/my_teacher_id() SECURITY
--    DEFINER pattern 0015 already established for the equivalent
--    teacher<->student relationship.
--
-- 2. A safe, PII-free way for an anonymous visitor to see a review author's
--    display name. Stage 2F's rehearsal found `anon` has zero GRANT on
--    `profiles` at all (a hard permission error, not just an RLS filter), so
--    getTeacherReviews/getCourseReviews could only ever return
--    `student: { name: null }` publicly. reviews_public below is a VIEW,
--    which in Postgres runs with the VIEW OWNER's privileges against its
--    underlying tables by default (no `security_invoker`) — so granting
--    `anon` SELECT on this view exposes only the two columns it selects
--    (id, name), never email/phone or any other profiles column, and never
--    a blanket profiles GRANT.

-- ---------------------------------------------------------------------
-- parent_student_links
-- ---------------------------------------------------------------------
CREATE TABLE "parent_student_links" (
	"parent_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_student_links_pk" PRIMARY KEY("parent_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "parent_student_links" ADD CONSTRAINT "parent_student_links_parent_id_profiles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_student_links" ADD CONSTRAINT "parent_student_links_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parent_student_links_student_id_idx" ON "parent_student_links" ("student_id");--> statement-breakpoint

ALTER TABLE "parent_student_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Mirrors is_teacher_of(): SECURITY DEFINER so it can be used inside OTHER
-- tables' RLS policies (student_records/hifz_progress/course_progress/
-- profiles below) without those policies subquerying parent_student_links
-- under the CALLER's own (possibly more restrictive) privileges.
CREATE OR REPLACE FUNCTION "public"."is_parent_of"(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  select exists (
    select 1 from public.parent_student_links
     where parent_id = auth.uid() and student_id = p_student_id
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."is_parent_of"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."is_parent_of"(uuid) TO authenticated;--> statement-breakpoint

CREATE POLICY "parent_student_links_select_own" ON "parent_student_links" FOR SELECT TO authenticated USING (parent_id = auth.uid());--> statement-breakpoint
CREATE POLICY "parent_student_links_delete_own" ON "parent_student_links" FOR DELETE TO authenticated USING (parent_id = auth.uid());--> statement-breakpoint
-- No raw INSERT policy — link_child_by_code() is the only path (needs the
-- code lookup + uniqueness check to happen atomically, same reasoning as
-- issue_certificate()/track_referral() being RPC-only).
REVOKE ALL ON "parent_student_links" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, DELETE ON "parent_student_links" TO authenticated;--> statement-breakpoint
GRANT ALL ON "parent_student_links" TO service_role;--> statement-breakpoint

-- Lazily generates and persists a student's own share code, mirroring
-- ensure_referral_code()'s exact pattern (0015) — profiles.parent_link_code
-- has existed since 0014 but nothing ever populated it.
CREATE OR REPLACE FUNCTION "public"."ensure_parent_link_code"()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_code text;
begin
  select parent_link_code into v_code from public.profiles where id = auth.uid();
  if v_code is not null then
    return v_code;
  end if;

  v_code := upper(right(auth.uid()::text, 8));
  update public.profiles set parent_link_code = v_code where id = auth.uid();
  return v_code;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."ensure_parent_link_code"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."ensure_parent_link_code"() TO authenticated;--> statement-breakpoint

-- Links the CALLER (as parent) to the student who owns p_code. Atomic
-- lookup + insert, so two concurrent link attempts on the same code can't
-- race past the "already linked" check the way two separate statements
-- from application code could.
CREATE OR REPLACE FUNCTION "public"."link_child_by_code"(p_code text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_student public.profiles;
begin
  select * into v_student from public.profiles where parent_link_code = upper(trim(p_code));
  if v_student.id is null then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;
  if v_student.id = auth.uid() then
    raise exception 'cannot_link_self' using errcode = '22023';
  end if;

  insert into public.parent_student_links (parent_id, student_id)
  values (auth.uid(), v_student.id)
  on conflict (parent_id, student_id) do nothing;

  if not found then
    raise exception 'already_linked' using errcode = '23505';
  end if;

  return v_student;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."link_child_by_code"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."link_child_by_code"(text) TO authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Parent read-visibility: additive SELECT policies on the tables a parent
-- dashboard needs (profiles/student_records/hifz_progress/course_progress),
-- exactly the same "additive, narrowly-scoped widening" pattern
-- profiles_select_own_students/profiles_select_own_teacher used in 0015.
-- Each existing policy on these tables is untouched.
-- ---------------------------------------------------------------------
CREATE POLICY "profiles_select_own_children" ON "profiles" FOR SELECT TO authenticated USING (public.is_parent_of(id));--> statement-breakpoint
CREATE POLICY "student_records_select_parent" ON "student_records" FOR SELECT TO authenticated USING (public.is_parent_of(student_id));--> statement-breakpoint
CREATE POLICY "hifz_progress_select_parent" ON "hifz_progress" FOR SELECT TO authenticated USING (public.is_parent_of(user_id));--> statement-breakpoint
CREATE POLICY "course_progress_select_parent" ON "course_progress" FOR SELECT TO authenticated USING (public.is_parent_of(user_id));--> statement-breakpoint

-- ---------------------------------------------------------------------
-- reviews_public: safe, PII-free author name for anonymous review listings.
-- ---------------------------------------------------------------------
CREATE VIEW "public"."reviews_public" AS
  SELECT r.id, r.student_id, p.name AS student_name, r.teacher_id, r.course_id,
         r.rating, r.title, r.body, r.status, r.helpful, r.created_at
    FROM public.reviews r
    JOIN public.profiles p ON p.id = r.student_id
   WHERE r.status = 'approved';
--> statement-breakpoint
GRANT SELECT ON "public"."reviews_public" TO anon, authenticated;--> statement-breakpoint
