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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { verifyNoUnrecordedData, verifyLedgerPointsToRealTargets, verifyTeacherLinkProvenance, verifyLedgerRowIntegrity, verifyMigrationJournal } from './production-import-orchestrator.mjs';
import { MIGRATION_SEED_ADMIN_ID, MIGRATION_SEED_ADMIN_EMAIL, ensureMigrationSeedAdmin } from './lib/admin-rpc.mjs';
import { encodeCompositeTargetId } from './lib/composite-target-id.mjs';

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

      // PR #70 review round 9, item 1: MUST be the exact same
      // encodeCompositeTargetId() encoding and column ORDER
      // mongo-to-supabase.mjs's own document_counters.upsert() returns --
      // a wrong order here would prove the spec itself has drifted from
      // the real encoding, which is exactly what this assertion exists
      // to catch.
      await addLedgerEntry('document_counters', 'fake-mongo-id-3', encodeCompositeTargetId(['test_scope', 2099]));
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a row WITH a matching composite-key ledger entry (correct column order) must never be flagged');
    } finally {
      await client.query('DELETE FROM document_counters');
      await clearLedgerFor('document_counters');
      client.release();
    }
  });

  await test('composite shape, wrong column order: proves the identity comparison is order-sensitive, not accidentally order-agnostic', async () => {
    const client = await pgPool.connect();
    try {
      await client.query(`INSERT INTO document_counters (scope, year, seq) VALUES ('test_scope2', 2098, 0)`);
      // Deliberately swapped order (["2098","test_scope2"] instead of
      // ["test_scope2","2098"]) -- must NOT match, proving the check
      // really does compare the full, order-sensitive encoded identity,
      // not just "same values present".
      await addLedgerEntry('document_counters', 'fake-mongo-id-4', encodeCompositeTargetId([2098, 'test_scope2']));

      await assert.rejects(() => verifyNoUnrecordedData(client), /document_counters: 1 row\(s\) with no matching migration_source_ledger entry/);
    } finally {
      await client.query('DELETE FROM document_counters');
      await clearLedgerFor('document_counters');
      client.release();
    }
  });

  // PR #70 review round 9, item 1 -- the composite target_id encoding
  // bug (a plain `${a}:${b}` string is not reversible when a component
  // can itself contain ":", corrupting quran_bookmarks.verse_key values
  // like "2:255"). Proves the FIXED, JS-side composite comparison
  // (countUnrecordedComposite()/countGhostLedgerComposite() in
  // production-import-orchestrator.mjs) correctly handles a real
  // delimiter-containing composite value in BOTH directions, against a
  // real quran_bookmarks row (not a synthetic document_counters value
  // that happens never to contain a colon in practice).
  await test('composite shape with a delimiter INSIDE a component value (quran_bookmarks.verse_key="2:255"): Target -> Ledger', async () => {
    const client = await pgPool.connect();
    const userId = crypto.randomUUID();
    try {
      await insertAuthUser(userId, `quran-composite-${userId}@example.invalid`, {});
      // This test is about quran_bookmarks' own composite encoding, not
      // profile attribution -- ledger the profile too (same pattern the
      // parent_student_links test below uses) so verifyNoUnrecordedData's
      // OWN profiles check doesn't also flag this row as unattributed.
      await addLedgerEntry('profiles', `quran-composite-profile-${userId}`, userId, { sourceCollection: 'users' });
      await client.query(
        `INSERT INTO quran_bookmarks (user_id, verse_key, chapter_id, verse_num) VALUES ($1, '2:255', 2, 255)`,
        [userId]
      );

      await assert.rejects(() => verifyNoUnrecordedData(client), /quran_bookmarks: 1 row\(s\) with no matching migration_source_ledger entry/);

      await addLedgerEntry('quran_bookmarks', 'fake-mongo-id-verse', encodeCompositeTargetId([userId, '2:255']));
      const result = await verifyNoUnrecordedData(client);
      assert.equal(result, true, 'a row correctly ledgered with the new codec, whose composite value itself contains ":", must never be flagged');
    } finally {
      await client.query('DELETE FROM quran_bookmarks');
      await clearLedgerFor('quran_bookmarks');
      await clearLedgerFor('profiles');
      await deleteAuthUser(userId);
      client.release();
    }
  });

  await test('composite shape with a delimiter INSIDE a component value (quran_bookmarks.verse_key="2:255"): Ledger -> Target catches a ghost', async () => {
    const client = await pgPool.connect();
    const userId = crypto.randomUUID();
    try {
      await insertAuthUser(userId, `quran-composite-ghost-${userId}@example.invalid`, {});
      // No real quran_bookmarks row is ever inserted -- the ledger claims
      // one exists anyway, exactly the "target went missing" shape.
      await addLedgerEntry('quran_bookmarks', 'fake-mongo-id-ghost-verse', encodeCompositeTargetId([userId, '2:255']), { status: 'reconciled' });

      await assert.rejects(
        () => verifyLedgerPointsToRealTargets(client),
        /quran_bookmarks: 1 migration_source_ledger row\(s\) claim a target that no longer exists/
      );
    } finally {
      await clearLedgerFor('quran_bookmarks');
      await deleteAuthUser(userId);
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
      await clearLedgerFor('profiles');
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
      // Round 7, item 4: this ledger row's target_id (the just-deleted
      // auth.users/profiles id) would otherwise be flagged as a genuinely
      // missing target by verifyLedgerPointsToRealTargets() -- clean it up
      // like every other fixture in this file.
      await clearLedgerFor('profiles');
      client.release();
    }
  });

  await test('round 6: only the complete exact migration-seed admin identity is exempt; UUID/email collision fails closed', async () => {
    const client = await pgPool.connect();
    try {
      // PR #70 review round 7, item 7: ensureMigrationSeedAdmin() now
      // opens its own real transaction (BEGIN/COMMIT/ROLLBACK) -- it MUST
      // be called with a single checked-out client, never a bare Pool
      // (Pool.query() acquires/releases a connection per call, so BEGIN
      // and the writes that follow it could silently land on DIFFERENT
      // connections, breaking the very atomicity this function exists to
      // guarantee).
      await ensureMigrationSeedAdmin(client);
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
      await assert.rejects(() => ensureMigrationSeedAdmin(client), /collides with an incomplete or mismatched/);
    } finally {
      await deleteAuthUser(otherId);
      client.release();
    }
  });

  await test('round 6: exact id+email but profiles.role has been changed away from admin is a partial collision', async () => {
    const client = await pgPool.connect();
    try {
      await ensureMigrationSeedAdmin(client);
      assert.equal(await verifyNoUnrecordedData(client), true, 'setup: the real seed-admin identity is exempt before tampering');
      await pgPool.query(`UPDATE profiles SET role = 'user' WHERE id = $1`, [MIGRATION_SEED_ADMIN_ID]);
      await assert.rejects(() => verifyNoUnrecordedData(client), /seed-admin identity collides/);
      await assert.rejects(() => ensureMigrationSeedAdmin(client), /collides with an incomplete or mismatched/);
    } finally {
      await deleteAuthUser(MIGRATION_SEED_ADMIN_ID);
      client.release();
    }
  });

  await test('round 6: exact id+email+profiles.role=admin but no matching admin_role_assignments row is a partial collision', async () => {
    const client = await pgPool.connect();
    try {
      await ensureMigrationSeedAdmin(client);
      assert.equal(await verifyNoUnrecordedData(client), true, 'setup: the real seed-admin identity is exempt before tampering');
      await pgPool.query(`DELETE FROM admin_role_assignments WHERE user_id = $1`, [MIGRATION_SEED_ADMIN_ID]);
      await assert.rejects(() => verifyNoUnrecordedData(client), /seed-admin identity collides/);
      await assert.rejects(() => ensureMigrationSeedAdmin(client), /collides with an incomplete or mismatched/);
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
    const client = await pgPool.connect();
    try {
      await assert.rejects(() => ensureMigrationSeedAdmin(client), /collides with an incomplete or mismatched/);
      const row = await pgPool.query('SELECT email FROM auth.users WHERE id = $1', [MIGRATION_SEED_ADMIN_ID]);
      assert.equal(row.rows[0].email, 'foreign-identity@example.invalid', 'the foreign row must be untouched -- never overwritten into the seed identity');
    } finally {
      client.release();
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
      await clearLedgerFor('profiles');
      await clearLedgerFor('subscriptions');
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
      await addLedgerEntry('trial_requests', 'fake-mongo-id-wrongsystem', rowId, { sourceSystem: 'some_other_system', status: 'failed' });
      await assert.rejects(
        () => verifyNoUnrecordedData(client),
        /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/,
        'a ledger entry from a different source_system must never legitimize the target row'
      );

      // Confirm it's purely the source_system that's wrong: replace it with
      // a correctly-scoped entry for the same row and it now passes. (Round
      // 9, item 4: migration 0024 extends the target-attribution unique
      // index to also cover status='failed', so the wrong-scoped 'failed'
      // row above must be cleared first -- two different source documents,
      // even one merely 'failed', can no longer both claim the same
      // target_id at once; that is the exact loophole round 9 closes.)
      await clearLedgerFor('trial_requests');
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
      await addLedgerEntry('trial_requests', 'fake-mongo-id-wrongdb', rowId, { sourceDatabase: 'some-other-database', status: 'failed' });
      await assert.rejects(
        () => verifyNoUnrecordedData(client),
        /trial_requests: 1 row\(s\) with no matching migration_source_ledger entry/,
        'a ledger entry from a different source_database must never legitimize the target row'
      );

      // Round 9, item 4: clear the wrong-scoped 'failed' row before adding
      // the correctly-scoped one -- migration 0024 now includes 'failed' in
      // the target-attribution unique index, so both can no longer coexist
      // against the same target_id (see the source_system test above).
      await clearLedgerFor('trial_requests');
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

  // -----------------------------------------------------------------
  // PR #70 review round 7, item 4: "تحقق Target → Ledger وLedger → Target"
  // -- verifyNoUnrecordedData() above only ever checks the Target ->
  // Ledger direction. verifyLedgerPointsToRealTargets() checks the OTHER
  // direction: a ledger row claiming status='created'/'reconciled' with a
  // real target_id, where that target has since gone missing, must fail
  // closed -- and never trigger any attempt to recreate it.
  // -----------------------------------------------------------------

  await test('verifyLedgerPointsToRealTargets passes cleanly on a pristine schema', async () => {
    const client = await pgPool.connect();
    try {
      assert.equal(await verifyLedgerPointsToRealTargets(client), true);
    } finally {
      client.release();
    }
  });

  await test('round 7 item 4: a ledger row claiming a target that no longer exists fails closed (Ledger -> Target)', async () => {
    const client = await pgPool.connect();
    try {
      // No real trial_requests row was ever created for this ledger entry.
      await addLedgerEntry('trial_requests', 'ghost-mongo-id', '00000000-0000-4000-8000-00000000abcd', { status: 'created' });
      await assert.rejects(
        () => verifyLedgerPointsToRealTargets(client),
        /trial_requests: 1 migration_source_ledger row\(s\) claim a target that no longer exists/
      );
    } finally {
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  // Superseded by round 9, item 4 (see the dedicated section below): a
  // 'failed' row with a NON-NULL target_id that was never actually a real
  // target (never existed at all, same as one that existed and later went
  // missing) is now correctly detected, not silently exempted -- round
  // 8's original "failed is never checked" policy was the very loophole
  // round 9 item 4 closes. target_id = NULL (a failure that never reached
  // a target write at all) remains the one genuinely-exempt case.
  await test('round 9 item 4 (was round 7 item 4, now inverted): a "failed"-status ledger row pointing at a target_id that was never real IS flagged', async () => {
    const client = await pgPool.connect();
    try {
      await addLedgerEntry('trial_requests', 'documented-failure-mongo-id', '00000000-0000-4000-8000-00000000abce', { status: 'failed' });
      await assert.rejects(
        () => verifyLedgerPointsToRealTargets(client),
        /trial_requests: 1 migration_source_ledger row\(s\) claim a target that no longer exists/,
        'a failed row claiming a non-null target_id that is not a real row must be surfaced, same as any other dangling claim'
      );
    } finally {
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('round 7 item 4: a ledger row whose target genuinely still exists passes both directions', async () => {
    const client = await pgPool.connect();
    try {
      const r = await client.query(`INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'realtarget@example.invalid', 'new') RETURNING id`);
      await addLedgerEntry('trial_requests', 'real-mongo-id', r.rows[0].id, { status: 'reconciled' });
      assert.equal(await verifyNoUnrecordedData(client), true);
      assert.equal(await verifyLedgerPointsToRealTargets(client), true);
    } finally {
      await client.query('DELETE FROM trial_requests');
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('round 7 item 4/6: parent_student_links is covered by BOTH directions generically (composite identity)', async () => {
    const client = await pgPool.connect();
    const parentId = crypto.randomUUID();
    const studentId = crypto.randomUUID();
    try {
      await insertAuthUser(parentId, 'preflight-parent@example.invalid', { migrated_from: 'mongodb' });
      await addLedgerEntry('profiles', 'preflight-parent-mongo-id', parentId, { sourceCollection: 'users' });
      await insertAuthUser(studentId, 'preflight-child@example.invalid', { migrated_from: 'mongodb' });
      await addLedgerEntry('profiles', 'preflight-child-mongo-id', studentId, { sourceCollection: 'users' });

      // Target -> Ledger: a real link with NO ledger entry fails closed.
      await client.query('INSERT INTO parent_student_links (parent_id, student_id) VALUES ($1, $2)', [parentId, studentId]);
      await assert.rejects(() => verifyNoUnrecordedData(client), /parent_student_links: 1 row\(s\) with no matching migration_source_ledger entry/);

      // Ledger -> Target: a ledger entry claiming a link that does not
      // exist fails closed too (delete the real link, keep only a
      // dangling claim about it).
      await client.query('DELETE FROM parent_student_links');
      await addLedgerEntry('parent_student_links', 'preflight-parent-mongo-id:child:preflight-child-mongo-id', `${parentId}:${studentId}`, { status: 'reconciled' });
      await assert.rejects(
        () => verifyLedgerPointsToRealTargets(client),
        /parent_student_links: 1 migration_source_ledger row\(s\) claim a target that no longer exists/
      );

      // Happy path: both the link and its ledger entry genuinely match.
      await client.query('INSERT INTO parent_student_links (parent_id, student_id) VALUES ($1, $2)', [parentId, studentId]);
      assert.equal(await verifyNoUnrecordedData(client), true);
      assert.equal(await verifyLedgerPointsToRealTargets(client), true);
    } finally {
      await client.query('DELETE FROM parent_student_links WHERE parent_id = $1 OR student_id = $1', [parentId]).catch(() => {});
      await clearLedgerFor('parent_student_links');
      await clearLedgerFor('profiles');
      await deleteAuthUser(parentId);
      await deleteAuthUser(studentId);
      client.release();
    }
  });

  await test('round 7 item 6: profiles.teacher_id provenance -- both directions, dedicated check', async () => {
    const client = await pgPool.connect();
    const teacherId = crypto.randomUUID();
    const studentId = crypto.randomUUID();
    try {
      await insertAuthUser(teacherId, 'preflight-teacher@example.invalid', { migrated_from: 'mongodb' });
      await addLedgerEntry('profiles', 'preflight-teacher-mongo-id', teacherId, { sourceCollection: 'users' });
      await insertAuthUser(studentId, 'preflight-teacherstudent@example.invalid', { migrated_from: 'mongodb' });
      await addLedgerEntry('profiles', 'preflight-teacherstudent-mongo-id', studentId, { sourceCollection: 'users' });

      // Target -> Ledger: teacher_id set with no ledger entry fails closed.
      await pgPool.query('UPDATE profiles SET teacher_id = $2 WHERE id = $1', [studentId, teacherId]);
      await assert.rejects(() => verifyTeacherLinkProvenance(client), /profiles\.teacher_id: 1 row\(s\) with no matching migration_source_ledger entry/);

      // Ledger -> Target: a ledger entry claiming a teacher_id pair that
      // does not match the real column value fails closed too.
      await pgPool.query('UPDATE profiles SET teacher_id = NULL WHERE id = $1', [studentId]);
      await addLedgerEntry('profiles_teacher_link', 'preflight-teacherstudent-mongo-id', `${studentId}:${teacherId}`, { status: 'reconciled' });
      await assert.rejects(
        () => verifyTeacherLinkProvenance(client),
        /profiles_teacher_link ledger: 1 row\(s\) claim a teacher_id relationship that no longer exists/
      );

      // Happy path: both the column value and its ledger entry match.
      await pgPool.query('UPDATE profiles SET teacher_id = $2 WHERE id = $1', [studentId, teacherId]);
      assert.equal(await verifyTeacherLinkProvenance(client), true);
    } finally {
      await pgPool.query('UPDATE profiles SET teacher_id = NULL WHERE id = $1', [studentId]).catch(() => {});
      await clearLedgerFor('profiles_teacher_link');
      await clearLedgerFor('profiles');
      await deleteAuthUser(teacherId);
      await deleteAuthUser(studentId);
      client.release();
    }
  });

  // -----------------------------------------------------------------
  // Round 8, item 6: bidirectional ledger integrity, completed.
  // -----------------------------------------------------------------

  await test('verifyLedgerRowIntegrity passes cleanly on a pristine schema', async () => {
    const client = await pgPool.connect();
    try {
      assert.equal(await verifyLedgerRowIntegrity(client), true);
    } finally {
      client.release();
    }
  });

  await test('round 8, item 6: a malformed source_content_hash (not a 64-hex-char sha256 digest) is flagged', async () => {
    const client = await pgPool.connect();
    try {
      await addLedgerEntry('trial_requests', 'bad-hash-mongo-id', '00000000-0000-4000-8000-0000000000aa', { status: 'failed', contentHash: 'not-a-real-hash' });
      await assert.rejects(
        () => verifyLedgerRowIntegrity(client),
        /trial_requests: 1 ledger row\(s\) with a malformed source_content_hash/
      );
    } finally {
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('round 8, item 6: a source_collection this migration never actually uses for that target_table is flagged', async () => {
    const client = await pgPool.connect();
    try {
      // trial_requests is only ever written with source_collection ==
      // 'trial_requests' (the domain key) -- 'not_a_real_collection' is
      // exactly the shape a hand-inserted or corrupted row would have.
      await addLedgerEntry('trial_requests', 'bad-collection-mongo-id', '00000000-0000-4000-8000-0000000000bb', { status: 'failed', sourceCollection: 'not_a_real_collection' });
      await assert.rejects(
        () => verifyLedgerRowIntegrity(client),
        /trial_requests: 1 ledger row\(s\) have source_collection "not_a_real_collection"/
      );
    } finally {
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('round 8, item 6: profiles allows EITHER "users" or "adminusers" as source_collection -- both are real, legitimate cases', async () => {
    const client = await pgPool.connect();
    const userId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    try {
      await insertAuthUser(userId, 'preflight-ledger-integrity-user@example.invalid', { migrated_from: 'mongodb' });
      await addLedgerEntry('profiles', 'preflight-ledger-integrity-user-mongo-id', userId, { sourceCollection: 'users' });
      await insertAuthUser(adminId, 'preflight-ledger-integrity-admin@example.invalid', { migrated_from: 'mongodb' });
      await addLedgerEntry('profiles', 'preflight-ledger-integrity-admin-mongo-id', adminId, { sourceCollection: 'adminusers' });
      assert.equal(await verifyLedgerRowIntegrity(client), true);
    } finally {
      await clearLedgerFor('profiles');
      await deleteAuthUser(userId);
      await deleteAuthUser(adminId);
      client.release();
    }
  });

  // -------------------------------------------------------------------
  // Round 8, item 6: "created/reconciled يستلزمان target_id غير null"
  // and "ارفض أكثر من ledger attribution لنفس target" are now enforced
  // by migration 0023's own DB-level CHECK constraint and partial unique
  // index -- proven here as LIVE INSERT-REJECTION tests, the strongest
  // possible proof (the violating row cannot even be created, not merely
  // detected after the fact by an app-level scan).
  // -------------------------------------------------------------------

  await test('round 8, item 6 (DB constraint): a "created"/"reconciled" ledger row with target_id NULL is rejected by Postgres itself', async () => {
    await assert.rejects(
      () => addLedgerEntry('trial_requests', 'null-target-created', null, { status: 'created' }),
      /migration_source_ledger_created_reconciled_requires_target/
    );
    await assert.rejects(
      () => addLedgerEntry('trial_requests', 'null-target-reconciled', null, { status: 'reconciled' }),
      /migration_source_ledger_created_reconciled_requires_target/
    );
    await clearLedgerFor('trial_requests');
  });

  await test('round 8, item 6 (DB constraint): two DIFFERENT source documents both claiming the SAME (target_table, target_id) while created/reconciled is rejected by Postgres itself', async () => {
    const sharedTargetId = '00000000-0000-4000-8000-0000000000cc';
    await addLedgerEntry('trial_requests', 'dup-attribution-first', sharedTargetId, { status: 'created' });
    try {
      await assert.rejects(
        () => addLedgerEntry('trial_requests', 'dup-attribution-second', sharedTargetId, { status: 'created' }),
        /migration_source_ledger_target_attribution_unique/
      );
      // A DIFFERENT target_table sharing the same UUID string is fine --
      // the constraint is scoped per (target_table, target_id), not
      // target_id alone.
      await addLedgerEntry('system_config', 'dup-attribution-different-table', sharedTargetId, { status: 'created' });
    } finally {
      await clearLedgerFor('trial_requests');
      await clearLedgerFor('system_config');
    }
  });

  // -------------------------------------------------------------------
  // PR #70 review round 9, item 4: unifies the 'failed'-row policy.
  // Round 8's original design (directly above, superseded) exempted
  // 'failed' rows from BOTH the target-attribution unique index and the
  // Ledger -> Target liveness check. That was too broad: a 'failed' row
  // with a real target_id is a genuine, provisional attribution (kill-
  // window 3 proves the row it names is real), not a null claim.
  // Migration 0024 (0023 left byte-for-byte unmodified) extends the
  // partial unique index to also cover status='failed'; production-
  // import-orchestrator.mjs's verifyLedgerPointsToRealTargets() /
  // countGhostLedgerComposite() / verifyTeacherLinkProvenance() now also
  // check 'failed' rows' target_id against the real target. What does
  // NOT change: a 'failed' row with target_id = NULL (never reached a
  // target write) remains completely valid -- 0023's CHECK constraint
  // was never touched.
  // -------------------------------------------------------------------

  await test('round 9, item 4: a "failed" row with target_id = NULL remains valid (unchanged from round 8)', async () => {
    await addLedgerEntry('trial_requests', 'failed-null-target', null, { status: 'failed' });
    const client = await pgPool.connect();
    try {
      assert.equal(await verifyLedgerRowIntegrity(client), true);
      assert.equal(await verifyLedgerPointsToRealTargets(client), true, 'a NULL target_id is never a "missing target" -- there was never a target claimed at all');
    } finally {
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('round 9, item 4: a "failed" row whose OWN real target_id still exists (kill-window 3, not shared with anyone) is never flagged', async () => {
    const realTarget = await pgPool.query(`INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'failed-row-own-real-target@example.invalid', 'new') RETURNING id`);
    try {
      await addLedgerEntry('trial_requests', 'failed-own-target', realTarget.rows[0].id, { status: 'failed' });
      const client = await pgPool.connect();
      try {
        assert.equal(await verifyLedgerPointsToRealTargets(client), true, 'a failed row\'s own genuinely-still-live target must never be flagged as missing');
      } finally {
        client.release();
      }
    } finally {
      await pgPool.query('DELETE FROM trial_requests WHERE id = $1', [realTarget.rows[0].id]);
      await clearLedgerFor('trial_requests');
    }
  });

  await test('round 9, item 4 (NEW behavior): a "failed" row whose target_id points at a target that has since gone MISSING is now detected (was silently invisible under round 8\'s policy)', async () => {
    // Insert then immediately delete the target row out-of-band -- the
    // ledger row still claims it, with status='failed' and a real
    // target_id (exactly the kill-window-3 shape), but the row itself
    // is now genuinely gone.
    const goneTarget = await pgPool.query(`INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'failed-row-gone-target@example.invalid', 'new') RETURNING id`);
    const goneId = goneTarget.rows[0].id;
    await addLedgerEntry('trial_requests', 'failed-gone-target', goneId, { status: 'failed' });
    await pgPool.query('DELETE FROM trial_requests WHERE id = $1', [goneId]);

    const client = await pgPool.connect();
    try {
      await assert.rejects(
        () => verifyLedgerPointsToRealTargets(client),
        /trial_requests: 1 migration_source_ledger row\(s\) claim a target that no longer exists/,
        'a failed row\'s dangling target_id must now be surfaced, not silently ignored forever'
      );
    } finally {
      await clearLedgerFor('trial_requests');
      client.release();
    }
  });

  await test('round 9, item 4 (DB constraint via migration 0024): two DIFFERENT source documents cannot both claim the SAME target while ONE of them is "failed"', async () => {
    const realTarget = await pgPool.query(`INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'failed-vs-owner-target@example.invalid', 'new') RETURNING id`);
    const targetId = realTarget.rows[0].id;
    try {
      await addLedgerEntry('trial_requests', 'owning-row', targetId, { status: 'reconciled' });
      // A SECOND, unrelated source document's failed attempt references
      // that exact same target_id -- under round 8's policy this was
      // silently allowed (excluded from the unique index entirely);
      // under round 9's unified policy it must now be rejected by
      // Postgres itself, the same way a duplicate created/reconciled
      // attribution already was.
      await assert.rejects(
        () => addLedgerEntry('trial_requests', 'failed-same-target-as-owner', targetId, { status: 'failed' }),
        /migration_source_ledger_target_attribution_unique/
      );

      // And the reverse order: a 'failed' row claims the target FIRST,
      // then a second document tries to claim the SAME target as
      // created/reconciled -- must also be rejected.
      await pgPool.query('DELETE FROM migration_source_ledger WHERE target_table = $1', ['trial_requests']);
      await addLedgerEntry('trial_requests', 'failed-first', targetId, { status: 'failed' });
      await assert.rejects(
        () => addLedgerEntry('trial_requests', 'reconciled-second', targetId, { status: 'reconciled' }),
        /migration_source_ledger_target_attribution_unique/
      );
    } finally {
      await pgPool.query('DELETE FROM trial_requests WHERE id = $1', [targetId]);
      await clearLedgerFor('trial_requests');
    }
  });

  await test('round 9, item 4: two DIFFERENT "failed" rows claiming the same target are ALSO rejected (not just failed-vs-created/reconciled)', async () => {
    const realTarget = await pgPool.query(`INSERT INTO trial_requests (name, email, status) VALUES ('Test', 'failed-vs-failed-target@example.invalid', 'new') RETURNING id`);
    const targetId = realTarget.rows[0].id;
    try {
      await addLedgerEntry('trial_requests', 'failed-a', targetId, { status: 'failed' });
      await assert.rejects(
        () => addLedgerEntry('trial_requests', 'failed-b', targetId, { status: 'failed' }),
        /migration_source_ledger_target_attribution_unique/
      );
    } finally {
      await pgPool.query('DELETE FROM trial_requests WHERE id = $1', [targetId]);
      await clearLedgerFor('trial_requests');
    }
  });

  // -----------------------------------------------------------------
  // PR #70 review round 9, item 3: verifyMigrationJournal() used to
  // claim (in its own docstring) that it "compares by tag, not just
  // count" -- it actually only ever compared count(*) against the
  // journal's own entry count, so a same-length-but-different-set (or
  // reordered, or silently-edited-after-applying) target passed
  // completely undetected. Fixed to compare EXACT ordered identity: for
  // each journal entry, drizzle-orm's own sha256-of-file-content hash
  // and journal `when` timestamp, position-by-position against
  // drizzle.__drizzle_migrations ORDER BY id ASC (real application
  // order). Proven below against every required state: same count with
  // a different hash, a missing migration, an extra migration,
  // reordered migrations, and the correct state -- each against the
  // REAL __drizzle_migrations table this file's own setup populated via
  // the real drizzle-orm migrator (lib/db/test/run-migrations.mjs), not
  // a synthetic fixture table.
  // -----------------------------------------------------------------

  async function migrationsSnapshot() {
    const { rows } = await pgPool.query('SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC');
    return rows;
  }
  async function restoreMigrationsSnapshot(snapshot) {
    await pgPool.query('DELETE FROM drizzle.__drizzle_migrations');
    for (const row of snapshot) {
      await pgPool.query('INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES ($1,$2,$3)', [row.id, row.hash, row.created_at]);
    }
    await pgPool.query(`SELECT setval(pg_get_serial_sequence('drizzle.__drizzle_migrations', 'id'), (SELECT COALESCE(MAX(id), 1) FROM drizzle.__drizzle_migrations))`);
  }

  await test('round 9, item 3: verifyMigrationJournal passes cleanly on a freshly-migrated schema (correct state)', async () => {
    const client = await pgPool.connect();
    try {
      const result = await verifyMigrationJournal(client);
      assert.ok(result.expectedCount > 0, 'sanity: the journal must actually have entries');
      assert.equal(result.appliedCount, result.expectedCount);
    } finally {
      client.release();
    }
  });

  await test('round 9, item 3: same COUNT but a different hash at one position is caught (e.g. a migration file edited after being applied)', async () => {
    const snapshot = await migrationsSnapshot();
    try {
      const middle = snapshot[Math.floor(snapshot.length / 2)];
      await pgPool.query('UPDATE drizzle.__drizzle_migrations SET hash = $2 WHERE id = $1', [middle.id, 'f'.repeat(64)]);
      const client = await pgPool.connect();
      try {
        await assert.rejects(
          () => verifyMigrationJournal(client),
          /does not match this repo's journal entry/,
          'a hash mismatch at one position, with the total count unchanged, must still be caught'
        );
      } finally {
        client.release();
      }
    } finally {
      await restoreMigrationsSnapshot(snapshot);
    }
  });

  await test('round 9, item 3: a missing (deleted) migration is caught', async () => {
    const snapshot = await migrationsSnapshot();
    try {
      const last = snapshot[snapshot.length - 1];
      await pgPool.query('DELETE FROM drizzle.__drizzle_migrations WHERE id = $1', [last.id]);
      const client = await pgPool.connect();
      try {
        await assert.rejects(() => verifyMigrationJournal(client), /INCOMPLETE/);
      } finally {
        client.release();
      }
    } finally {
      await restoreMigrationsSnapshot(snapshot);
    }
  });

  await test('round 9, item 3: an extra (unexpected) migration is caught', async () => {
    const snapshot = await migrationsSnapshot();
    try {
      await pgPool.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', ['e'.repeat(64), Date.now()]);
      const client = await pgPool.connect();
      try {
        await assert.rejects(() => verifyMigrationJournal(client), /AHEAD/);
      } finally {
        client.release();
      }
    } finally {
      await restoreMigrationsSnapshot(snapshot);
    }
  });

  await test('round 9, item 3: two migrations applied in swapped/reordered positions are caught, even though the SET of hashes is unchanged', async () => {
    const snapshot = await migrationsSnapshot();
    try {
      assert.ok(snapshot.length >= 2, 'sanity: need at least two applied migrations to test reordering');
      const [a, b] = snapshot; // the two lowest ids -- positions 0 and 1
      // Swap their hash+created_at values (NOT their id/application-order
      // slot) -- position 0 now holds what used to be at position 1, and
      // vice versa. A naive "is this set of hashes present" check would
      // never notice; the real, order-sensitive comparison must.
      await pgPool.query('UPDATE drizzle.__drizzle_migrations SET hash = $2, created_at = $3 WHERE id = $1', [a.id, b.hash, b.created_at]);
      await pgPool.query('UPDATE drizzle.__drizzle_migrations SET hash = $2, created_at = $3 WHERE id = $1', [b.id, a.hash, a.created_at]);
      const client = await pgPool.connect();
      try {
        await assert.rejects(() => verifyMigrationJournal(client), /does not match this repo's journal entry/);
      } finally {
        client.release();
      }
    } finally {
      await restoreMigrationsSnapshot(snapshot);
    }
  });

  await test('round 9, item 3: restored to the exact original state, verifyMigrationJournal passes again', async () => {
    const client = await pgPool.connect();
    try {
      const result = await verifyMigrationJournal(client);
      assert.equal(result.appliedCount, result.expectedCount);
    } finally {
      client.release();
    }
  });

  await test('after all fixtures are cleaned up, the schema is pristine again', async () => {
    const client = await pgPool.connect();
    try {
      assert.equal(await verifyNoUnrecordedData(client), true);
      assert.equal(await verifyLedgerPointsToRealTargets(client), true);
      assert.equal(await verifyTeacherLinkProvenance(client), true);
      assert.equal(await verifyLedgerRowIntegrity(client), true);
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
