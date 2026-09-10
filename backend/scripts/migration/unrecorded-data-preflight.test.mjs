#!/usr/bin/env node
// Stage 2J-B Part H, review round 4, item 1 -- integration tests for
// verifyNoUnrecordedData(), against a REAL disposable Docker Postgres
// (no Mongo needed -- this preflight is Postgres-only). No mocks.
//
// Bug being proven fixed: verifyNoUnrecordedData() used to assume every
// LEDGER_BACKED_TARGET_TABLES entry has a plain `id` column and matched
// migration_source_ledger.target_id against `t.id::text` unconditionally
// -- wrong for system_config (pkColumn `key`) and every composite-key
// table (wishlists, hifz_progress, course_progress, quran_bookmarks,
// coupon_redemptions, document_counters), whose target_id is a
// ":"-joined string, never a real column value at all. Surfaced live
// (round 3) as `error: column t.id does not exist` the moment the full
// CLI/preflight path was exercised for real. Fixed via
// LEDGER_BACKED_TARGET_SPECS, an explicit per-table identity spec
// (default id / pkColumn / composite, with the exact same ":"-joined
// column order mongo-to-supabase.mjs's own upsert() functions use) --
// see that file's own comment for the full rationale.
//
// This file drives the REAL main preflight path (verifyNoUnrecordedData,
// imported directly -- production-import-orchestrator.mjs IS guarded
// with `if (process.argv[1] === fileURLToPath(import.meta.url))`, unlike
// mongo-to-supabase.mjs, so importing it here does not also run main()),
// never a workaround that calls runImport() directly instead, against
// every LEDGER_BACKED_TARGET_TABLES entry on a pristine schema, plus one
// deliberately unrecorded row for each of the three identity shapes.
//
// Review round 5 additions:
//   item 1 -- profiles/subscriptions moved from "must be completely
//     empty" to provenance-aware (migration-seed admin identity, or an
//     auth.users migrated_from tag). Tests below prove an attributable
//     row is never flagged and a genuinely unrelated/untagged row still
//     fails closed.
//   item 3 -- the ledger-backed check now also requires
//     source_system='mongodb' and source_database=SOURCE_DATABASE (not
//     just target_table+target_id). Tests below prove a ledger entry from
//     a different source system, a different source database, or a
//     different target table/identity never legitimizes an otherwise
//     unrecorded row.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { verifyNoUnrecordedData } from './production-import-orchestrator.mjs';
import { MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL, ensureMigrationSeedAdmin } from './lib/admin-rpc.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUN_MIGRATIONS = path.join(REPO_ROOT, 'lib', 'db', 'test', 'run-migrations.mjs');

const SUFFIX = crypto.randomBytes(4).toString('hex');
const PG_NAME = `stage2jb-h-unrecordedtest-pg-${SUFFIX}`;

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startDisposablePostgres() {
  const run = await runCommand('docker', [
    'run', '--rm', '-d', '--name', PG_NAME, '-e', 'POSTGRES_PASSWORD=postgres', '-p', '127.0.0.1::5432', 'postgres:17',
  ]);
  if (run.code !== 0) throw new Error(`docker run (postgres) failed: ${run.stderr}`);
  let port = null;
  for (let i = 0; i < 15; i++) {
    const p = await runCommand('docker', ['port', PG_NAME, '5432/tcp']);
    const m = p.stdout.trim().match(/:(\d+)\s*$/);
    if (p.code === 0 && m) { port = m[1]; break; }
    await sleep(500);
  }
  if (!port) throw new Error('could not discover Postgres host port');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const check = await runCommand('docker', ['exec', PG_NAME, 'pg_isready', '-U', 'postgres']);
    if (check.code === 0) return port;
    await sleep(500);
  }
  throw new Error('Postgres did not become ready in time');
}

async function main() {
  console.log('=== SETUP: disposable Postgres, schema applied ===');
  const pgPort = await startDisposablePostgres();
  const pgUri = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;

  const migrate = await runCommand(process.execPath, [RUN_MIGRATIONS], {
    env: { ...process.env, TEST_DATABASE_URL: pgUri },
  });
  if (migrate.code !== 0) throw new Error(`schema application failed: ${migrate.stderr}`);
  console.log('schema applied.');

  const pgPool = new pg.Pool({ connectionString: pgUri });

  async function addLedgerEntry(table, sourceId, targetId, {
    sourceSystem = 'mongodb', sourceDatabase = 'al-rahma', sourceCollection = table, status = 'reconciled', contentHash = 'a'.repeat(64),
  } = {}) {
    await pgPool.query(
      `INSERT INTO migration_source_ledger
         (source_system, source_database, source_collection, source_document_id, source_content_hash, target_table, status, target_id, migrated_at)
       VALUES ($4, $5, $6, $2, $7, $1, $8, $3, now())`,
      [table, sourceId, targetId, sourceSystem, sourceDatabase, sourceCollection, contentHash, status]
    );
  }
  async function clearLedgerFor(table) {
    await pgPool.query(`DELETE FROM migration_source_ledger WHERE target_table = $1`, [table]);
  }

  // -----------------------------------------------------------------
  // Pristine schema -- exercises the real SQL for EVERY
  // LEDGER_BACKED_TARGET_SPECS entry (all 26 tables, all three identity
  // shapes among them) in one call. If any single table's identity
  // expression were syntactically or referentially wrong (the exact
  // class of bug being fixed here), this call would throw a Postgres
  // error even with zero rows in every table.
  // -----------------------------------------------------------------

  await test('verifyNoUnrecordedData passes cleanly on a pristine (freshly-migrated, all-empty) schema -- every table, every identity shape', async () => {
    const client = await pgPool.connect();
    try {
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true);
    } finally {
      client.release();
    }
  });

  // -----------------------------------------------------------------
  // One unrecorded row per identity shape.
  // -----------------------------------------------------------------

  await test('default `id` shape (trial_requests): an unrecorded row is caught; a correctly-ledgered one is not', async () => {
    const client = await pgPool.connect();
    try {
      const r = await client.query(
        `INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'unrecorded@example.invalid', 'new') RETURNING id`
      );
      const rowId = r.rows[0].id;

      await assert.rejects(() => verifyNoUnrecordedData(client), /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/);

      await addLedgerEntry('trial_requests', 'fake-mongo-id-1', rowId);
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a row WITH a matching ledger entry must never be flagged');
    } finally {
      await client.query('DELETE FROM trial_requests');
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('a planned-only ledger row is not valid target provenance even when target_id happens to match', async () => {
    const client = await pgPool.connect();
    try {
      const r = await client.query(
        `INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'planned-only@example.invalid', 'new') RETURNING id`
      );
      await addLedgerEntry('trial_requests', 'planned-only-source', r.rows[0].id, { status: 'planned' });
      await assert.rejects(() => verifyNoUnrecordedData(client), /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/);
    } finally {
      await client.query('DELETE FROM trial_requests');
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('pkColumn shape (system_config.key): an unrecorded row is caught; a correctly-ledgered one is not', async () => {
    const client = await pgPool.connect();
    try {
      await client.query(`INSERT INTO system_config (key, value) VALUES ('test_unrecorded_key', 'x')`);

      await assert.rejects(() => verifyNoUnrecordedData(client), /system_config: 1 row\(s\) with no matching migration_source_ledger entry/);

      await addLedgerEntry('system_config', 'fake-mongo-id-2', 'test_unrecorded_key');
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a row WITH a matching ledger entry (matched via pkColumn, not `id`) must never be flagged');
    } finally {
      await client.query('DELETE FROM system_config');
      await clearLedgerFor('system_config');
      client.release();
    }
  });

  await test('composite shape (document_counters.scope:year): an unrecorded row is caught; a correctly-ledgered one is not', async () => {
    const client = await pgPool.connect();
    try {
      await client.query(`INSERT INTO document_counters (scope, year, seq) VALUES ('test_scope', 2099, 0)`);

      await assert.rejects(() => verifyNoUnrecordedData(client), /document_counters: 1 row\(s\) with no matching migration_source_ledger entry/);

      // MUST be the exact same ":"-joined encoding and column ORDER
      // mongo-to-supabase.mjs's own document_counters.upsert() returns
      // (`${row.scope}:${row.year}`) -- a wrong order here would prove
      // the spec itself has drifted from the real encoding, which is
      // exactly what this assertion exists to catch.
      await addLedgerEntry('document_counters', 'fake-mongo-id-3', 'test_scope:2099');
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a row WITH a matching composite-key ledger entry (correct column order) must never be flagged');
    } finally {
      await client.query('DELETE FROM document_counters');
      await clearLedgerFor('document_counters');
      client.release();
    }
  });

  await test('composite shape, wrong column order: proves the identity expression is order-sensitive, not accidentally order-agnostic', async () => {
    const client = await pgPool.connect();
    try {
      await client.query(`INSERT INTO document_counters (scope, year, seq) VALUES ('test_scope2', 2098, 0)`);
      // Deliberately swapped order ("year:scope" instead of "scope:year")
      // -- must NOT match, proving the check really does compare the
      // full, order-sensitive string, not just "same values present".
      await addLedgerEntry('document_counters', 'fake-mongo-id-4', '2098:test_scope2');

      await assert.rejects(() => verifyNoUnrecordedData(client), /document_counters: 1 row\(s\) with no matching migration_source_ledger entry/);
    } finally {
      await client.query('DELETE FROM document_counters');
      await clearLedgerFor('document_counters');
      client.release();
    }
  });

  // -----------------------------------------------------------------
  // Review round 5, item 1: profiles/subscriptions used to require the
  // table be completely empty -- this broke every resume, broke
  // --compensate, and could be tripped by nothing more than
  // ensureMigrationSeedAdmin()'s own seed-admin profile row. Fixed:
  // provenance-aware -- a profiles row is allowed iff it IS the
  // migration-seed admin identity OR its owning auth.users row carries a
  // migrated_from tag; a subscriptions row is allowed iff its owning
  // profile satisfies the same test. Genuinely unattributed rows must
  // still fail closed.
  // -----------------------------------------------------------------

  async function insertAuthUser(id, email, rawUserMetaData) {
    await pgPool.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
      [id, email, JSON.stringify(rawUserMetaData ?? {})]
    );
  }
  async function deleteAuthUser(id) {
    // profiles.id -> auth.users(id) ON DELETE CASCADE, and
    // subscriptions.user_id -> profiles.id ON DELETE CASCADE -- one
    // delete here cleans up everything this helper created.
    await pgPool.query('DELETE FROM auth.users WHERE id = $1', [id]);
  }

  await test('round 6: a spoofed migrated_from=mongodb tag without source ledger provenance fails closed', async () => {
    const client = await pgPool.connect();
    const id = crypto.randomUUID();
    try {
      await insertAuthUser(id, 'tagged-user@example.invalid', { migrated_from: 'mongodb', migrated_at: new Date().toISOString() });
      await assert.rejects(() => verifyNoUnrecordedData(client), /profiles: 1 row\(s\) not attributable/);
    } finally {
      await deleteAuthUser(id);
      client.release();
    }
  });

  await test('round 6: a profile ledger entry from a different source database does not legitimize the profile', async () => {
    const client = await pgPool.connect();
    const id = crypto.randomUUID();
    try {
      await insertAuthUser(id, 'wrong-source-profile@example.invalid', { migrated_from: 'mongodb' });
      await addLedgerEntry('profiles', 'mongo-user-wrong-db', id, { sourceDatabase: 'other-database', sourceCollection: 'users' });
      await assert.rejects(() => verifyNoUnrecordedData(client), /profiles: 1 row\(s\) not attributable/);
    } finally {
      await deleteAuthUser(id);
      client.release();
    }
  });

  await test('round 6: a correctly source-scoped, hash-bearing profile ledger entry is attributable', async () => {
    const client = await pgPool.connect();
    const id = crypto.randomUUID();
    try {
      await insertAuthUser(id, 'ledgered-profile@example.invalid', {});
      await addLedgerEntry('profiles', 'mongo-user-1', id, { sourceCollection: 'users' });
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true);
    } finally {
      await deleteAuthUser(id);
      client.release();
    }
  });

  await test('round 6: only the complete exact migration-seed admin identity is exempt; UUID/email collision fails closed', async () => {
    const client = await pgPool.connect();
    try {
      await ensureMigrationSeedAdmin(pgPool);
      assert.equal(await verifyNoUnrecordedData(client), true);
      await deleteAuthUser(MIGRATION_SEED_ADMIN_ID);
      await insertAuthUser(MIGRATION_SEED_ADMIN_ID, 'collision@example.invalid', {});
      await assert.rejects(() => verifyNoUnrecordedData(client), /seed-admin identity collides/);
    } finally {
      await deleteAuthUser(MIGRATION_SEED_ADMIN_ID);
      await pgPool.query('DELETE FROM auth.users WHERE email = $1', [MIGRATION_SEED_ADMIN_EMAIL]);
      client.release();
    }
  });

  // Round 6 (PR #70 blockers, item 3): "الهوية الصحيحة والاصطدامات الجزئية
  // والكاملة" -- the ONE collision variant above (reserved UUID, wrong
  // email) is not the only way an incomplete/mismatched identity can occur.
  // Each case below plants a DIFFERENT kind of partial match and proves
  // verifyNoUnrecordedData() (and, separately, ensureMigrationSeedAdmin()
  // itself) still fails closed rather than treating "close enough" as the
  // exempted seed identity.
  await test('round 6: the reserved seed-admin EMAIL under a DIFFERENT uuid is a collision too, not just the reverse', async () => {
    const client = await pgPool.connect();
    const otherId = crypto.randomUUID();
    try {
      await insertAuthUser(otherId, MIGRATION_SEED_ADMIN_EMAIL, {});
      await assert.rejects(() => verifyNoUnrecordedData(client), /seed-admin identity collides/);
      await assert.rejects(() => ensureMigrationSeedAdmin(pgPool), /collides with an incomplete or mismatched/);
    } finally {
      await deleteAuthUser(otherId);
      client.release();
    }
  });

  await test('round 6: exact id+email but profiles.role has been changed away from admin is a partial collision', async () => {
    const client = await pgPool.connect();
    try {
      await ensureMigrationSeedAdmin(pgPool);
      assert.equal(await verifyNoUnrecordedData(client), true, 'setup: the real seed-admin identity is exempt before tampering');
      await pgPool.query(`UPDATE profiles SET role = 'user' WHERE id = $1`, [MIGRATION_SEED_ADMIN_ID]);
      await assert.rejects(() => verifyNoUnrecordedData(client), /seed-admin identity collides/);
      await assert.rejects(() => ensureMigrationSeedAdmin(pgPool), /collides with an incomplete or mismatched/);
    } finally {
      await deleteAuthUser(MIGRATION_SEED_ADMIN_ID);
      client.release();
    }
  });

  await test('round 6: exact id+email+profiles.role=admin but no matching admin_role_assignments row is a partial collision', async () => {
    const client = await pgPool.connect();
    try {
      await ensureMigrationSeedAdmin(pgPool);
      assert.equal(await verifyNoUnrecordedData(client), true, 'setup: the real seed-admin identity is exempt before tampering');
      await pgPool.query(`DELETE FROM admin_role_assignments WHERE user_id = $1`, [MIGRATION_SEED_ADMIN_ID]);
      await assert.rejects(() => verifyNoUnrecordedData(client), /seed-admin identity collides/);
      await assert.rejects(() => ensureMigrationSeedAdmin(pgPool), /collides with an incomplete or mismatched/);
    } finally {
      await deleteAuthUser(MIGRATION_SEED_ADMIN_ID);
      client.release();
    }
  });

  await test('round 6: ensureMigrationSeedAdmin never uses ON CONFLICT to convert a conflicting identity into the seed admin', async () => {
    // A row that already holds the reserved UUID with a foreign email must
    // stay exactly as it was -- ensureMigrationSeedAdmin() must throw
    // BEFORE its own INSERT .. ON CONFLICT DO NOTHING is ever reached, not
    // silently leave the foreign row in place while reporting success, and
    // never overwrite it into the seed identity either.
    await insertAuthUser(MIGRATION_SEED_ADMIN_ID, 'foreign-identity@example.invalid', {});
    try {
      await assert.rejects(() => ensureMigrationSeedAdmin(pgPool), /collides with an incomplete or mismatched/);
      const row = await pgPool.query('SELECT email FROM auth.users WHERE id = $1', [MIGRATION_SEED_ADMIN_ID]);
      assert.equal(row.rows[0].email, 'foreign-identity@example.invalid', 'the foreign row must be untouched -- never overwritten into the seed identity');
    } finally {
      await deleteAuthUser(MIGRATION_SEED_ADMIN_ID);
    }
  });

  await test('round 5 item 1: an UNTAGGED, unrelated profiles row still fails closed', async () => {
    const client = await pgPool.connect();
    const id = crypto.randomUUID();
    try {
      // No migrated_from tag, not the seed-admin identity -- this is
      // exactly the "unknown pre-existing row" case that must remain
      // rejected no matter which mode (fresh/resume/compensate) is about
      // to run.
      await insertAuthUser(id, 'unrelated-preexisting@example.invalid', {});
      await assert.rejects(
        () => verifyNoUnrecordedData(client),
        /profiles: 1 row\(s\) not attributable to this migration/,
        'an untagged, non-seed-admin profiles row must still fail closed'
      );
    } finally {
      await deleteAuthUser(id);
      client.release();
    }
  });

  await test('round 6: an unknown subscription owned by a ledger-attributed profile still fails; its own ledger is required', async () => {
    const client = await pgPool.connect();
    const taggedId = crypto.randomUUID();
    const untaggedId = crypto.randomUUID();
    try {
      await insertAuthUser(taggedId, 'sub-tagged@example.invalid', { migrated_from: 'mongodb' });
      await addLedgerEntry('profiles', 'mongo-sub-owner', taggedId, { sourceCollection: 'users' });
      await pgPool.query(
        `INSERT INTO subscriptions (user_id, provider, status) VALUES ($1, 'manual', 'expired') RETURNING id`,
        [taggedId]
      );
      await assert.rejects(() => verifyNoUnrecordedData(client), /subscriptions: 1 row\(s\) not attributable/);

      const subscription = await pgPool.query('SELECT id FROM subscriptions WHERE user_id = $1', [taggedId]);
      await addLedgerEntry('subscriptions', 'mongo-sub-owner', subscription.rows[0].id, { sourceCollection: 'users' });
      assert.equal(await verifyNoUnrecordedData(client), true, 'subscription passes only with its own exact source ledger row');

      await insertAuthUser(untaggedId, 'sub-untagged@example.invalid', {});
      await pgPool.query(
        `INSERT INTO subscriptions (user_id, provider, status) VALUES ($1, 'manual', 'expired')`,
        [untaggedId]
      );
      await assert.rejects(
        () => verifyNoUnrecordedData(client),
        /profiles: 1 row\(s\) not attributable to this migration/,
        'a subscription owned by an untagged, non-seed-admin profile must fail closed'
      );
    } finally {
      await deleteAuthUser(taggedId);
      await deleteAuthUser(untaggedId);
      client.release();
    }
  });

  // -----------------------------------------------------------------
  // Review round 5, item 3: the ledger-backed NOT EXISTS check used to
  // match purely on target_table + target_id, with no source_system/
  // source_database scoping -- an unrelated migration_source_ledger
  // record from a different source system or database could
  // coincidentally legitimize an otherwise-unrecorded target row just by
  // sharing the same target_table/target_id. Each test below plants
  // exactly that kind of "wrong source" ledger entry and proves the real
  // row is STILL flagged unrecorded -- it must never be silently accepted
  // as this migration's own bookkeeping.
  // -----------------------------------------------------------------

  await test('round 5 item 3: a ledger entry from a DIFFERENT source_system never legitimizes a target row', async () => {
    const client = await pgPool.connect();
    try {
      const r = await client.query(
        `INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'wrongsystem@example.invalid', 'new') RETURNING id`
      );
      const rowId = r.rows[0].id;

      // Same target_table/target_id, but source_system is NOT 'mongodb' --
      // must not match.
      await addLedgerEntry('trial_requests', 'fake-mongo-id-wrongsystem', rowId, { sourceSystem: 'some_other_system' });
      await assert.rejects(
        () => verifyNoUnrecordedData(client),
        /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/,
        'a ledger entry from a different source_system must never legitimize the target row'
      );

      // Confirm it's purely the source_system that's wrong: add a SECOND,
      // correctly-scoped entry for the same row and it now passes.
      await addLedgerEntry('trial_requests', 'fake-mongo-id-wrongsystem-correct', rowId);
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a correctly-scoped mongodb/al-rahma ledger entry for the same row must legitimize it');
    } finally {
      await client.query('DELETE FROM trial_requests');
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('round 5 item 3: a ledger entry from a DIFFERENT source_database never legitimizes a target row', async () => {
    const client = await pgPool.connect();
    try {
      const r = await client.query(
        `INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'wrongdb@example.invalid', 'new') RETURNING id`
      );
      const rowId = r.rows[0].id;

      // Right source_system (mongodb), but a DIFFERENT source_database --
      // e.g. a hypothetical other Mongo database migrated by different
      // tooling -- must not match.
      await addLedgerEntry('trial_requests', 'fake-mongo-id-wrongdb', rowId, { sourceDatabase: 'some-other-database' });
      await assert.rejects(
        () => verifyNoUnrecordedData(client),
        /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/,
        'a ledger entry from a different source_database must never legitimize the target row'
      );

      await addLedgerEntry('trial_requests', 'fake-mongo-id-wrongdb-correct', rowId);
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a correctly-scoped mongodb/al-rahma ledger entry for the same row must legitimize it');
    } finally {
      await client.query('DELETE FROM trial_requests');
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('round 5 item 3: a ledger entry for a DIFFERENT target table/identity never legitimizes an unrelated row', async () => {
    const client = await pgPool.connect();
    try {
      const r1 = await client.query(
        `INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'righttable@example.invalid', 'new') RETURNING id`
      );
      const r2 = await client.query(`INSERT INTO system_config (key, value) VALUES ('test_wrongtarget_key', 'x') RETURNING key`);
      const trialRowId = r1.rows[0].id;

      // A correctly-scoped (mongodb/al-rahma) ledger entry, but for a
      // DIFFERENT target_table (system_config, not trial_requests) --
      // must not legitimize the trial_requests row.
      await addLedgerEntry('system_config', 'fake-mongo-id-wrongtarget', 'test_wrongtarget_key');
      await assert.rejects(
        () => verifyNoUnrecordedData(client),
        /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/,
        'a ledger entry recorded against a different target table must never legitimize this one'
      );

      // Same target_table (trial_requests), but a DIFFERENT target_id
      // (some other row's UUID, never this one's) -- must also not match.
      await addLedgerEntry('trial_requests', 'fake-mongo-id-wrongid', '00000000-0000-4000-8000-000000000000');
      await assert.rejects(
        () => verifyNoUnrecordedData(client),
        /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/,
        'a ledger entry pointing at a different target_id must never legitimize this row'
      );

      await addLedgerEntry('trial_requests', 'fake-mongo-id-righttarget', trialRowId);
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a ledger entry that genuinely matches this row\'s own table+id must legitimize it');
    } finally {
      await client.query('DELETE FROM trial_requests');
      await client.query(`DELETE FROM system_config WHERE key = 'test_wrongtarget_key'`);
      await clearLedgerFor('trial_requests');
      await clearLedgerFor('system_config');
      client.release();
    }
  });

  await test('after all fixtures are cleaned up, the schema is pristine again', async () => {
    const client = await pgPool.connect();
    try {
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true);
    } finally {
      client.release();
    }
  });

  await pgPool.end();

  console.log('\n=== CLEANUP ===');
  await runCommand('docker', ['rm', '-f', PG_NAME]);
  const pgGone = await runCommand('docker', ['ps', '-a', '--filter', `name=^${PG_NAME}$`, '--format', '{{.Names}}']);
  if (pgGone.stdout.trim()) {
    console.error('CRITICAL: cleanup not verified -- the test container is still present');
    process.exitCode = 1;
  } else {
    console.log('cleanup verified: test container absent.');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('[unrecorded-data-preflight.test] harness crashed:', err);
  await runCommand('docker', ['rm', '-f', PG_NAME]).catch(() => {});
  process.exitCode = 1;
});
