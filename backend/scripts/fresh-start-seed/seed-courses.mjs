#!/usr/bin/env node
// Supabase Readiness Phase 3 — fresh-start seed: course catalog structure.
// Reads the REAL marketing copy already in the codebase
// (artifacts/al-rahma-academy/src/data/marketing/courses.js — the exact
// text the public marketing page shows today) and idempotently inserts a
// `courses` row per entry, for the fields that map cleanly.
//
// ------------------------------------------------------------------
// A real, honest limitation — not silently papered over:
// ------------------------------------------------------------------
// courses.js is marketing COPY (a title, a short pitch, bullet points),
// not catalog DATA — it has no price, no level, no structured module
// list. The `courses` table's `price_minor`/`level`/`modules`/
// `resources` are real business/curriculum decisions this script cannot
// responsibly invent. So every row this script creates is seeded with:
//   - title/description/icon: directly from courses.js (real content).
//   - tags: courses.js's own bullet points (`points`), real content.
//   - level: schema default ('All levels').
//   - price_minor: 0.
//   - modules/resources: empty (courses.js's own optional `resources`
//     array — YouTube/PDF links — IS carried over where present; a real
//     `modules` curriculum structure does not exist anywhere in this
//     codebase today and is not fabricated here).
//   - published: ALWAYS false, regardless of the --apply flag. A course
//     with a placeholder price_minor=0 must never go live by accident;
//     flipping it to published is a deliberate, separate, reviewed
//     decision the project owner makes per course, not something this
//     script decides.
//
// Idempotent: checks for an existing row with the same `title` before
// inserting (courses has no unique constraint on title — a real one
// would be a cleaner long-term fix, out of scope here as a schema
// change). Running this twice never creates duplicates.
//
// Dry-run by default; --apply writes (still always published=false).

import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');
const coursesDataPath = path.join(repoRoot, 'artifacts', 'al-rahma-academy', 'src', 'data', 'marketing', 'courses.js');

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--database-url') args.databaseUrl = argv[++i];
    else if (argv[i] === '--apply') args.apply = true;
  }
  return args;
}

async function loadCourses() {
  const mod = await import(`file://${coursesDataPath.replace(/\\/g, '/')}`);
  return mod.courses;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = args.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('--database-url (or DATABASE_URL) is required.');
  const host = new URL(databaseUrl).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal && !/sslmode=require|sslmode=verify/.test(databaseUrl)) {
    throw new Error('Refusing: a non-local database URL must declare sslmode=require or stricter.');
  }

  const courses = await loadCourses();
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: isLocal ? false : { rejectUnauthorized: true } });

  console.log(`[seed-courses] ${courses.length} entries in courses.js.`);
  console.log(args.apply ? '[seed-courses] --apply: writing (always published=false — see header).' : '[seed-courses] DRY RUN — no writes (pass --apply to write).');

  let inserted = 0, skippedExisting = 0;

  for (const c of courses) {
    const existing = await pool.query(`select id from courses where title = $1`, [c.title]);
    if (existing.rows.length > 0) {
      console.log(`SKIP    "${c.title}" — a course with this title already exists (id=${existing.rows[0].id})`);
      skippedExisting++;
      continue;
    }

    const resources = (c.resources ?? []).map((r) => ({ type: r.type, label: r.label, url: r.url }));
    console.log(`${args.apply ? 'INSERT ' : 'WOULD-INSERT'} "${c.title}" — published=false, price_minor=0, level=All levels, ${resources.length} resource(s), 0 modules`);
    if (args.apply) {
      await pool.query(
        `insert into courses (title, description, icon, tags, resources, published)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, false)`,
        [c.title, c.text, c.media ?? '📘', JSON.stringify(c.points ?? []), JSON.stringify(resources)],
      );
    }
    inserted++;
  }

  console.log(`\n[seed-courses] ${args.apply ? 'inserted' : 'would insert'}: ${inserted}, skipped (already exists): ${skippedExisting}`);
  console.log('[seed-courses] Every inserted row is published=false — review price_minor/level/modules and publish deliberately, per course.');
  await pool.end();
}

main().catch((err) => {
  console.error('[seed-courses] FAILED:', err.message);
  process.exitCode = 1;
});
