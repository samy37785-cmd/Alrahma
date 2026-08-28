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

async function main() {
  console.log(`[migrate] applying lib/db/drizzle to ${connectionString.replace(/:[^:@]*@/, ":***@")}`);
  await createLocalAuthUsersStub();
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });
  console.log("[migrate] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exitCode = 1;
});
