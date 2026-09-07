-- Stage 2F — RLS, triggers, and RPCs for the 12 new domain tables (0012),
-- plus the enrollments owner-read fix and the coupon-validate RPC from
-- Stage 2E's documented gaps. NOT yet applied to the real Supabase project.
--
-- Convention: RESTRICTIVE policies are reserved for the admin-RBAC tables
-- themselves (0013) as an extra defense-in-depth layer on the most
-- sensitive objects — the 12 tables below use plain PERMISSIVE policies,
-- matching the existing 20-table schema's own established style (which
-- never uses RESTRICTIVE anywhere in 0000-0011).

CREATE OR REPLACE FUNCTION "public"."is_teacher_of"(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  select exists (
    select 1 from public.profiles where id = p_student_id and teacher_id = auth.uid()
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."is_teacher_of"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."is_teacher_of"(uuid) TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."can_message"(p_from uuid, p_to uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Mirrors backend/controllers/messageController.js's canMessage(): only a
  -- student <-> their own assigned teacher pair may exchange messages.
  select exists (
    select 1 from public.profiles where id = p_from and teacher_id = p_to
  ) or exists (
    select 1 from public.profiles where id = p_to and teacher_id = p_from
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."can_message"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."can_message"(uuid, uuid) TO authenticated;--> statement-breakpoint

-- profiles_select_own_or_admin (0002_rls.sql) only ever allowed a caller to
-- see their OWN row or, if admin, every row — is_teacher_of()/can_message()
-- above are SECURITY DEFINER so they bypass that for their own internal
-- checks, but a teacher's own adapter code (data/supabase/teacherController.js,
-- data/supabase/messageController.js's getContacts) needs to run a plain
-- `SELECT ... FROM profiles WHERE teacher_id = auth.uid()`-style query
-- directly, which RLS would otherwise filter down to zero rows. Found by
-- actually running the Stage 2F rehearsal (rehearsal-api-tests-stage2f.mjs)
-- — POST /api/teacher/students/:id/records 404'd because the ownership
-- check's own SELECT returned nothing, not because the teacher relationship
-- was wrong. This policy is additive (profiles_select_own_or_admin still
-- applies) and only ever widens visibility to a teacher's own students, the
-- same relationship is_teacher_of() already authorizes for writes elsewhere.
CREATE POLICY "profiles_select_own_students" ON "profiles" FOR SELECT TO authenticated USING (teacher_id = auth.uid());--> statement-breakpoint

-- Mirror image of the above: a student needs to read their OWN assigned
-- teacher's profile row too (data/supabase/messageController.js's
-- getContacts looks up "my teacher" by id) — without this, a student could
-- message their teacher (can_message() is SECURITY DEFINER, unaffected) but
-- never discover who that teacher even is via a plain SELECT. A policy on
-- `profiles` cannot subquery `profiles` directly in its own USING clause —
-- Postgres raises "infinite recursion detected in policy for relation
-- profiles" (confirmed by actually running this locally) since evaluating
-- the subquery re-triggers RLS on the same table. my_teacher_id() sidesteps
-- this the same way is_teacher_of()/can_message() do: SECURITY DEFINER runs
-- its internal query with the function owner's privileges, bypassing RLS
-- for that one lookup instead of recursing into the caller's own policies.
CREATE OR REPLACE FUNCTION "public"."my_teacher_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  select teacher_id from public.profiles where id = auth.uid();
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."my_teacher_id"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."my_teacher_id"() TO authenticated;--> statement-breakpoint
CREATE POLICY "profiles_select_own_teacher" ON "profiles" FOR SELECT TO authenticated USING (id = public.my_teacher_id());--> statement-breakpoint

-- ---------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER "courses_set_updated_at" BEFORE UPDATE ON "courses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE POLICY "courses_select_published_or_admin" ON "courses" FOR SELECT TO anon, authenticated USING (published = true OR public.is_admin());--> statement-breakpoint
CREATE POLICY "courses_insert_admin_aal2" ON "courses" FOR INSERT TO authenticated WITH CHECK (public.is_admin_aal2() AND public.authorize('courses:write'));--> statement-breakpoint
CREATE POLICY "courses_update_admin_aal2" ON "courses" FOR UPDATE TO authenticated USING (public.is_admin_aal2() AND public.authorize('courses:write')) WITH CHECK (public.is_admin_aal2() AND public.authorize('courses:write'));--> statement-breakpoint
-- No DELETE policy — delete_course_cascade() (below) is the only path, so
-- the cross-table cleanup (course_progress/wishlists/certificates/reviews/
-- student_records references) can never be skipped by a raw delete.

CREATE OR REPLACE FUNCTION "public"."delete_course_cascade"(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
begin
  if not (public.is_admin_aal2() and public.authorize('courses:delete')) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  delete from public.course_progress where course_id = p_course_id;
  delete from public.wishlists where course_id = p_course_id;
  update public.certificates set course_id = null where course_id = p_course_id;
  update public.reviews set course_id = null where course_id = p_course_id;
  update public.student_records set course_id = null where course_id = p_course_id;
  delete from public.courses where id = p_course_id;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, severity)
  values (auth.uid(), 'course.delete_cascade', 'courses', p_course_id::text, 'warning');
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."delete_course_cascade"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."delete_course_cascade"(uuid) TO authenticated;--> statement-breakpoint
REVOKE ALL ON "courses" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT ON "courses" TO anon, authenticated;--> statement-breakpoint
GRANT INSERT, UPDATE ON "courses" TO authenticated;--> statement-breakpoint
GRANT ALL ON "courses" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- course_progress
-- ---------------------------------------------------------------------
ALTER TABLE "course_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "course_progress_owner_all" ON "course_progress" FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "course_progress_select_admin" ON "course_progress" FOR SELECT TO authenticated USING (public.is_admin());--> statement-breakpoint
REVOKE ALL ON "course_progress" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "course_progress" TO authenticated;--> statement-breakpoint
GRANT ALL ON "course_progress" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- live_classes
-- ---------------------------------------------------------------------
ALTER TABLE "live_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER "live_classes_set_updated_at" BEFORE UPDATE ON "live_classes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE POLICY "live_classes_select_participant_or_admin" ON "live_classes" FOR SELECT TO authenticated USING (teacher_id = auth.uid() OR student_id = auth.uid() OR public.is_admin());--> statement-breakpoint
CREATE POLICY "live_classes_insert_teacher_or_admin" ON "live_classes" FOR INSERT TO authenticated WITH CHECK ((teacher_id = auth.uid() AND public.is_teacher_of(student_id)) OR public.is_admin_aal2());--> statement-breakpoint
CREATE POLICY "live_classes_update_owner_or_admin" ON "live_classes" FOR UPDATE TO authenticated USING (teacher_id = auth.uid() OR public.is_admin_aal2()) WITH CHECK (teacher_id = auth.uid() OR public.is_admin_aal2());--> statement-breakpoint
CREATE POLICY "live_classes_delete_owner_or_admin" ON "live_classes" FOR DELETE TO authenticated USING (teacher_id = auth.uid() OR public.is_admin_aal2());--> statement-breakpoint
REVOKE ALL ON "live_classes" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "live_classes" TO authenticated;--> statement-breakpoint
GRANT ALL ON "live_classes" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_select_participant_or_admin" ON "messages" FOR SELECT TO authenticated USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR (public.is_admin_aal2() AND public.authorize('messages:read')));--> statement-breakpoint
CREATE POLICY "messages_insert_allowed_pair" ON "messages" FOR INSERT TO authenticated WITH CHECK (from_user_id = auth.uid() AND public.can_message(auth.uid(), to_user_id));--> statement-breakpoint
CREATE POLICY "messages_update_recipient_mark_read" ON "messages" FOR UPDATE TO authenticated USING (to_user_id = auth.uid()) WITH CHECK (to_user_id = auth.uid());--> statement-breakpoint
REVOKE ALL ON "messages" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "messages" TO authenticated;--> statement-breakpoint
GRANT ALL ON "messages" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- student_records
-- ---------------------------------------------------------------------
ALTER TABLE "student_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "student_records_select_participant_or_admin" ON "student_records" FOR SELECT TO authenticated USING (student_id = auth.uid() OR teacher_id = auth.uid() OR public.is_admin());--> statement-breakpoint
CREATE POLICY "student_records_insert_own_teacher_or_admin" ON "student_records" FOR INSERT TO authenticated WITH CHECK ((teacher_id = auth.uid() AND public.is_teacher_of(student_id)) OR public.is_admin_aal2());--> statement-breakpoint
CREATE POLICY "student_records_delete_own_teacher_or_admin" ON "student_records" FOR DELETE TO authenticated USING (teacher_id = auth.uid() OR public.is_admin_aal2());--> statement-breakpoint
REVOKE ALL ON "student_records" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "student_records" TO authenticated;--> statement-breakpoint
GRANT ALL ON "student_records" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- hifz_progress
-- ---------------------------------------------------------------------
ALTER TABLE "hifz_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hifz_progress_owner_all" ON "hifz_progress" FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "hifz_progress_select_admin" ON "hifz_progress" FOR SELECT TO authenticated USING (public.is_admin());--> statement-breakpoint
REVOKE ALL ON "hifz_progress" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "hifz_progress" TO authenticated;--> statement-breakpoint
GRANT ALL ON "hifz_progress" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "certificates_select_own_non_revoked_or_admin" ON "certificates" FOR SELECT TO authenticated USING ((user_id = auth.uid() AND revoked = false) OR public.is_admin());--> statement-breakpoint
REVOKE ALL ON "certificates" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT ON "certificates" TO authenticated;--> statement-breakpoint
GRANT ALL ON "certificates" TO service_role;--> statement-breakpoint
-- No raw INSERT/UPDATE policy — issuance/revocation are RPC-only (need the
-- shared counter + audit log written atomically together).

CREATE OR REPLACE FUNCTION "public"."issue_certificate"(p_user_id uuid, p_student_name text, p_type public.certificate_type, p_title text, p_course_id uuid, p_issued_by text, p_grade text, p_notes text)
RETURNS public.certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_row public.certificates;
begin
  if not (public.is_admin_aal2() and public.authorize('certificates:write')) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  insert into public.certificates (certificate_number, user_id, student_name, type, title, course_id, issued_by, grade, notes)
  values (public.next_document_number('certificate', 'CERT'), p_user_id, p_student_name, p_type, p_title, p_course_id, p_issued_by, p_grade, p_notes)
  returning * into v_row;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, after, severity)
  values (auth.uid(), 'certificate.issue', 'certificates', v_row.id::text, to_jsonb(v_row), 'info');

  return v_row;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."issue_certificate"(uuid, text, public.certificate_type, text, uuid, text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."issue_certificate"(uuid, text, public.certificate_type, text, uuid, text, text, text) TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."revoke_certificate"(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
begin
  if not (public.is_admin_aal2() and public.authorize('certificates:write')) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  update public.certificates set revoked = true where id = p_id;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, severity)
  values (auth.uid(), 'certificate.revoke', 'certificates', p_id::text, 'warning');
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."revoke_certificate"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."revoke_certificate"(uuid) TO authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER "reviews_set_updated_at" BEFORE UPDATE ON "reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint
CREATE POLICY "reviews_select_approved_own_or_admin" ON "reviews" FOR SELECT TO anon, authenticated USING (status = 'approved' OR student_id = auth.uid() OR public.is_admin());--> statement-breakpoint
CREATE POLICY "reviews_insert_own" ON "reviews" FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() AND status = 'pending');--> statement-breakpoint
CREATE POLICY "reviews_moderate_admin_aal2" ON "reviews" FOR UPDATE TO authenticated USING (public.is_admin_aal2() AND public.authorize('reviews:write')) WITH CHECK (public.is_admin_aal2() AND public.authorize('reviews:write'));--> statement-breakpoint
REVOKE ALL ON "reviews" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT ON "reviews" TO anon;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "reviews" TO authenticated;--> statement-breakpoint
GRANT ALL ON "reviews" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------------
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "referrals_select_own_or_admin" ON "referrals" FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR public.is_admin());--> statement-breakpoint
CREATE POLICY "referrals_convert_admin_aal2" ON "referrals" FOR UPDATE TO authenticated USING (public.is_admin_aal2() AND public.authorize('referrals:write')) WITH CHECK (public.is_admin_aal2() AND public.authorize('referrals:write'));--> statement-breakpoint
REVOKE ALL ON "referrals" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, UPDATE ON "referrals" TO authenticated;--> statement-breakpoint
GRANT ALL ON "referrals" TO service_role;--> statement-breakpoint

-- ensure_referral_code(): profiles.referral_code (0014_close_partial_gaps_
-- schema.sql) is nullable and nothing else in these migrations ever
-- populates it — track_referral() above only matches an existing code, so a
-- caller with no code yet could never be referred. profiles has no direct
-- UPDATE grant to `authenticated` (writes are exclusively through narrow
-- SECURITY DEFINER RPCs, see 0002_rls.sql), so this lazily generates and
-- persists one on first call, idempotent thereafter (returns the existing
-- code untouched on every subsequent call). Called by getMyReferrals() —
-- see data/supabase/referralController.js.
CREATE OR REPLACE FUNCTION "public"."ensure_referral_code"()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_code text;
begin
  select referral_code into v_code from public.profiles where id = auth.uid();
  if v_code is not null then
    return v_code;
  end if;

  -- Same derivation the Mongo controller's self-healing fallback used
  -- (last 8 chars of the user's own id, uppercased) — collisions across two
  -- different UUIDs' last-8-hex-chars are astronomically unlikely, and the
  -- unique constraint on profiles.referral_code makes any collision fail
  -- loudly (unique_violation) rather than silently cross-assign a code.
  v_code := upper(right(auth.uid()::text, 8));
  update public.profiles set referral_code = v_code where id = auth.uid();
  return v_code;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."ensure_referral_code"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."ensure_referral_code"() TO authenticated;--> statement-breakpoint

-- track_referral(): referee is always auth.uid() (security-hardened, same
-- reasoning as the Mongo controller's own fix — never body-supplied),
-- blocks self-referral, idempotent (returns the existing row on replay).
CREATE OR REPLACE FUNCTION "public"."track_referral"(p_code text)
RETURNS public.referrals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_referrer_id uuid;
  v_existing public.referrals;
  v_row public.referrals;
begin
  select id into v_referrer_id from public.profiles where referral_code = p_code;
  if v_referrer_id is null then
    raise exception 'unknown_referral_code' using errcode = 'P0001';
  end if;
  if v_referrer_id = auth.uid() then
    raise exception 'self_referral_not_allowed' using errcode = 'P0001';
  end if;

  select * into v_existing from public.referrals where referrer_id = v_referrer_id and referee_id = auth.uid();
  if found then
    return v_existing;
  end if;

  insert into public.referrals (referrer_id, referee_id, code)
  values (v_referrer_id, auth.uid(), p_code)
  returning * into v_row;

  return v_row;
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."track_referral"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."track_referral"(text) TO authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- wishlists
-- ---------------------------------------------------------------------
ALTER TABLE "wishlists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "wishlists_owner_all" ON "wishlists" FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());--> statement-breakpoint
REVOKE ALL ON "wishlists" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "wishlists" TO authenticated;--> statement-breakpoint
GRANT ALL ON "wishlists" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- contact_messages
-- ---------------------------------------------------------------------
ALTER TABLE "contact_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contact_messages_insert_public" ON "contact_messages" FOR INSERT TO anon, authenticated WITH CHECK (status = 'new' AND assigned_to IS NULL AND replied_at IS NULL);--> statement-breakpoint
CREATE POLICY "contact_messages_select_admin" ON "contact_messages" FOR SELECT TO authenticated USING (public.is_admin());--> statement-breakpoint
CREATE POLICY "contact_messages_update_admin_aal2" ON "contact_messages" FOR UPDATE TO authenticated USING (public.is_admin_aal2() AND public.authorize('contact:write')) WITH CHECK (public.is_admin_aal2() AND public.authorize('contact:write'));--> statement-breakpoint
REVOKE ALL ON "contact_messages" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT INSERT (name, email, phone, subject, message) ON "contact_messages" TO anon, authenticated;--> statement-breakpoint
GRANT SELECT, UPDATE ON "contact_messages" TO authenticated;--> statement-breakpoint
GRANT ALL ON "contact_messages" TO service_role;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- system_config
-- ---------------------------------------------------------------------
ALTER TABLE "system_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "system_config_select_admin" ON "system_config" FOR SELECT TO authenticated USING (public.is_admin());--> statement-breakpoint
REVOKE ALL ON "system_config" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT ON "system_config" TO authenticated;--> statement-breakpoint
GRANT ALL ON "system_config" TO service_role;--> statement-breakpoint
-- No raw write policy — system_config_set() is the only writer, matching
-- Mongo's SystemConfig.set() being reserved for super-admin-only actions
-- (toggleMaintenanceMode/toggleFinancialFreeze).

CREATE OR REPLACE FUNCTION "public"."system_config_set"(p_key text, p_value text, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
begin
  if not public.is_super_admin_aal2() then
    raise exception 'insufficient_privilege: super-admin AAL2 required' using errcode = '42501';
  end if;

  insert into public.system_config (key, value, description, updated_by)
  values (p_key, p_value, p_description, auth.uid())
  on conflict (key) do update set value = excluded.value, description = coalesce(excluded.description, public.system_config.description), updated_by = auth.uid(), updated_at = now();

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, after, severity)
  values (auth.uid(), 'system_config.set', 'system_config', p_key, jsonb_build_object('value', p_value), 'critical');
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."system_config_set"(text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."system_config_set"(text, text, text) TO authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Stage 2E gap closures that needed schema from this migration (or were
-- simply deferred here to keep all RLS changes in one reviewable file):
-- ---------------------------------------------------------------------

-- enrollments: owner-read gap (Stage 2E rehearsal finding — GET /mine
-- returned 0 rows for a real, non-admin caller). auth.jwt() carries the
-- authenticated user's email as a standard Supabase Auth claim.
CREATE POLICY "enrollments_select_own_by_email" ON "enrollments" FOR SELECT TO authenticated USING (email = (auth.jwt() ->> 'email'));--> statement-breakpoint

-- coupons: validate_coupon() closes the Stage 2E gap where a regular user
-- had no RLS-legitimate way to check a coupon's validity at checkout.
-- Returns only the fields checkout needs (never the raw row / usage list).
CREATE OR REPLACE FUNCTION "public"."validate_coupon"(p_code text, p_plan_id uuid, p_order_amount_minor integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_coupon public.coupons;
  v_already_used boolean;
begin
  select * into v_coupon from public.coupons where upper(code) = upper(p_code) and active = true;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if v_coupon.max_uses is not null then
    if (select count(*) from public.coupon_redemptions where coupon_id = v_coupon.id) >= v_coupon.max_uses then
      return jsonb_build_object('valid', false, 'reason', 'max_uses_reached');
    end if;
  end if;
  select exists(select 1 from public.coupon_redemptions where coupon_id = v_coupon.id and user_id = auth.uid()) into v_already_used;
  if v_already_used then
    return jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;
  if array_length(v_coupon.applicable_plan_ids, 1) is not null and not (p_plan_id = any(v_coupon.applicable_plan_ids)) then
    return jsonb_build_object('valid', false, 'reason', 'plan_not_eligible');
  end if;
  if v_coupon.min_order_minor is not null and p_order_amount_minor < v_coupon.min_order_minor then
    return jsonb_build_object('valid', false, 'reason', 'min_order_not_met');
  end if;

  return jsonb_build_object(
    'valid', true,
    'discountType', v_coupon.type,
    'discountValue', v_coupon.value,
    'discountScope', v_coupon.discount_scope
  );
end;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."validate_coupon"(text, uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."validate_coupon"(text, uuid, integer) TO authenticated;--> statement-breakpoint

-- issue_invoice_from_payment(): the ONLY change from the real, final
-- (post-0010) definition is adding invoice_number to the INSERT column/
-- value list via next_document_number() — every other line, variable name,
-- and the exact newly_created/audit-log gating is copied verbatim from
-- 0010_round4_integrity_fixes.sql so no existing invariant drifts.
CREATE OR REPLACE FUNCTION "public"."issue_invoice_from_payment"(p_payment_id uuid)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  charge public.payments%rowtype;
  buyer public.profiles%rowtype;
  plan_row public.plans%rowtype;
  result public.invoices;
  newly_created boolean;
begin
  if not (public.is_admin_aal2() or current_setting('role', true) = 'service_role') then
    raise exception 'issue_invoice_from_payment: caller must be an AAL2-verified admin or service_role';
  end if;

  select * into charge from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'issue_invoice_from_payment: no payments row %', p_payment_id;
  end if;

  if charge.kind <> 'charge' or charge.status <> 'succeeded' then
    raise exception 'issue_invoice_from_payment: payment % is not a succeeded charge (kind=%, status=%) — invoices are never issued for a refund or a pending/failed payment', p_payment_id, charge.kind, charge.status;
  end if;

  select * into buyer from public.profiles where id = charge.user_id;
  if charge.plan_id is not null then
    select * into plan_row from public.plans where id = charge.plan_id;
  end if;

  insert into public.invoices (
    invoice_number, user_id, plan_id, payment_id, customer_name_snapshot, plan_name_snapshot,
    amount_minor_snapshot, discount_minor_snapshot, currency_snapshot, status
  )
  values (
    public.next_document_number('invoice', 'INV'),
    charge.user_id, charge.plan_id, charge.id,
    coalesce(buyer.name, buyer.email), plan_row.name,
    charge.amount_minor, charge.discount_minor_snapshot, charge.currency_snapshot, 'paid'
  )
  on conflict (payment_id) do nothing
  returning * into result;

  newly_created := result.id is not null;

  if result.id is null then
    select * into result from public.invoices where payment_id = p_payment_id;
  end if;

  if newly_created and auth.uid() is not null then
    insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after)
    values (
      auth.uid(), 'issue_invoice_from_payment', 'invoices', result.id::text,
      null,
      jsonb_build_object('invoice_id', result.id, 'payment_id', result.payment_id, 'amount_minor_snapshot', result.amount_minor_snapshot, 'invoice_number', result.invoice_number)
    );
  end if;

  return result;
end;
$$;
--> statement-breakpoint
-- CREATE OR REPLACE at the same signature preserves the function's
-- existing GRANTs automatically (verified in 0010's own closing comment) —
-- no GRANT/REVOKE needed here.
