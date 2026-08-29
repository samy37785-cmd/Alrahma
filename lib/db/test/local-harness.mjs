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
      raw_user_meta_data jsonb
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
  `);
}

/** Throws unless a candidate connection string points at localhost/127.0.0.1 — the same hard guard every script in this directory uses. Shared here so upgrade-scenario.local.test.mjs (which opens 2 different connection strings against 2 different migration sets) doesn't need a 3rd copy of this check. */
export function assertLocalHost(connectionString, label = "connection string") {
  const host = new URL(connectionString).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}
