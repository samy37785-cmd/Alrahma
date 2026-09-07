// Applies lib/db/drizzle/*.sql to a REAL local Supabase CLI stack (real
// GoTrue-managed `auth` schema, real auth.uid()/auth.jwt() from the
// supabase/postgres image) — unlike run-migrations.mjs, this does NOT
// create the fake auth.users/auth.uid() stub, because a real one already
// exists here. Only ever targets STAGE2F_AUTHTEST_DB_URL (the disposable,
// isolated `stage2f-authtest` local stack), never anything else.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalHost } from "./local-harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.STAGE2F_AUTHTEST_DB_URL;
if (!connectionString) {
  throw new Error("STAGE2F_AUTHTEST_DB_URL must be set (local stage2f-authtest stack only).");
}
assertLocalHost(connectionString, "STAGE2F_AUTHTEST_DB_URL");

const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);

async function main() {
  console.log(`[migrate] applying lib/db/drizzle to ${connectionString.replace(/:[^:@]*@/, ":***@")}`);
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });
  console.log("[migrate] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exitCode = 1;
});
