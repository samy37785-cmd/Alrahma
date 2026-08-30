// Applies lib/db/drizzle/*.sql to the Option A rehearsal's REAL Supabase
// CLI local stack via drizzle-orm's own migrate() runner — the same
// mechanism lib/db/test/run-migrations.mjs uses for the plain-Postgres
// harness, but targeted at a real Supabase-shaped database (real
// anon/authenticated/service_role roles, real auth.uid()/auth.jwt()
// already provisioned by the stack itself — no local stub needed here).
// Refuses anything but 127.0.0.1/localhost, same discipline as the
// existing harness.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.REHEARSAL_DATABASE_URL;
if (!connectionString) {
  throw new Error("REHEARSAL_DATABASE_URL must be set (local Supabase CLI stack only).");
}
const host = new URL(connectionString).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(`Refusing to run against non-local host "${host}".`);
}

const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);

const migrationsFolder = path.join(__dirname, "..", "..", "..", "lib", "db", "drizzle");
console.log("Applying migrations from", migrationsFolder);
await migrate(db, { migrationsFolder });
console.log("migrate() completed.");
await pool.end();
