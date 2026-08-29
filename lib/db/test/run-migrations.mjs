// Applies lib/db/drizzle/*.sql to a LOCAL Postgres via drizzle-orm's own
// migrate() runner (drizzle-orm/node-postgres/migrator) — never hand-run
// twice, so "second run = no pending migrations" is a real, tracked
// property (the __drizzle_migrations table), not an assumption. This
// script only ever targets TEST_DATABASE_URL (a throwaway local Docker
// Postgres) — it refuses to run against anything that isn't localhost/
// 127.0.0.1, as a hard guard against ever pointing this at the real
// Supabase project by mistake.
//
// RLS Remediation Round 3: the local-only auth.users stub + Supabase-
// role/auth.uid()/auth.jwt() stand-ins used to live here directly —
// factored out into local-harness.mjs (unchanged behavior) so
// upgrade-scenario.local.test.mjs can reuse the exact same scaffolding
// against its own, differently-scoped migration runs without a second,
// slightly-different copy.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions, assertLocalHost } from "./local-harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL must be set (local Docker Postgres only).");
}
assertLocalHost(connectionString, "TEST_DATABASE_URL");

const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);

async function main() {
  console.log(`[migrate] applying lib/db/drizzle to ${connectionString.replace(/:[^:@]*@/, ":***@")}`);
  await createLocalAuthUsersStub(pool);
  await createLocalAuthRolesAndFunctions(pool);
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });
  console.log("[migrate] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exitCode = 1;
});
