// Real, end-to-end test of both fresh-start seed scripts against a
// disposable local Postgres — the actual scripts run as child processes,
// not a reimplementation. Never touches the real Supabase project.
import pg from 'pg';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { createLocalAuthUsersStub, createLocalAuthRolesAndFunctions } from '../../../lib/db/test/local-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..', '..');
const repoRoot = path.join(backendRoot, '..');
const drizzleDir = path.join(repoRoot, 'lib', 'db', 'drizzle');
const seedTeachersScript = path.join(__dirname, 'seed-teachers.mjs');
const seedCoursesScript = path.join(__dirname, 'seed-courses.mjs');

const PG_IMAGE = 'postgres:16';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function startDisposablePostgres(dbName) {
  const containerName = `alrahma-freshseed-test-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(24).toString('hex');
  const run = await runCommand('docker', [
    'run', '--rm', '-d', '--name', containerName,
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${dbName}`,
    '-p', '127.0.0.1::5432', PG_IMAGE,
  ]);
  if (run.code !== 0) throw new Error(`docker run failed: ${run.stderr}`);
  let hostPort = null;
  for (let i = 0; i < 10; i++) {
    const portResult = await runCommand('docker', ['port', containerName, '5432/tcp']);
    const match = portResult.stdout.trim().match(/:(\d+)\s*$/);
    if (portResult.code === 0 && match) { hostPort = match[1]; break; }
    await sleep(500);
  }
  if (!hostPort) throw new Error('could not discover host port');
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    const check = await runCommand('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', dbName]);
    if (check.code === 0) { ready = true; break; }
    await sleep(1000);
  }
  if (!ready) throw new Error('postgres did not become ready');
  return { containerName, url: `postgres://postgres:${password}@127.0.0.1:${hostPort}/${dbName}` };
}

async function stopDisposablePostgres(containerName) {
  await runCommand('docker', ['stop', containerName]).catch(() => {});
}

async function applyMigrations(pool) {
  const fs = await import('node:fs');
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta', '_journal.json'), 'utf8'));
  for (const entry of journal.entries) {
    const sql = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) await pool.query(stmt);
  }
}

test('seed-courses: dry-run writes nothing, --apply inserts every entry as published=false, a second --apply run is idempotent (no duplicates)', async () => {
  const { containerName, url } = await startDisposablePostgres('alrahma_freshseed_courses');
  try {
    const pool = new pg.Pool({ connectionString: url });
    await createLocalAuthUsersStub(pool);
    await createLocalAuthRolesAndFunctions(pool);
    await applyMigrations(pool);

    const dry = await runCommand(process.execPath, [seedCoursesScript, '--database-url', url]);
    assert.equal(dry.code, 0, dry.stderr);
    const afterDry = await pool.query('select count(*)::int as n from courses');
    assert.equal(afterDry.rows[0].n, 0, 'dry run must not write anything');

    const apply1 = await runCommand(process.execPath, [seedCoursesScript, '--database-url', url, '--apply']);
    assert.equal(apply1.code, 0, apply1.stderr);
    const afterApply1 = await pool.query('select count(*)::int as n, count(*) filter (where published = false)::int as unpublished from courses');
    assert.ok(afterApply1.rows[0].n > 0, 'expected at least one course inserted');
    assert.equal(afterApply1.rows[0].n, afterApply1.rows[0].unpublished, 'every seeded course must be published=false');
    const countAfterFirst = afterApply1.rows[0].n;

    const apply2 = await runCommand(process.execPath, [seedCoursesScript, '--database-url', url, '--apply']);
    assert.equal(apply2.code, 0, apply2.stderr);
    assert.match(apply2.stdout, /skipped \(already exists\): /);
    const afterApply2 = await pool.query('select count(*)::int as n from courses');
    assert.equal(afterApply2.rows[0].n, countAfterFirst, 'a second --apply run must not create duplicates');

    await pool.end();
  } finally {
    await stopDisposablePostgres(containerName);
  }
});

test('seed-teachers: requires --mapping, skips a teacher missing from the mapping, skips a mapped teacher with no matching account yet, updates a real match, and is idempotent', async () => {
  const { containerName, url } = await startDisposablePostgres('alrahma_freshseed_teachers');
  try {
    const pool = new pg.Pool({ connectionString: url });
    await createLocalAuthUsersStub(pool);
    await createLocalAuthRolesAndFunctions(pool);
    await applyMigrations(pool);

    // teachers.js id 1 is "Sami Mahmoud Abd Al-Aal" — create a real local
    // account for exactly that one teacher, matching by email.
    const realTeacherId = crypto.randomUUID();
    const email = 'sami-real-account@example.test';
    await pool.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`, [realTeacherId, email]);

    const noArgs = await runCommand(process.execPath, [seedTeachersScript, '--database-url', url]);
    assert.notEqual(noArgs.code, 0, 'must refuse to run without --mapping');

    const fs = await import('node:fs');
    const os = await import('node:os');
    const mappingPath = path.join(os.tmpdir(), `teacher-mapping-${crypto.randomUUID()}.json`);
    fs.writeFileSync(mappingPath, JSON.stringify({
      '1': email, // real match
      '5': 'nobody-has-this-account-yet@example.test', // mapped, but no profiles row for that email
      // id 10 and every other teacher: deliberately absent from the mapping
    }));

    const apply1 = await runCommand(process.execPath, [seedTeachersScript, '--database-url', url, '--mapping', mappingPath, '--apply']);
    assert.equal(apply1.code, 0, apply1.stderr);
    assert.match(apply1.stdout, /UPDATE\s+teachers\.js id=1/);
    assert.match(apply1.stdout, /SKIP\s+teachers\.js id=5.*no profiles row exists/);
    assert.match(apply1.stdout, /SKIP\s+teachers\.js id=10.*no email in the supplied mapping/);

    const row = await pool.query('select is_teacher, name, specialization, gender, languages, subjects from profiles where id = $1', [realTeacherId]);
    assert.equal(row.rows[0].is_teacher, true);
    assert.equal(row.rows[0].name, 'Sami Mahmoud Abd Al-Aal');
    assert.equal(row.rows[0].gender, 'male');
    assert.deepEqual(row.rows[0].subjects, ['tajweed', 'hifz', 'ijazah', 'tafsir', 'quran']);

    const apply2 = await runCommand(process.execPath, [seedTeachersScript, '--database-url', url, '--mapping', mappingPath, '--apply']);
    assert.equal(apply2.code, 0, apply2.stderr);
    const rowAfterSecond = await pool.query('select name from profiles where id = $1', [realTeacherId]);
    assert.equal(rowAfterSecond.rows[0].name, 'Sami Mahmoud Abd Al-Aal', 'a second run must leave the same, correct end state (idempotent)');

    fs.unlinkSync(mappingPath);
    await pool.end();
  } finally {
    await stopDisposablePostgres(containerName);
  }
});
