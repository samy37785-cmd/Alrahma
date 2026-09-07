// RLS Remediation Round 3 (Section A / test plan): the local-only
// auth.users stub + Supabase-role/auth.uid()/auth.jwt() stand-ins used to
// be private to run-migrations.mjs. upgrade-scenario.local.test.mjs
// (Section I.2) needs the EXACT same scaffolding — applied against a
// throwaway temp-folder migration run of just 0000-0003, then again
// (idempotently) before the full-folder run — so this is factored out
// here rather than a second, slightly-different copy. run-migrations.mjs
// is now a thin caller of this module; behavior is unchanged.
//
// Both functions accept anything with a `.query()` method (a pg.Pool or
// a pg.Client) so callers can pass whichever they already have open.

/**
 * Baseline remediation: 0000_init_20_table_baseline.sql used to open
 * with `CREATE SCHEMA auth` / `CREATE TABLE auth.users` — harmless
 * locally but would fail outright against the real Supabase project
 * (auth/auth.users already exist there, Supabase Auth owns them; this
 * project never creates or migrates them — see src/schema/auth.ts's
 * comment). Those 2 statements were removed from the committed
 * migration by hand. This function recreates an equivalent stub here
 * instead — LOCAL-ONLY scaffolding, run BEFORE migrate() (since
 * profiles.id has an FK to auth.users.id), never part of the versioned
 * migration, never run anywhere near the real project. It includes
 * `email`/`raw_user_meta_data` up front (the real project's auth.users
 * already has both; our own auth.ts Drizzle stub stays intentionally
 * minimal — just `id`, enough for FK typing) so handle_new_user() (0001)
 * is testable immediately, with no separate ALTER step needed after.
 *
 * @param {{query: Function}} db a connected pg.Pool or pg.Client
 */
export async function createLocalAuthUsersStub(db) {
  await db.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb,
      banned_until timestamptz
    );
    -- Stage 2F admin RBAC/MFA (lib/db/drizzle/0013_admin_rbac.sql,
    -- data/supabase/loadAdmin.js) reads auth.mfa_factors directly to
    -- determine whether an admin has completed TOTP enrollment — the real
    -- project has this table built-in (GoTrue's own MFA schema); stubbed
    -- here the same way auth.users itself is, for the same reason (this
    -- migration set never creates or owns it, so local tests need a
    -- structural stand-in to exercise that code path at all).
    create table if not exists auth.mfa_factors (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id),
      status text not null default 'unverified',
      factor_type text not null default 'totp',
      friendly_name text,
      created_at timestamptz not null default now()
    );
  `);
}

/**
 * 0002_rls.sql's GRANT statements and CREATE POLICY clauses reference
 * Supabase-standard roles (anon, authenticated, service_role) and
 * Supabase-provided functions (auth.uid(), auth.jwt()) — the real
 * project already has all of these (Supabase provisions them
 * automatically, same as auth.users); this migration never creates
 * them, matching the auth.users discipline above.
 *
 * Locally there is no such provisioning, so this local-only step
 * creates matching stand-ins BEFORE migrate() runs (0002 GRANTs to
 * these roles): plain NOLOGIN roles a test session can `SET ROLE` into
 * (service_role gets BYPASSRLS, matching its real behavior), and
 * auth.uid()/auth.jwt() reading the same `request.jwt.claims` session
 * GUC Supabase's real implementations read — so a test can simulate
 * "this session is user X" / "this session is an AAL2 admin" with a
 * plain `SET LOCAL request.jwt.claims = '...'` before a query, exactly
 * like the real thing.
 *
 * @param {{query: Function}} db a connected pg.Pool or pg.Client
 */
export async function createLocalAuthRolesAndFunctions(db) {
  await db.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
    end
    $$;

    grant anon, authenticated, service_role to current_user;

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;

    create or replace function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
    $$;

    -- The real Supabase project grants anon/authenticated USAGE on
    -- schema auth + EXECUTE on auth.uid()/auth.jwt() out of the box
    -- (any authenticated request needs to call them) — this replicates
    -- that locally. Found by actually running the RLS test suite: a
    -- direct call as \`authenticated\` failed with "permission denied
    -- for schema auth" before this was added.
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.jwt() to anon, authenticated, service_role;

    -- The real Supabase project grants service_role full access to its own
    -- auth schema tables (that's the whole point of a service-role
    -- connection being able to read auth.users/auth.mfa_factors at all —
    -- see data/supabase/loadAdmin.js's loadAdminById()/hasVerifiedMfaFactor()).
    -- BYPASSRLS (granted to service_role above) only skips RLS POLICIES —
    -- it does NOT imply a table-level GRANT, so without this, any service-
    -- role query against these stub tables fails with "permission denied
    -- for table users/mfa_factors". Found by actually running an admin-
    -- router HTTP request against this local harness for the first time
    -- (Al-Rahma Final Corrections Part A rehearsal) — every prior Stage 2F
    -- check exercised loadAdmin.js only at the schema/RPC level
    -- (validate-stage2f-schema.mjs), never through an actual service-role
    -- pg connection, so this gap went undetected until now. Also a second,
    -- distinct real bug this same rehearsal found: middleware/adminAuth.js's
    -- verifyAccessToken(), an async Express 4 middleware with no asyncHandler
    -- wrapper, silently HUNG the request (never a 500) when loadAdminById()
    -- threw this exact permission error — fixed separately there.
    grant select on auth.users, auth.mfa_factors to service_role;
  `);
}

/** Throws unless a candidate connection string points at localhost/127.0.0.1 — the same hard guard every script in this directory uses. Shared here so upgrade-scenario.local.test.mjs (which opens 2 different connection strings against 2 different migration sets) doesn't need a 3rd copy of this check. */
export function assertLocalHost(connectionString, label = "connection string") {
  const host = new URL(connectionString).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}
