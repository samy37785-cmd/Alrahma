#!/usr/bin/env node
// Owner-run, narrowly pinned schema-forward tool. With no flags it is a
// connection-free dry run. Apply mode can only move an exact 0000-0027
// target to exact 0000-0029, inside one locked transaction. It never runs
// a future migration, creates users/data, or changes DATA_BACKEND.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildPgPoolConfig } from '../../data/supabase/client.js';
import { readExpectedJournal } from './lib/supabase-state-report-core.mjs';
import {
  TOOL,
  readTailMigrations,
  runSchemaForwardCli,
} from './lib/supabase-schema-forward-0028-0029-core.mjs';
import { describeError, gitState, makeRedactor, makeTerminalIo } from './lib/operator-io.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LOCK_KEY = 282_900_229;

export function gitFreshness(repoRoot) {
  const git = gitState(repoRoot);
  let originMainSha = null;
  try {
    originMainSha = execFileSync('git', ['rev-parse', 'refs/remotes/origin/main'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    originMainSha = null;
  }
  return { ...git, originMainSha };
}

export function createDb(dbUrl) {
  const pool = new pg.Pool({ ...buildPgPoolConfig(dbUrl), max: 1 });
  const run = async ({ readOnly, lock }, fn) => {
    const client = await pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
      const mode = await client.query('show transaction_read_only');
      const actualReadOnly = mode.rows[0]?.transaction_read_only === 'on';
      if (actualReadOnly !== readOnly) throw new Error('transaction mode verification failed');
      await client.query(`SET LOCAL lock_timeout = '10s'`);
      await client.query(`SET LOCAL statement_timeout = '60s'`);
      if (lock) {
        await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
        await client.query('lock table drizzle.__drizzle_migrations in share row exclusive mode');
      }
      const out = await fn(client);
      await client.query(readOnly ? 'ROLLBACK' : 'COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
  return {
    readOnly: (fn) => run({ readOnly: true, lock: false }, fn),
    inTransaction: (fn) => run({ readOnly: false, lock: true }, fn),
    end: () => pool.end(),
  };
}

async function main() {
  const redactor = makeRedactor();
  const io = makeTerminalIo(redactor);
  try {
    const result = await runSchemaForwardCli({
      argv: process.argv.slice(2),
      env: process.env,
      io,
      redactor,
      deps: {
        gitState: () => gitFreshness(REPO_ROOT),
        expectedJournal: () => readExpectedJournal(REPO_ROOT),
        tailMigrations: (journal) => readTailMigrations(REPO_ROOT, journal),
        createDb,
      },
    });
    if (!['success', 'dry-run'].includes(result.status)) process.exitCode = 1;
  } catch (err) {
    process.stderr.write(`[${TOOL}] STOPPED ${describeError(err, redactor)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
