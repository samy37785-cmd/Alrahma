#!/usr/bin/env node
// Ops tool: creates the FIRST Supabase-native super-admin identity
// (auth.users by invite + profiles.role='admin' + one
// admin_role_assignments 'super-admin' row). Run it yourself, in an
// interactive PowerShell window -- see
// docs/supabase-first-super-admin-bootstrap-runbook.md.
//
//   node supabase-first-super-admin-bootstrap.mjs                (dry-run: reads nothing, connects nowhere)
//   node supabase-first-super-admin-bootstrap.mjs --apply --confirm-create-first-super-admin \
//        --target=production --backup-manifest=<fresh backup manifest>
//
// Why it exists: admin_set_admin_role() (lib/db/drizzle/0013_admin_rbac.sql)
// requires the caller to already be an AAL2 super-admin, so the very first
// one needs this offline, owner-run exception.
//
// The email, the database URL and the service key are never flags: they
// come from a hidden prompt (or, for the two secrets, the environment), so
// none of them can reach PowerShell history, the process arguments or a
// log. No .env file is read. The run itself is
// lib/supabase-first-super-admin-bootstrap-core.mjs's runBootstrapCli();
// this file only wires the real terminal, git, the Mongo collision check,
// the Supabase Auth Admin client and Postgres.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { buildPgPoolConfig } from '../../data/supabase/client.js';
import { verifyFreshBackup } from '../migration/lib/production-approval.mjs';
import { runCollisionCheck } from '../migration/check-super-admin-email-collision.mjs';
import { TOOL, runBootstrapCli } from './lib/supabase-first-super-admin-bootstrap-core.mjs';
import { describeError, gitState, makeRedactor, makeTerminalIo } from './lib/operator-io.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function createAuthAdmin(url, serviceKey) {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    inviteUser: (email) => client.auth.admin.inviteUserByEmail(email),
    deleteUser: async (userId) => {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw new Error('compensation failed: the invited account could not be deleted -- remove it by hand');
    },
  };
}

/** readOnly runs as the connecting user inside BEGIN READ ONLY; inTransaction as service_role. */
export function createDb(dbUrl) {
  const pool = new pg.Pool({ ...buildPgPoolConfig(dbUrl), max: 1 });
  const run = async (begin, fn) => {
    const client = await pool.connect();
    try {
      for (const sql of begin) await client.query(sql);
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
  return {
    readOnly: (fn) => run(['BEGIN READ ONLY'], fn),
    inTransaction: (fn) => run(['BEGIN', 'SET LOCAL ROLE service_role'], fn),
    end: () => pool.end(),
  };
}

async function main() {
  const redactor = makeRedactor();
  const io = makeTerminalIo(redactor);
  try {
    const result = await runBootstrapCli({
      argv: process.argv.slice(2),
      env: process.env,
      io,
      redactor,
      deps: {
        gitState: () => gitState(REPO_ROOT),
        verifyFreshBackup: (p) => verifyFreshBackup(p),
        collisionCheck: runCollisionCheck,
        createAuthAdmin,
        createDb,
      },
    });
    if (!['success', 'dry-run'].includes(result.status)) process.exitCode = 1;
  } catch (err) {
    process.stderr.write(`[${TOOL}] STOPPED ${describeError(err, redactor)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
