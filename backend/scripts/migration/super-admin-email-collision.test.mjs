#!/usr/bin/env node
// check-super-admin-email-collision.mjs end to end on a SYNTHETIC backup:
// a disposable Mongo is seeded with fake documents, dumped to an archive
// with a manifest, and the checker's own restore -> compare -> cleanup
// path runs against that archive. Covers YES (account email, a contact
// email nested in a payment, a same-mailbox variant), NO, a tampered
// archive, and that no checker container is left behind.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCommand } from '../../../lib/db/test/orchestrator-lib.mjs';
import { runCollisionCheck, verifyBackupArchive } from './check-super-admin-email-collision.mjs';

const SUFFIX = crypto.randomBytes(4).toString('hex');
const SEED_NAME = `sa-email-seed-${SUFFIX}`;
const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-email-check-'));
const ARCHIVE = 'synthetic.archive.gz';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dockerPath = (p) => p.split(path.sep).join('/');

async function leftoverCheckerContainers() {
  const r = await runCommand('docker', ['ps', '-a', '--filter', 'name=sa-email-check-', '--format', '{{.Names}}']);
  return r.stdout.trim();
}

async function main() {
  console.log('=== SETUP: seeded disposable Mongo -> synthetic archive + manifest ===');
  const run = await runCommand('docker', ['run', '-d', '--rm', '--name', SEED_NAME, '-v', `${dockerPath(WORK_DIR)}:/out`, 'mongo:7']);
  if (run.code !== 0) throw new Error(`docker run failed: ${run.stderr}`);
  const manifestPath = path.join(WORK_DIR, 'synthetic.backup-manifest.json');
  try {
    for (let i = 0; i < 60; i++) {
      if ((await runCommand('docker', ['exec', SEED_NAME, 'mongosh', '--quiet', '--eval', "print('ready')"])).stdout.includes('ready')) break;
      await sleep(1000);
    }
    const seed = await runCommand('docker', ['exec', SEED_NAME, 'mongosh', '--quiet', 'al-rahma', '--eval', `
      db.users.insertMany([{ email: 'Learner.One@Example.org', name: 'Fixture One' }, { email: 'owner.person@gmail.com' }]);
      db.payments.insertOne({ amount: 10, customer: { email: 'payer@example.net' } });
      db.trialrequests.insertOne({ message: 'contact me at lead@example.io' });
      print('seeded');`]);
    assert.match(seed.stdout, /seeded/, seed.stderr);
    const dump = await runCommand('docker', ['exec', SEED_NAME, 'mongodump', '--db=al-rahma', `--archive=/out/${ARCHIVE}`, '--gzip', '--quiet']);
    assert.equal(dump.code, 0, dump.stderr);
  } finally {
    await runCommand('docker', ['rm', '-f', '-v', SEED_NAME]);
  }
  const archivePath = path.join(WORK_DIR, ARCHIVE);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  fs.writeFileSync(manifestPath, JSON.stringify({ filePath: archivePath, sha256, createdAt: new Date().toISOString() }));

  await test('verifyBackupArchive: the manifest hash matches the archive', () => {
    const v = verifyBackupArchive(manifestPath);
    assert.equal(v.file, ARCHIVE);
  });

  await test('an account email (any case) is a conflict: YES', async () => {
    assert.equal(await runCollisionCheck({ backupManifestPath: manifestPath, candidateEmail: '  learner.one@EXAMPLE.org' }), true);
  });

  await test('a non-account email nested in a payment, and a same-mailbox gmail variant, are conflicts: YES', async () => {
    assert.equal(await runCollisionCheck({ backupManifestPath: manifestPath, candidateEmail: 'payer@example.net' }), true);
    assert.equal(await runCollisionCheck({ backupManifestPath: manifestPath, candidateEmail: 'ownerperson+admin@googlemail.com' }), true);
  });

  await test('a dedicated admin address that appears nowhere: NO', async () => {
    assert.equal(await runCollisionCheck({ backupManifestPath: manifestPath, candidateEmail: 'academy-admin@example.com' }), false);
  });

  await test('free-text emails are found too (collectSourceEmails sees every collection)', async () => {
    assert.equal(await runCollisionCheck({ backupManifestPath: manifestPath, candidateEmail: 'lead@example.io' }), true);
  });

  await test('a tampered archive is refused before anything is restored', async () => {
    const tampered = path.join(WORK_DIR, 'tampered.backup-manifest.json');
    fs.writeFileSync(tampered, JSON.stringify({ filePath: archivePath, sha256: 'f'.repeat(64), createdAt: new Date().toISOString() }));
    await assert.rejects(runCollisionCheck({ backupManifestPath: tampered, candidateEmail: 'academy-admin@example.com' }), /does not match its manifest sha256/);
  });

  await test('a non-email entry is refused without echoing it', async () => {
    await assert.rejects(runCollisionCheck({ backupManifestPath: manifestPath, candidateEmail: 'secret-typo' }), (err) => !/secret-typo/.test(err.message));
  });

  await test('every checker container was removed', async () => {
    assert.equal(await leftoverCheckerContainers(), '');
  });

  console.log('\n=== CLEANUP ===');
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  const left = await runCommand('docker', ['ps', '-a', '--filter', `name=${SEED_NAME}`, '--format', '{{.Names}}']);
  console.log(left.stdout.trim() || (await leftoverCheckerContainers()) ? 'cleanup FAILED: containers left' : 'cleanup verified: all test containers absent.');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[test] harness crashed:', err);
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  process.exitCode = 1;
});
