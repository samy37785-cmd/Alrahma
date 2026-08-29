// Applies lib/db/drizzle/*.sql to a LOCAL Postgres via drizzle-orm's own
// migrate() runner (drizzle-orm/node-postgres/migrator) — never hand-run
// twice, so "second run = no pending migrations" is a real, tracked
// property (the __drizzle_migrations table), not an assumption. This
// script only ever targets TEST_DATABASE_URL (a throwaway local Docker
// Postgres) — it refuses to run against anything that isn't localhost/
// 127.0.0.1, as a hard guard against ever pointing this at the real
// Supabase project by mistake.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
const host = new URL(connectionString).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error(
    `Refusing to run: TEST_DATABASE_URL host "${host}" is not localhost/127.0.0.1. ` +
      `This script only ever targets a throwaway local Docker Postgres.`,
  );
}

const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);

// --- Local-test-harness-only auth.users stub -------------------------
// Baseline remediation: 0000_init_20_table_baseline.sql used to open
// with `CREATE SCHEMA auth` / `CREATE TABLE auth.users` — harmless
// locally but would fail outright against the real Supabase project
// (auth/auth.users already exist there, Supabase Auth owns them; this
// project never creates or migrates them — see src/schema/auth.ts's
// comment). Those 2 statements were removed from the committed
// migration by hand. This function recreates an equivalent stub here
// instead — LOCAL-ONLY scaffolding, run BEFORE migrate() (since
// profiles.id has an FK to auth.users.id), never part of the versioned
// migration, never run anywhere near the real project. It includes
// `email`/`raw_user_meta_data` up front (the real project's auth.users
// already has both; our own auth.ts Drizzle stub stays intentionally
// minimal — just `id`, enough for FK typing) so handle_new_user() (0001)
// is testable immediately, with no separate ALTER step needed after.
async function createLocalAuthUsersStub() {
  await pool.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb
    );
  `);
}

// --- Local-test-harness-only roles + auth.uid()/auth.jwt() -----------
// 0002_rls.sql's GRANT statements and CREATE POLICY clauses reference
// Supabase-standard roles (anon, authenticated, service_role) and
// Supabase-provided functions (auth.uid(), auth.jwt()) — the real
// project already has all of these (Supabase provisions them
// automatically, same as auth.users); this migration never creates
// them, matching the auth.users discipline above.
//
// Locally there is no such provisioning, so this local-only step
// creates matching stand-ins BEFORE migrate() runs (0002 GRANTs to
// these roles): plain NOLOGIN roles a test session can `SET ROLE` into
// (service_role gets BYPASSRLS, matching its real behavior), and
// auth.uid()/auth.jwt() reading the same `request.jwt.claims` session
// GUC Supabase's real implementations read — so a test can simulate
// "this session is user X" / "this session is an AAL2 admin" with a
// plain `SET LOCAL request.jwt.claims = '...'` before a query, exactly
// like the real thing.
async function createLocalAuthRolesAndFunctions() {
  await pool.query(`
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

async function main() {
  console.log(`[migrate] applying lib/db/drizzle to ${connectionString.replace(/:[^:@]*@/, ":***@")}`);
  await createLocalAuthUsersStub();
  await createLocalAuthRolesAndFunctions();
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });
  console.log("[migrate] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exitCode = 1;
});
