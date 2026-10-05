#!/usr/bin/env node
// SUPER_ADMIN_SAFETY_GATE, phase 1: is the email the owner wants for the
// real Super Admin already present anywhere in the Mongo source?
//
//   node check-super-admin-email-collision.mjs --backup-manifest=<path>
//
// Run it yourself, in an interactive terminal. It:
//   1. checks the backup archive against its manifest's sha256;
//   2. asks for the email twice, without echoing it;
//   3. restores the backup into a throwaway local mongo:7 container
//      (127.0.0.1 only, backup folder mounted read-only);
//   4. compares in memory against every email-looking string in every
//      document of every collection (lib/email-collision.mjs);
//   5. removes the container, whatever happened.
// It prints exactly one line, SUPER_ADMIN_EMAIL_CONFLICT=YES or =NO, and
// never prints, logs, writes or passes on the command line the entered
// email or any source email. Errors name the step only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { parseStrictCliArgs } from './lib/cli-args.mjs';
import { extractEmailsDeep, formatResult, hasEmailConflict, isEmailShaped, normalizeEmail } from './lib/email-collision.mjs';

const CLI_SPEC = { flags: { 'backup-manifest': { type: 'string' } } };
const SOURCE_DATABASE = 'al-rahma';

class CheckError extends Error {}

function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Reads the backup manifest and re-hashes the archive. Returns its folder and file name. */
export function verifyBackupArchive(manifestPath) {
  if (!manifestPath || !fs.existsSync(manifestPath)) throw new CheckError('backup manifest not found');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.filePath || !/^[0-9a-f]{64}$/.test(String(manifest.sha256))) throw new CheckError('backup manifest has no filePath/sha256');
  if (!fs.existsSync(manifest.filePath)) throw new CheckError('the backup archive named by the manifest does not exist');
  const actual = crypto.createHash('sha256').update(fs.readFileSync(manifest.filePath)).digest('hex');
  if (actual !== manifest.sha256) throw new CheckError('the backup archive does not match its manifest sha256');
  return { dir: path.dirname(manifest.filePath), file: path.basename(manifest.filePath) };
}

/** Restores the archive into a fresh local container; returns { uri, remove() }. */
export async function restoreIntoThrowawayMongo({ dir, file }) {
  const name = `sa-email-check-${crypto.randomBytes(4).toString('hex')}`;
  const run = docker(['run', '-d', '--rm', '--name', name, '-p', '127.0.0.1::27017', '-v', `${dir.split(path.sep).join('/')}:/backup:ro`, 'mongo:7']);
  if (run.code !== 0) throw new CheckError('could not start the local mongo container');
  const remove = () => {
    docker(['rm', '-f', '-v', name]);
    const left = docker(['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}']);
    if (left.stdout.trim()) throw new CheckError('the local mongo container could not be removed');
  };
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      ready = docker(['exec', name, 'mongosh', '--quiet', '--eval', "print('ready')"]).stdout.includes('ready');
      if (!ready) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) throw new CheckError('the local mongo container did not become ready');
    const restore = docker(['exec', name, 'mongorestore', `--archive=/backup/${file}`, '--gzip', `--nsInclude=${SOURCE_DATABASE}.*`, '--quiet']);
    if (restore.code !== 0) throw new CheckError('mongorestore failed');
    const port = docker(['port', name, '27017/tcp']).stdout.trim().split('\n')[0].split(':').pop();
    if (!/^\d+$/.test(port)) throw new CheckError('could not find the local mongo port');
    return { uri: `mongodb://127.0.0.1:${port}/${SOURCE_DATABASE}`, remove };
  } catch (err) {
    remove();
    throw err;
  }
}

/** Every email-looking string in every document of every collection, normalized. */
export async function collectSourceEmails(uri) {
  const client = new mongoose.mongo.MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(SOURCE_DATABASE);
    const emails = new Set();
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of collections) {
      for await (const doc of db.collection(name).find({})) extractEmailsDeep(doc, emails);
    }
    return { emails, collections: collections.length };
  } finally {
    await client.close();
  }
}

/** The whole check without any terminal I/O: true when the email conflicts. */
export async function runCollisionCheck({ backupManifestPath, candidateEmail }) {
  if (!isEmailShaped(candidateEmail)) throw new CheckError('the entered value is not an email address');
  const archive = verifyBackupArchive(backupManifestPath);
  const mongo = await restoreIntoThrowawayMongo(archive);
  try {
    const { emails, collections } = await collectSourceEmails(mongo.uri);
    if (collections === 0) throw new CheckError('the restored backup has no collections');
    return hasEmailConflict(candidateEmail, emails);
  } finally {
    mongo.remove();
  }
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  let args;
  try {
    args = parseStrictCliArgs(process.argv.slice(2), CLI_SPEC);
  } catch (err) {
    throw new CheckError(`bad arguments: ${err.message}`);
  }
  if (!args['backup-manifest']) throw new CheckError('--backup-manifest=<path> is required');
  if (!process.stdin.isTTY) throw new CheckError('run this in an interactive terminal: the email is only ever read from the keyboard');
  const first = await askHidden('Super Admin email (not shown): ');
  const second = await askHidden('Same email again (not shown): ');
  if (normalizeEmail(first) !== normalizeEmail(second)) throw new CheckError('the two entries differ');
  const conflict = await runCollisionCheck({ backupManifestPath: args['backup-manifest'], candidateEmail: first });
  console.log(formatResult(conflict));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    // CheckError messages are fixed strings; anything else is reduced to its type.
    console.log(`SUPER_ADMIN_EMAIL_CHECK=ERROR (${err instanceof CheckError ? err.message : err.name ?? 'Error'})`);
    process.exitCode = 2;
  });
}
