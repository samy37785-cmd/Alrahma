#!/usr/bin/env node
// Supabase Readiness Phase 3 — fresh-start seed: teacher public-profile
// content. Reads the REAL, owner-approved teacher dataset already in the
// codebase (artifacts/al-rahma-academy/src/data/marketing/teachers.js —
// the exact same data the public Teachers page renders today) and
// idempotently upserts it into `profiles` for teachers who already have
// a real Supabase Auth identity.
//
// ------------------------------------------------------------------
// A real, honest limitation found while building this — not assumed,
// not silently worked around:
// ------------------------------------------------------------------
// `profiles.id` is a hard FK to `auth.users.id` (Supabase Auth owns that
// table; this migration set never creates or seeds it — see
// src/schema/auth.ts's own comment). teachers.js has stable numeric
// `id`s used for display/routing, but NO email address for any
// teacher — there is nothing in this codebase today that maps a
// marketing-page teacher to a real Supabase Auth account. This script
// therefore REQUIRES an external mapping file (--mapping <path>, a JSON
// object of `{ "<teachers.js id>": "<real teacher's auth.users email>" }`)
// that the project owner supplies once each teacher has a real account —
// this script deliberately ships with none, and invents no placeholder
// email for anyone. A teacher missing from the mapping (or whose email
// has no matching auth.users row yet) is skipped and reported, never
// silently created with a fabricated identity.
//
// Second, separate, real limitation: `profiles.bio` and
// `profiles.specialization` are plain `text` columns — ONE language —
// while teachers.js carries all 6. This script seeds the English text
// only (documented, not hidden) and flags every teacher in its report as
// "5 of 6 languages not representable in the current schema". Closing
// that gap is a schema decision (e.g. per-locale columns, mirroring the
// blog's own `locale`/`translation_group_id` precedent, or a jsonb
// column) — out of scope here; this script does not attempt to invent
// one.
//
// Idempotent: keyed by email → existing profiles.id, a plain UPDATE
// (never INSERT — this script never creates a profiles row, since a
// profiles row for that user must already exist, created by the
// handle_new_user trigger when the account was made). Running it twice
// in a row produces the exact same end state, not duplicates.
//
// Dry-run by default; --apply writes. Never touches any other table.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');
const teachersDataPath = path.join(repoRoot, 'artifacts', 'al-rahma-academy', 'src', 'data', 'marketing', 'teachers.js');

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--database-url') args.databaseUrl = argv[++i];
    else if (argv[i] === '--mapping') args.mappingPath = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
  }
  return args;
}

async function loadTeachers() {
  const mod = await import(`file://${teachersDataPath.replace(/\\/g, '/')}`);
  return mod.TEACHERS;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = args.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('--database-url (or DATABASE_URL) is required.');
  if (!args.mappingPath) {
    throw new Error(
      '--mapping <path-to-json> is required: a { "<teachers.js id>": "<real email>" } file. ' +
        'This script ships with no such mapping — teachers.js has no email field for any teacher; ' +
        'the project owner must supply which real auth.users account each marketing-page teacher corresponds to.',
    );
  }
  const host = new URL(databaseUrl).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal && !/sslmode=require|sslmode=verify/.test(databaseUrl)) {
    throw new Error('Refusing: a non-local database URL must declare sslmode=require or stricter.');
  }

  const mapping = JSON.parse(fs.readFileSync(args.mappingPath, 'utf8'));
  const teachers = await loadTeachers();
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: isLocal ? false : { rejectUnauthorized: true } });

  console.log(`[seed-teachers] ${teachers.length} teachers in teachers.js, ${Object.keys(mapping).length} entries in the supplied mapping.`);
  console.log(args.apply ? '[seed-teachers] --apply: writing.' : '[seed-teachers] DRY RUN — no writes (pass --apply to write).');

  let updated = 0, skippedNoMapping = 0, skippedNoAccount = 0;

  for (const t of teachers) {
    const email = mapping[String(t.id)];
    if (!email) {
      console.log(`SKIP    teachers.js id=${t.id} (${t.nameEn}) — no email in the supplied mapping`);
      skippedNoMapping++;
      continue;
    }

    const found = await pool.query(`select id from profiles where email = $1`, [email]);
    if (found.rows.length === 0) {
      console.log(`SKIP    teachers.js id=${t.id} (${t.nameEn}) — mapped to ${email}, but no profiles row exists for that email yet (real Auth account not created yet)`);
      skippedNoAccount++;
      continue;
    }
    const profileId = found.rows[0].id;

    console.log(`${args.apply ? 'UPDATE ' : 'WOULD-UPDATE'} teachers.js id=${t.id} (${t.nameEn}) -> profiles.id=${profileId} (${email}) — English bio/specialization only; ar/it/es/de/fr text not representable in the current schema`);
    if (args.apply) {
      await pool.query(
        `update profiles set is_teacher = true, name = $2, specialization = $3, bio = $4, gender = $5,
                              languages = $6::jsonb, subjects = $7::jsonb
           where id = $1`,
        [
          profileId,
          t.nameEn,
          t.title.en,
          t.bio.en,
          t.gender === 'f' ? 'female' : 'male',
          JSON.stringify(t.langs ?? []),
          JSON.stringify(t.subjects ?? []),
        ],
      );
    }
    updated++;
  }

  console.log(`\n[seed-teachers] ${args.apply ? 'updated' : 'would update'}: ${updated}, skipped (no mapping entry): ${skippedNoMapping}, skipped (no matching account yet): ${skippedNoAccount}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[seed-teachers] FAILED:', err.message);
  process.exitCode = 1;
});
