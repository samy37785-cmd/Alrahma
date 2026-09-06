-- Stage 2F — Admin RBAC/MFA final design, replacing the Mongo AdminUser
-- collection's role/permission model with a Supabase-native equivalent.
-- NOT yet applied to the real Supabase project.
--
-- Explicit mapping from the old (Mongo) AdminUser system to this one —
-- documented per the task's own requirement to preserve functionality
-- through a mapping, not by copying the old (less safe, self-managed)
-- design:
--
--   AdminUser.password (bcrypt, in a public-reachable Mongo collection)
--     -> auth.users.encrypted_password. Supabase Auth (GoTrue) owns this
--        entirely; no password ever touches a `public` table here.
--   AdminUser._mfaSecret / _mfaPendingSecret (AES-encrypted TOTP secret,
--   stored in the same collection as the password)
--     -> Supabase Auth's own auth.mfa_factors (TOTP secrets are managed
--        entirely inside GoTrue via its /factors enrollment API — this
--        schema never stores, reads, or duplicates a TOTP secret anywhere).
--   AdminUser.mfaEnabled / stage-token / full-token distinction
--     -> auth.jwt()->>'aal' (Authenticator Assurance Level). A session is
--        "AAL2" once GoTrue verifies a TOTP challenge for that factor —
--        exactly the proof is_admin_aal2() already checks (see
--        0001_functions_triggers.sql). No custom "MFA verified" flag is
--        needed or created here; GoTrue's own claim is normative.
--   AdminUser.failedLoginAttempts / lockedUntil (per-account brute-force
--   lockout)
--     -> delegated to Supabase Auth's own sign-in rate limiting. Not
--        reimplemented at the schema level. This is a documented, accepted
--        behavioral difference (GoTrue's exact thresholds are its own
--        config, not a 5-attempts/15-minute rule this project controls) —
--        not a security regression, since GoTrue's protection is itself a
--        production-grade auth-abuse control.
--   RefreshToken (hashed refresh tokens, per-admin token families, reuse
--   detection)
--     -> Supabase Auth's own session/refresh-token issuance already
--        implements rotation with reuse detection natively. No table is
--        created for this; it would duplicate infrastructure GoTrue already
--        owns and trusts less than the platform's own implementation.
--   AdminUser.role (super-admin/admin/editor/viewer)
--     -> admin_role_assignments.role below (same 4 values).
--   AdminUser.extraPermissions[] / ROLE_PERMISSIONS matrix / hasPermission()
--     -> role_permissions (static role->permission matrix) +
--        user_extra_permissions (per-user grants beyond the role default) +
--        authorize(permission) below, which reproduces hasPermission()'s
--        exact logic: admin AND (role has it OR an extra grant has it).
--   AdminUser.lastLoginAt / lastLoginIp (anonymized)
--     -> not reproduced as a dedicated column; admin_audit_log already
--        records every admin action with an anonymized actor and timestamp,
--        which is the information this was actually used for downstream.
--   ADMIN_IP_WHITELIST (per-IP allowlist for the whole admin API)
--     -> stays exactly as-is, at the Express layer (backend/middleware/
--        ipWhitelist.js) — an application-layer network control, not a
--        database concern; unaffected by DATA_BACKEND.
--
-- `profiles.role` stays the coarse "is this account an admin at all" gate
-- (already used everywhere via is_admin()/is_admin_aal2()) — the tables
-- below add the FINER-grained role/permission layer on top of that,
-- exactly mirroring how AdminUser.role added detail beyond a boolean.

CREATE TYPE "public"."admin_role" AS ENUM('super-admin', 'admin', 'editor', 'viewer');--> statement-breakpoint

CREATE TABLE "admin_role_assignments" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "admin_role" NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid
);
--> statement-breakpoint

-- Static reference data: which permission strings each role gets by
-- default. Same permission-string vocabulary as the old
-- AdminUser.ALL_PERMISSIONS (users:read/write/delete, courses:read/write/
-- delete, payments:read/write/refund, enrollments:read/write, audit:read,
-- blog:write, coupons:write, contact:write, certificates:write,
-- referrals:write, reviews:write, live_classes:write, messages:read).
CREATE TABLE "role_permissions" (
	"role" "admin_role" NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_permission_pk" PRIMARY KEY("role","permission")
);
--> statement-breakpoint

CREATE TABLE "user_extra_permissions" (
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "user_extra_permissions_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint

ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_extra_permissions" ADD CONSTRAINT "user_extra_permissions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_extra_permissions" ADD CONSTRAINT "user_extra_permissions_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Seed the default role -> permission matrix (mirrors AdminUser.js's
-- ROLE_PERMISSIONS exactly, plus the 4 new domains' permissions).
INSERT INTO "role_permissions" ("role", "permission") VALUES
	-- super-admin: granted everything via is_super_admin_aal2() instead of
	-- row-by-row entries here (mirrors requireAdminRole('super-admin') being
	-- a separate, coarser gate than requirePermissions(...) in the old code) —
	-- no rows needed for super-admin.
	('admin', 'users:read'), ('admin', 'users:write'),
	('admin', 'courses:read'), ('admin', 'courses:write'),
	('admin', 'payments:read'), ('admin', 'payments:write'),
	('admin', 'enrollments:read'), ('admin', 'enrollments:write'),
	('admin', 'audit:read'),
	('admin', 'blog:write'), ('admin', 'coupons:write'), ('admin', 'contact:write'),
	('admin', 'certificates:write'), ('admin', 'referrals:write'), ('admin', 'reviews:write'),
	('admin', 'live_classes:write'), ('admin', 'messages:read'),
	('editor', 'courses:read'), ('editor', 'courses:write'), ('editor', 'enrollments:read'),
	('viewer', 'users:read'), ('viewer', 'courses:read'), ('viewer', 'payments:read'),
	('viewer', 'enrollments:read'), ('viewer', 'audit:read');
--> statement-breakpoint

-- authorize(): the fine-grained permission check, reproducing
-- AdminUser.hasPermission()'s exact logic. AAL1-sufficient by itself
-- (matches the old hasPermission(), which never checked MFA state) —
-- callers that also need proof of MFA step-up combine this with
-- is_admin_aal2() explicitly (see 0014_new_domains_rls.sql), the same way
-- the original schema separately combines is_admin()/is_admin_aal2() with
-- its own business checks rather than baking AAL2 into every helper.
CREATE OR REPLACE FUNCTION "public"."authorize"(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  select
    public.is_admin()
    and (
      exists (
        select 1
          from public.admin_role_assignments ara
          join public.role_permissions rp on rp.role = ara.role
         where ara.user_id = auth.uid()
           and rp.permission = p_permission
      )
      or exists (
        select 1 from public.user_extra_permissions uep
         where uep.user_id = auth.uid()
           and uep.permission = p_permission
      )
      or exists (
        select 1 from public.admin_role_assignments ara
         where ara.user_id = auth.uid()
           and ara.role = 'super-admin'
      )
    );
$$;
--> statement-breakpoint

-- is_super_admin_aal2(): mirrors requireAdminRole('super-admin') — the
-- coarse, permission-ungrantable gate the old system used for
-- maintenance-mode/financial-freeze/audit-purge/admin-creation, which must
-- never become available to a mere 'admin' via any permission grant.
CREATE OR REPLACE FUNCTION "public"."is_super_admin_aal2"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  select
    public.is_admin_aal2()
    and exists (
      select 1 from public.admin_role_assignments ara
       where ara.user_id = auth.uid()
         and ara.role = 'super-admin'
    );
$$;
--> statement-breakpoint

-- admin_set_admin_role(): the ONLY way to assign/change a granular admin
-- role — super-admin-AAL2-only, audited, mirrors admin_set_role()'s own
-- pattern (0001_functions_triggers.sql) for the coarse profiles.role.
CREATE OR REPLACE FUNCTION "public"."admin_set_admin_role"(p_user_id uuid, p_role public.admin_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_before public.admin_role;
begin
  if not public.is_super_admin_aal2() then
    raise exception 'insufficient_privilege: super-admin AAL2 required' using errcode = '42501';
  end if;

  select role into v_before from public.admin_role_assignments where user_id = p_user_id;

  insert into public.admin_role_assignments (user_id, role, assigned_by)
  values (p_user_id, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role, assigned_by = auth.uid(), assigned_at = now();

  -- Also flips the coarse profiles.role to 'admin' so is_admin()/RLS
  -- everywhere else keeps working without a second admin-designation step.
  update public.profiles set role = 'admin' where id = p_user_id;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after, severity)
  values (auth.uid(), 'admin.role.set', 'admin_role_assignments', p_user_id::text,
          jsonb_build_object('role', v_before), jsonb_build_object('role', p_role), 'critical');
end;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."admin_grant_permission"(p_user_id uuid, p_permission text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
begin
  if not public.is_super_admin_aal2() then
    raise exception 'insufficient_privilege: super-admin AAL2 required' using errcode = '42501';
  end if;

  insert into public.user_extra_permissions (user_id, permission, granted_by)
  values (p_user_id, p_permission, auth.uid())
  on conflict (user_id, permission) do nothing;

  insert into public.admin_audit_log (actor_admin_id, action, resource_type, resource_id, after, severity)
  values (auth.uid(), 'admin.permission.grant', 'user_extra_permissions', p_user_id::text,
          jsonb_build_object('permission', p_permission), 'critical');
end;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- Postgres RESTRICTIVE policies only ever NARROW what a PERMISSIVE policy
-- already allows — a table with only RESTRICTIVE policies and zero
-- PERMISSIVE ones denies everyone entirely (the implicit permissive default
-- is deny-all). Every RESTRICTIVE policy below is therefore paired with a
-- broad PERMISSIVE base policy for the same operation/role, so the
-- RESTRICTIVE clause is what actually does the narrowing — exactly the
-- "restrictive policies" defense-in-depth model the task asked for: a
-- future, accidentally-too-broad PERMISSIVE policy added later still can't
-- bypass the RESTRICTIVE admin/AAL2 gate.
ALTER TABLE "admin_role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_role_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "admin_role_assignments_base_authenticated" ON "admin_role_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "admin_role_assignments_select_admin_aal2" ON "admin_role_assignments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (public.is_admin_aal2());--> statement-breakpoint
-- No raw INSERT/UPDATE/DELETE policy — admin_set_admin_role() is the only
-- writer (SECURITY DEFINER, super-admin-AAL2-gated internally).

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "role_permissions_base_authenticated" ON "role_permissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "role_permissions_select_admin_aal2" ON "role_permissions" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (public.is_admin_aal2());--> statement-breakpoint
-- Static reference data — no write policy at all; changes ship as a
-- migration, not a runtime admin action.

ALTER TABLE "user_extra_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_extra_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_extra_permissions_base_authenticated" ON "user_extra_permissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "user_extra_permissions_select_admin_aal2" ON "user_extra_permissions" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (public.is_admin_aal2());--> statement-breakpoint
-- No raw INSERT/UPDATE/DELETE policy — admin_grant_permission() is the
-- only writer.

-- ---------------------------------------------------------------------
-- GRANTs — restated explicitly per 0004/0011's own discipline: revoke any
-- implicit PUBLIC grant first, then grant exactly what's needed.
-- ---------------------------------------------------------------------
REVOKE ALL ON "admin_role_assignments", "role_permissions", "user_extra_permissions" FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT ON "admin_role_assignments", "role_permissions", "user_extra_permissions" TO authenticated;--> statement-breakpoint
GRANT ALL ON "admin_role_assignments", "role_permissions", "user_extra_permissions" TO service_role;--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."authorize"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."authorize"(text) TO anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."is_super_admin_aal2"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."is_super_admin_aal2"() TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."admin_set_admin_role"(uuid, public.admin_role) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."admin_set_admin_role"(uuid, public.admin_role) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."admin_grant_permission"(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."admin_grant_permission"(uuid, text) TO authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."next_document_number"(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."next_document_number"(text, text) TO authenticated, service_role;
