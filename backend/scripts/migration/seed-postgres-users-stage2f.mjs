#!/usr/bin/env node
// Precondition for the Stage 2F migration-tooling rehearsal: mongo-to-
// supabase.mjs resolves every user reference by matching profiles.email
// against the Mongo user's email (see its resolveProfileId() comment) — it
// never creates a Supabase Auth account itself. This script stands in for
// "these 4 fixture users already signed up under Supabase Auth" by
// inserting matching auth.users + profiles rows directly, LOCAL-ONLY (same
// assertLocalHost discipline as every other script in this directory). It
// is not a general User-migration tool — real account migration would need
// the GoTrue admin API (auth.admin.createUser), which this deliberately
// does not attempt (see docs/option-a-mongo-supabase-parity-map.md, "User /
// profiles"); this is scaffolding for the rehearsal only.
import pg from 'pg';
import { FIXTURE_USER_IDS } from './seed-mongo-fixture-stage2f.mjs';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

// Deterministic uuids derived from the fixture ObjectIds so re-runs are
// idempotent without needing to persist a separate id map.
function uuidFrom(objectIdHex) {
  const hex = objectIdHex.padEnd(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function main() {
  const pgUri = process.env.MIGRATION_DB_URL;
  if (!pgUri) throw new Error('MIGRATION_DB_URL must be set (local-only).');
  assertLocalHost(pgUri, 'MIGRATION_DB_URL');

  const pool = new pg.Pool({ connectionString: pgUri });
  const client = await pool.connect();
  try {
    const users = [
      { key: 'admin', email: 'fixture.admin@example.test', name: 'Fixture Admin', role: 'admin' },
      { key: 'teacher', email: 'fixture.teacher@example.test', name: 'Fixture Teacher', role: 'user' },
      { key: 'student1', email: 'fixture.student1.2f@example.test', name: 'Fixture Student One', role: 'user' },
      { key: 'student2', email: 'fixture.student2.2f@example.test', name: 'Fixture Student Two', role: 'user' },
    ];

    for (const u of users) {
      const id = uuidFrom(FIXTURE_USER_IDS[u.key]);
      await client.query(`INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [id, u.email]);
      await client.query(
        `INSERT INTO profiles (id, email, name, role) VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET email = $2, name = $3, role = $4`,
        [id, u.email, u.name, u.role]
      );
    }
    const studentId = uuidFrom(FIXTURE_USER_IDS.student1);
    const teacherId = uuidFrom(FIXTURE_USER_IDS.teacher);
    await client.query(`UPDATE profiles SET teacher_id = $1 WHERE id = $2`, [teacherId, studentId]);

    console.log('[seed-postgres-users-stage2f] seeded 4 profiles rows, linked student1 -> teacher');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed-postgres-users-stage2f] FATAL:', err.message);
  process.exitCode = 1;
});
