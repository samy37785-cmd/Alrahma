#!/usr/bin/env node
// Ops tool: a READ-ONLY report of a Supabase project's migration/schema
// state and its auth accounts (invite state, admin role rows), for the owner
// to run and paste back. Run it yourself, in an interactive PowerShell window.
//
//   node supabase-state-report.mjs --target=production
//   node supabase-state-report.mjs --target=local         (SUPABASE_URL on 127.0.0.1)
//
// The database URL comes from a hidden prompt (or SUPABASE_DB_URL), never a
// flag. It needs no API key. It sends only SELECT/SHOW inside BEGIN READ
// ONLY and rolls back, and prints no email, token, hash, secret or full id.
// The run itself is lib/supabase-state-report-core.mjs's runStateReportCli().
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildPgPoolConfig } from '../../data/supabase/client.js';
import { TOOL, readExpectedJournal, runStateReportCli } from './lib/supabase-state-report-core.mjs';
import { describeError, gitState, makeRedactor, makeTerminalIo } from './lib/operator-io.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** HEAD, dirty flag and how many commits origin/main (as last fetched) is ahead; null when it cannot be told. */
export function gitFreshness(repoRoot) {
  const git = gitState(repoRoot);
  let behindMain = null;
  try {
    const out = execFileSync('git', ['rev-list', '--count', 'HEAD..refs/remotes/origin/main'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    behindMain = Number.parseInt(out.trim(), 10);
    if (!Number.isInteger(behindMain)) behindMain = null;
  } catch {
    behindMain = null;
  }
  return { ...git, behindMain };
}

/**
 * One read-only transaction on one connection: BEGIN READ ONLY, verified
 * with SHOW transaction_read_only, a statement timeout, and always ROLLBACK
 * (there is nothing to commit).
 */
export function createReadOnlyDb(dbUrl) {
  const pool = new pg.Pool({ ...buildPgPoolConfig(dbUrl), max: 1 });
  return {
    readOnly: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
        await client.query(`SET LOCAL statement_timeout = '20s'`);
        const ro = await client.query('SHOW transaction_read_only');
        if (ro.rows[0].transaction_read_only !== 'on') throw new Error('the session is not read-only -- refusing to read');
        return await fn(client);
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

async function main() {
  const redactor = makeRedactor();
  const io = makeTerminalIo(redactor);
  try {
    await runStateReportCli({
      argv: process.argv.slice(2),
      env: process.env,
      io,
      redactor,
      deps: {
        gitState: () => gitFreshness(REPO_ROOT),
        createDb: createReadOnlyDb,
        expectedJournal: () => readExpectedJournal(REPO_ROOT),
      },
    });
  } catch (err) {
    process.stderr.write(`[${TOOL}] STOPPED ${describeError(err, redactor)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
