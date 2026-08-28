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

// --- Local-test-harness-only shape fix -------------------------------
// The real Supabase project's auth.users table already has `email` and
// `raw_user_meta_data` columns (Supabase-managed, never created by us —
// see src/schema/auth.ts's comment). Our own auth.ts Drizzle stub is
// intentionally minimal (just `id`, enough for FK typing), so 0000's
// generated `CREATE TABLE auth.users (id uuid primary key)` doesn't have
// them. handle_new_user() (0001) needs them to exist to be testable at
// all locally. This ALTER is NOT part of the versioned migration and is
// NEVER run against the real project — it exists solely so this local
// container's auth.users shape is close enough to Supabase's real one to
// exercise the trigger.
async function patchLocalAuthUsersShape() {
  await pool.query(`
    alter table auth.users
      add column if not exists email text,
      add column if not exists raw_user_meta_data jsonb;
  `);
}

async function main() {
  console.log(`[migrate] applying lib/db/drizzle to ${connectionString.replace(/:[^:@]*@/, ":***@")}`);
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });
  await patchLocalAuthUsersShape();
  console.log("[migrate] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exitCode = 1;
});
