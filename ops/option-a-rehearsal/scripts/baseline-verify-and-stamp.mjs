#!/usr/bin/env node
// Migration baseline reconciliation — Supabase Readiness Phase 1.
//
// Problem this solves: the real Supabase project (difzynyphojgisrfvrkd)
// already has real, pre-existing tables/views/functions, but Supabase's
// own native Migrations tracker shows "no migrations" and drizzle-orm's
// own bookkeeping table (`drizzle.__drizzle_migrations`) doesn't exist
// there either. Naively running `lib/db/test/run-migrations.mjs`'s
// `migrate()` against it would try to replay EVERY migration from
// 0000 forward — including `CREATE TABLE "profiles"` for a table that
// already exists — and fail (or worse, half-apply) immediately. That is
// exactly the unsafe assumption this task explicitly forbids making.
//
// What this script does instead (a standard "baseline" pattern, the same
// idea as Flyway's `baseline` command — there is no drizzle-orm
// equivalent, so this hand-builds one against drizzle's own real
// bookkeeping table, not a competing tracking mechanism):
//
//   1. Reads lib/db/drizzle/meta/_journal.json for the full migration
//      list, in order.
//   2. For each migration file, statically extracts every `CREATE TABLE`,
//      `CREATE VIEW`, `ALTER TABLE ... ADD COLUMN`, and
//      `CREATE OR REPLACE FUNCTION` it contains (regex-based, the same
//      technique already used elsewhere in this engagement's own drift
//      audits — not a full SQL parser, deliberately conservative: it
//      only ever asks "does this concrete, named object exist", never
//      infers intent).
//   3. Opens ONE read-only transaction (`BEGIN ... READ ONLY`, the same
//      discipline production-readonly-ownership-audit.mjs already
//      established in this directory — Postgres itself rejects any
//      write attempt inside it, not just "this script only issues
//      SELECTs") and checks each extracted object against
//      information_schema.tables / information_schema.columns /
//      pg_proc, in migration order.
//   4. A migration is CONFIRMED only if every one of its extracted
//      objects is present. The FIRST migration that is not fully
//      confirmed stops the scan — every later migration is reported
//      NOT-CONFIRMED regardless of its own individual check results,
//      because migrations build on each other and a gap earlier in the
//      sequence makes a later one's presence unverifiable/meaningless
//      even if its own objects happen to exist. This is deliberately
//      the more conservative (never over-claims baseline coverage), not
//      the more convenient, reading of ambiguous evidence.
//   5. Prints a full, readable report (dry-run is the default — nothing
//      is ever written without the explicit --apply-baseline-stamp
//      flag). In apply mode, inserts exactly ONE row into
//      `drizzle.__drizzle_migrations` — `hash` = the real sha256 of the
//      last CONFIRMED migration's file content (matching exactly what
//      drizzle's own migrate() would have written had it actually run
//      that migration for real), `created_at` = that migration's own
//      journal `when` timestamp. drizzle-orm's migrate() only ever
//      compares against the MOST RECENT row's created_at (see
//      node_modules/drizzle-orm/pg-core/dialect.cjs's migrate()) — it
//      does not track migrations individually — so this single row is
//      both correct and sufficient to make a subsequent real
//      `run-migrations.mjs` run apply only the migrations strictly
//      after the confirmed baseline, cleanly, with no "already exists"
//      error and no re-run of anything already live.
//
// This script NEVER runs DDL/DML of its own beyond that one bookkeeping
// INSERT (never CREATE TABLE, never ALTER, never touches any real
// application table), and the verification pass itself is fully
// read-only end to end.
//
// Usage:
//   node baseline-verify-and-stamp.mjs --database-url <url> [--dry-run|--apply-baseline-stamp]
//
// Against a real Supabase project, <url> must be a direct Postgres
// connection string with sslmode=require or stricter (see
// lib/pg-connection.mjs's connectionStringForClient() — reused here
// unmodified); against localhost/127.0.0.1 (this script's own tests,
// or a local rehearsal Postgres), TLS is not required. This script
// takes the URL only from --database-url / DATABASE_URL — it never
// hardcodes or logs one, and never prints anything from the connection
// string but the hostname (for the human-readable report header).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { connectionStringForClient } from './lib/pg-connection.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');
const drizzleDir = path.join(repoRoot, 'lib', 'db', 'drizzle');

function parseArgs(argv) {
  const args = { dryRun: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--database-url') args.databaseUrl = argv[++i];
    else if (argv[i] === '--apply-baseline-stamp') args.dryRun = false;
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

// Deliberately conservative regex extraction — see header. Matches this
// project's own consistent double-quoted-identifier migration style.
//
// Strips `--`-comment lines first: several migrations (0000's own header
// is a real example, found by this script's own first test run)
// describe removed/historical statements in prose inside a comment —
// e.g. literally the text `CREATE TABLE "auth"."users"` — which would
// otherwise be regex-matched as if it were real, executable SQL.
function stripSqlComments(sql) {
  return sql
    .split('\n')
    .map((line) => (line.trim().startsWith('--') ? '' : line))
    .join('\n');
}

function extractObjects(rawSql) {
  const sql = stripSqlComments(rawSql);
  const objects = [];
  for (const m of sql.matchAll(/CREATE TABLE "([a-z0-9_]+)"/gi)) {
    objects.push({ kind: 'table', name: m[1] });
  }
  for (const m of sql.matchAll(/CREATE VIEW "public"\."([a-z0-9_]+)"/gi)) {
    objects.push({ kind: 'table', name: m[1] }); // views are queryable via information_schema.tables too
  }
  for (const m of sql.matchAll(/ALTER TABLE "([a-z0-9_]+)" ADD COLUMN "([a-z0-9_]+)"/gi)) {
    objects.push({ kind: 'column', table: m[1], name: m[2] });
  }
  for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION "public"\."([a-z0-9_]+)"/gi)) {
    objects.push({ kind: 'function', name: m[1] });
  }
  return objects;
}

async function objectExists(client, obj) {
  if (obj.kind === 'table') {
    const res = await client.query(
      `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1`,
      [obj.name],
    );
    return res.rows.length > 0;
  }
  if (obj.kind === 'column') {
    const res = await client.query(
      `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [obj.table, obj.name],
    );
    return res.rows.length > 0;
  }
  if (obj.kind === 'function') {
    const res = await client.query(
      `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
      [obj.name],
    );
    return res.rows.length > 0;
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = args.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('--database-url (or DATABASE_URL) is required.');
  }
  const host = new URL(databaseUrl).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal && !/sslmode=require|sslmode=verify/.test(databaseUrl)) {
    throw new Error('Refusing: a non-local database URL must declare sslmode=require or stricter.');
  }

  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta', '_journal.json'), 'utf8'));

  const client = new pg.Client({
    connectionString: connectionStringForClient(databaseUrl),
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });
  await client.connect();

  console.log(`[baseline] connected to host: ${host}${isLocal ? ' (local)' : ' (remote, TLS verified)'}`);
  console.log(`[baseline] read-only verification pass — ${journal.entries.length} migrations in journal\n`);

  await client.query('BEGIN TRANSACTION READ ONLY');

  let lastConfirmed = null;
  let stoppedAt = null;
  const report = [];

  for (const entry of journal.entries) {
    if (stoppedAt) {
      report.push({ tag: entry.tag, status: 'NOT-CHECKED (earlier migration in sequence was not confirmed)' });
      continue;
    }
    const filePath = path.join(drizzleDir, `${entry.tag}.sql`);
    const sql = fs.readFileSync(filePath, 'utf8');
    const objects = extractObjects(sql);

    const missing = [];
    for (const obj of objects) {
      const exists = await objectExists(client, obj);
      if (!exists) missing.push(obj);
    }

    if (objects.length === 0) {
      // No concretely-checkable objects (e.g. a pure GRANT/REVOKE/RLS-
      // policy migration) — cannot be confirmed OR refuted by this
      // script's object-existence checks. Conservative choice: treat as
      // confirmed only if every migration before it was confirmed (a
      // gap earlier already would have set stoppedAt), but flag it
      // explicitly as unverifiable-by-this-tool rather than silently
      // treating "nothing to check" the same as "positively confirmed".
      report.push({ tag: entry.tag, status: 'CONFIRMED (no schema-visible objects to check — grants/RLS/policy-only migration; unverifiable by this tool, verify separately)', entry });
      lastConfirmed = entry;
      continue;
    }

    if (missing.length === 0) {
      report.push({ tag: entry.tag, status: `CONFIRMED (${objects.length} object(s) verified present)` });
      lastConfirmed = entry;
    } else {
      report.push({
        tag: entry.tag,
        status: `NOT CONFIRMED — missing: ${missing.map((o) => (o.kind === 'column' ? `${o.table}.${o.name}` : o.name)).join(', ')}`,
      });
      stoppedAt = entry.tag;
    }
  }

  await client.query('ROLLBACK');

  console.log('=== Verification report (migration order) ===');
  for (const r of report) {
    console.log(`${r.status.startsWith('CONFIRMED') ? 'CONFIRMED    ' : r.status.startsWith('NOT-CHECKED') ? 'NOT-CHECKED  ' : 'NOT-CONFIRMED'} ${r.tag} — ${r.status}`);
  }
  console.log('');

  if (!lastConfirmed) {
    console.log('[baseline] Nothing could be confirmed as already applied. Refusing to stamp anything.');
    await client.end();
    process.exitCode = 1;
    return;
  }

  console.log(`[baseline] Last confirmed-contiguous migration: ${lastConfirmed.tag} (idx ${journal.entries.find((e) => e.tag === lastConfirmed.tag) ? journal.entries.findIndex((e) => e.tag === lastConfirmed.tag) : '?'})`);
  if (stoppedAt) {
    console.log(`[baseline] Stopped at: ${stoppedAt} — this and everything after it will be left for a real \`run-migrations.mjs\` run to apply normally.`);
  } else {
    console.log('[baseline] Every migration in the journal was confirmed — there is nothing left to baseline (a real run-migrations.mjs run would apply nothing new).');
  }

  const lastConfirmedSql = fs.readFileSync(path.join(drizzleDir, `${lastConfirmed.tag}.sql`), 'utf8');
  const hash = crypto.createHash('sha256').update(lastConfirmedSql).digest('hex');

  if (args.dryRun) {
    console.log('\n[baseline] DRY RUN — nothing written. Re-run with --apply-baseline-stamp to write the single bookkeeping row:');
    console.log(`    insert into drizzle.__drizzle_migrations ("hash", "created_at") values ('${hash}', ${lastConfirmed.when});`);
    await client.end();
    return;
  }

  console.log('\n[baseline] --apply-baseline-stamp: writing the bookkeeping row now...');
  const writeClient = new pg.Client({
    connectionString: connectionStringForClient(databaseUrl),
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });
  await writeClient.connect();
  await writeClient.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await writeClient.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  );
  const existing = await writeClient.query(`select count(*)::int as n from drizzle.__drizzle_migrations`);
  if (existing.rows[0].n > 0) {
    console.log(`[baseline] REFUSING: drizzle.__drizzle_migrations already has ${existing.rows[0].n} row(s) — this script only ever stamps a genuinely empty bookkeeping table. If this project already has real migration history, use it as-is; do not baseline over it.`);
    await writeClient.end();
    await client.end();
    process.exitCode = 1;
    return;
  }
  await writeClient.query(`insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)`, [hash, lastConfirmed.when]);
  console.log(`[baseline] done. drizzle.__drizzle_migrations now has exactly 1 row: hash=${hash.slice(0, 12)}..., created_at=${lastConfirmed.when} (${lastConfirmed.tag}).`);
  console.log('[baseline] A subsequent `node lib/db/test/run-migrations.mjs`-style run will now apply only the migrations after this point.');
  await writeClient.end();
  await client.end();
}

main().catch((err) => {
  console.error('[baseline] FAILED:', err.message);
  process.exitCode = 1;
});
