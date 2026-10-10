// Applies lib/db/drizzle/*.sql to the local Supabase dev stack (see README.md).
// Refuses anything but 127.0.0.1/localhost.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const libDb = path.join(here, '..', '..', 'lib', 'db');
const require = createRequire(path.join(libDb, 'package.json'));
const pg = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');

const connectionString =
  process.env.LOCAL_DEV_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';
const host = new URL(connectionString).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(`Refusing to run against non-local host "${host}".`);
}

const pool = new pg.Pool({ connectionString });
await migrate(drizzle(pool), { migrationsFolder: path.join(libDb, 'drizzle') });
console.log('migrate() completed against', host);
await pool.end();
