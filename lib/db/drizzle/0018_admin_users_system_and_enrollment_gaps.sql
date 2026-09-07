-- Al-Rahma Final Corrections (Part A, admin subrouter closure): schema/RPC
-- gaps found while porting the 7 remaining Mongo-only admin subrouters
-- (users, enrollments, blog, coupons, contact, referrals, system) to
-- DATA_BACKEND=supabase. blog/coupons/contact_messages/referrals already had
-- full admin AAL2 write policies (0002_rls.sql / 0015_new_domains_rls.sql) —
-- nothing new needed for those 4. The gaps closed here are real, additive
-- only, never touching a published migration:
--
--   1. "teacher"/"student"/"parent" are NOT distinct account_role values in
--      this schema (account_role is only 'user'/'admin' — see 0000's CREATE
--      TYPE) — being a teacher is purely relational (profiles.teacher_id
--      points AT a teacher; see is_teacher_of()/teacherController.js's own
--      documented role-model difference). Mongo's userAdminController.js
--      needs a real "is this account a teacher" marker to reproduce
--      listTeachers()/adminCreateUser(role:'teacher')/updateUserRole(role:
--      'teacher') — added as profiles.is_teacher below, a bespoke relational
--      marker in the same style as teacher_id/parent_link_code (0014), NOT a
--      widening of account_role (which stays the coarse admin/user gate).
--   2. profiles has no direct UPDATE grant to authenticated at all (writes
--      are exclusively through narrow SECURITY DEFINER RPCs, per 0002's own
--      documented design) — assignTeacher/setFamilyName/the new teacher-flag
--      toggle each need their own RPC, mirroring admin_set_role()'s pattern.
--   3. enrollments has no admin INSERT path: enrollments_insert_public
--      (0002_rls.sql) is anon/authenticated-facing and its WITH CHECK forces
--      status = 'new', and its GRANT is column-restricted (excludes status/
--      id/created_at/updated_at). Mongo's admin POST /api/v1/admin/enrollments
--      can create a fully-specified record (any status). Added:
--      enrollments_insert_admin_aal2 (a second, admin-only PERMISSIVE INSERT
--      policy — Postgres ORs permissive policies together, so a non-admin
--      caller still cannot set status != 'new', staying exactly as
--      restrictive as before for them) + a full-column INSERT grant (merges
--      with, does not replace, the existing restricted one).
--   4. Mongo's updateUserSubscription admin action is a freeform override
--      (any admin with users:write can activate/renew/deactivate any plan,
--      no evidentiary link required). This schema's only existing "grant a
--      subscription with no live Stripe/PayPal event" RPC is
--      admin_activate_manual_subscription() (0006_subscription_integrity.sql),
--      which deliberately REQUIRES an approved manual_payments row as
--      evidence — a stricter, more auditable design than Mongo's, kept as-is
--      rather than weakened. The one genuinely missing piece is a pure
--      deactivation RPC with no payment involved at all (Mongo's
--      action:'deactivate') — added below as admin_deactivate_subscription().
--      "activate"/"renew" without a manual_payments row is intentionally NOT
--      given a bypass RPC here (see data/supabase/admin/usersAdminController.js's
--      updateUserSubscription for the resulting, honest 400 contract).

ALTER TABLE "profiles" ADD COLUMN "is_teacher" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- admin_set_teacher_flag(): the ONLY way to mark/unmark an account as a
-- teacher — AAL2 + users:write, audited, mirrors admin_set_role()'s pattern.
CREATE OR REPLACE FUNCTION "public"."admin_set_teacher_flag"(p_user_id uuid, p_is_teacher boolean)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  before_row public.profiles;
  after_row public.profiles;
begin
  if not (public.is_admin_aal2() and public.authorize('users:write')) then
    raise exception 'insufficient_privilege: AAL2 admin with users:write required' using errcode = '42501';
  end if;

  select * into before_row from public.profiles where id = p_user_id;
  if not found then
    raise exception 'admin_set_teacher_flag: no profiles row for %', p_user_id;
  end if;

  update public.profiles set is_teacher = p_is_teacher where id = p_user_id
  returning * into after_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after, severity)
  values (auth.uid(), 'user.teacher_flag.set', 'profiles', p_user_id::text,
          jsonb_build_object('is_teacher', before_row.is_teacher),
          jsonb_build_object('is_teacher', after_row.is_teacher), 'info');

  return after_row;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."admin_set_teacher_flag"(uuid, boolean) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."admin_set_teacher_flag"(uuid, boolean) TO authenticated;--> statement-breakpoint

-- admin_assign_teacher(): sets/clears a student's assigned teacher.
-- p_teacher_id = null unassigns (mirrors assignTeacher's teacherId null/''
-- branch). Validates the target actually has is_teacher = true, matching
-- the Mongo controller's "Selected user is not a teacher" 400 guard.
CREATE OR REPLACE FUNCTION "public"."admin_assign_teacher"(p_student_id uuid, p_teacher_id uuid)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  before_row public.profiles;
  after_row public.profiles;
begin
  if not (public.is_admin_aal2() and public.authorize('users:write')) then
    raise exception 'insufficient_privilege: AAL2 admin with users:write required' using errcode = '42501';
  end if;

  select * into before_row from public.profiles where id = p_student_id;
  if not found then
    raise exception 'admin_assign_teacher: no profiles row for %', p_student_id;
  end if;

  if p_teacher_id is not null and not exists (
    select 1 from public.profiles where id = p_teacher_id and is_teacher = true
  ) then
    raise exception 'not_a_teacher' using errcode = 'P0001';
  end if;

  update public.profiles set teacher_id = p_teacher_id where id = p_student_id
  returning * into after_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after, severity)
  values (auth.uid(), 'user.teacher.assign', 'profiles', p_student_id::text,
          jsonb_build_object('teacher_id', before_row.teacher_id),
          jsonb_build_object('teacher_id', after_row.teacher_id), 'info');

  return after_row;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."admin_assign_teacher"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."admin_assign_teacher"(uuid, uuid) TO authenticated;--> statement-breakpoint

-- admin_set_family_name(): mirrors setFamilyName's own trim-and-store
-- behavior (empty string allowed — the Express controller already trims).
CREATE OR REPLACE FUNCTION "public"."admin_set_family_name"(p_user_id uuid, p_family_name text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  before_row public.profiles;
  after_row public.profiles;
begin
  if not (public.is_admin_aal2() and public.authorize('users:write')) then
    raise exception 'insufficient_privilege: AAL2 admin with users:write required' using errcode = '42501';
  end if;

  select * into before_row from public.profiles where id = p_user_id;
  if not found then
    raise exception 'admin_set_family_name: no profiles row for %', p_user_id;
  end if;

  update public.profiles set family_name = p_family_name where id = p_user_id
  returning * into after_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after, severity)
  values (auth.uid(), 'user.family.update', 'profiles', p_user_id::text,
          jsonb_build_object('family_name', before_row.family_name),
          jsonb_build_object('family_name', after_row.family_name), 'info');

  return after_row;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."admin_set_family_name"(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."admin_set_family_name"(uuid, text) TO authenticated;--> statement-breakpoint

-- admin_update_profile(): the base PUT /:id route's generic field update
-- (name/email/specialization/bio/gender/languages/subjects — mirrors
-- USER_UPDATABLE_FIELDS in controllers/userAdminController.js, minus
-- familyName, which already has its own dedicated RPC above). profiles has
-- no UPDATE grant to authenticated at all (0002_rls.sql's own documented
-- design — "writes are exclusively through narrow SECURITY DEFINER RPCs")
-- so a raw client.query('UPDATE profiles ...') under withUserContext always
-- fails with a real permission-denied error — found via actually running
-- this RPC's caller against a real Postgres connection, not just reading
-- the RLS/grants (same "rehearsal finds real bugs" pattern as Part A's
-- other fixes). NULL parameters leave the existing value unchanged
-- (COALESCE), matching the Express layer's own "only send fields you want
-- to change" contract.
CREATE OR REPLACE FUNCTION "public"."admin_update_profile"(
  p_user_id uuid, p_name text, p_email text, p_family_name text, p_specialization text, p_bio text,
  p_gender text, p_languages jsonb, p_subjects jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  before_row public.profiles;
  after_row public.profiles;
begin
  if not (public.is_admin_aal2() and public.authorize('users:write')) then
    raise exception 'insufficient_privilege: AAL2 admin with users:write required' using errcode = '42501';
  end if;

  select * into before_row from public.profiles where id = p_user_id;
  if not found then
    raise exception 'admin_update_profile: no profiles row for %', p_user_id;
  end if;

  update public.profiles set
    name = coalesce(p_name, name),
    email = coalesce(p_email, email),
    family_name = coalesce(p_family_name, family_name),
    specialization = coalesce(p_specialization, specialization),
    bio = coalesce(p_bio, bio),
    gender = coalesce(p_gender, gender),
    languages = coalesce(p_languages, languages),
    subjects = coalesce(p_subjects, subjects)
  where id = p_user_id
  returning * into after_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after, severity)
  values (auth.uid(), 'user.update', 'profiles', p_user_id::text, to_jsonb(before_row), to_jsonb(after_row), 'info');

  return after_row;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."admin_update_profile"(uuid, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."admin_update_profile"(uuid, text, text, text, text, text, text, jsonb, jsonb) TO authenticated;--> statement-breakpoint

-- admin_deactivate_subscription(): the one piece of Mongo's freeform
-- updateUserSubscription that has no evidentiary-link requirement to route
-- around (deactivation needs no proof — it only ever narrows access).
-- active/past_due -> canceled are both allowed transitions
-- (enforce_subscription_transition(), 0006/0010) so this never fights that
-- trigger regardless of which of the two the row is currently in.
CREATE OR REPLACE FUNCTION "public"."admin_deactivate_subscription"(p_user_id uuid)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  after_row public.subscriptions;
begin
  if not (public.is_admin_aal2() and public.authorize('users:write')) then
    raise exception 'insufficient_privilege: AAL2 admin with users:write required' using errcode = '42501';
  end if;

  update public.subscriptions
  set status = 'canceled', canceled_at = now(), updated_at = now()
  where user_id = p_user_id and status in ('active', 'past_due')
  returning * into after_row;

  if after_row.id is null then
    raise exception 'no_active_subscription' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after, severity)
  values (auth.uid(), 'user.subscription.deactivate', 'subscriptions', after_row.id::text,
          jsonb_build_object('status', 'active_or_past_due'),
          jsonb_build_object('status', after_row.status), 'warning');

  return after_row;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."admin_deactivate_subscription"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."admin_deactivate_subscription"(uuid) TO authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- enrollments: admin-authored rows (any status, not just 'new').
-- ---------------------------------------------------------------------
CREATE POLICY "enrollments_insert_admin_aal2" ON "enrollments" FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_aal2() AND public.authorize('enrollments:write'));--> statement-breakpoint
-- Additive: merges with (does not replace) enrollments_insert_public's
-- existing column-restricted grant — a non-admin authenticated caller still
-- cannot supply status/id/created_at/updated_at, since doing so would only
-- ever satisfy enrollments_insert_admin_aal2's WITH CHECK if they are
-- genuinely an AAL2 admin with enrollments:write.
GRANT INSERT ON "enrollments" TO authenticated;--> statement-breakpoint
