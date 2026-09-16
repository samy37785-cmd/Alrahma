-- Auth hardening security batch (item 6c): reviews_insert_own previously
-- only checked `student_id = auth.uid() AND status = 'pending'` — any
-- authenticated user could submit a review against ANY course_id/teacher_id,
-- with no relationship to it at all (the app-layer fix in
-- backend/data/supabase/reviewController.js's createReview now checks this
-- too, but Mongo has no RLS equivalent and defense-in-depth means the
-- database itself should not rely solely on the app layer getting it right).
--
-- Confirmed relational signals (see backend/controllers/reviewController.js's
-- own comment, verified directly against the schema): Enrollment/enrollments
-- has no course/teacher reference at all under the booking-first schema, so
-- it cannot be used here. course_progress ({user_id, course_id}, RLS-owned
-- by the row's own user_id) is the only real signal linking a student to a
-- specific course; profiles.teacher_id (via the existing my_teacher_id()
-- SECURITY DEFINER helper from 0015_new_domains_rls.sql) is the only signal
-- linking a student to their assigned teacher.
--
-- The EXISTS subquery against course_progress needs no SECURITY DEFINER
-- wrapper (unlike my_teacher_id()/is_teacher_of()) — it is not querying the
-- same table the policy is attached to (no recursion), and the inserting
-- user always has SELECT on their own course_progress row via
-- course_progress_owner_all (0015_new_domains_rls.sql), which is exactly the
-- row this check needs to read (user_id = auth.uid(), same as student_id
-- here).
--
-- The controller only ever inserts course_id XOR teacher_id (never both,
-- never neither — reviews.course_id/teacher_id are both nullable single-FK
-- columns and the controller nulls out the other one at insert time), so the
-- WITH CHECK below mirrors that same shape rather than just OR-ing the two
-- relationship checks together, closing a would-be gap where a caller sets
-- both columns to smuggle a valid teacher_id alongside an unrelated
-- course_id (or vice versa).
DROP POLICY "reviews_insert_own" ON "reviews";--> statement-breakpoint
CREATE POLICY "reviews_insert_own" ON "reviews" FOR INSERT TO authenticated WITH CHECK (
  student_id = auth.uid() AND status = 'pending' AND (
    (
      course_id IS NOT NULL AND teacher_id IS NULL AND EXISTS (
        SELECT 1 FROM public.course_progress
        WHERE user_id = auth.uid() AND course_id = reviews.course_id
      )
    )
    OR
    (
      teacher_id IS NOT NULL AND course_id IS NULL AND public.my_teacher_id() = teacher_id
    )
  )
);--> statement-breakpoint
