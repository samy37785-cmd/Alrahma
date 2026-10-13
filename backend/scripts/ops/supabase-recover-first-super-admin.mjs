#!/usr/bin/env node
// Ops tool: recovers the FIRST Super Admin account when its invite link has
// expired unused. It sets a password you type and confirms the email of that
// ONE account (id prefix pinned by --expect-id-prefix, full id asked for,
// hidden) -- and does nothing else. Run it yourself, in an interactive
// PowerShell window -- see docs/supabase-first-super-admin-bootstrap-runbook.md.
//
//   node supabase-recover-first-super-admin.mjs                (dry-run: reads nothing, connects nowhere)
//   node supabase-recover-first-super-admin.mjs --apply --confirm-recover-super-admin-account \
//        --target=production --expect-id-prefix=<8 hex>
//
// It refuses unless the account is in exactly the state the first-Super-Admin
// bootstrap leaves behind and nothing has touched it since (one auth user, one
// admin profile, one super-admin role row; email unconfirmed; never signed in;
// no password; no sessions; no MFA factors; no auth audit rows). It sends no
// email, creates no token, user, profile or role, and signs nobody in.
//
// The account id, the database URL, the service key and the password are
// never flags: they come from a hidden prompt (or, for the two secrets, the
// environment), so none of them can reach PowerShell history, the process
// arguments or a log. No .env file is read. The run itself is
// lib/supabase-recover-first-super-admin-core.mjs's runRecoveryCli(); this
// file only wires the real terminal, git, the Supabase Auth Admin client and
// the read-only Postgres runner.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { TOOL, runRecoveryCli } from './lib/supabase-recover-first-super-admin-core.mjs';
import { describeError, gitState, makeRedactor, makeTerminalIo } from './lib/operator-io.mjs';
import { createReadOnlyDb } from './supabase-state-report.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The only write this tool can make. The attributes are fixed here, not
 * passed in: a password and the email confirmation. No `email`, no metadata,
 * no ban, no link or invite -- so GoTrue has no reason to send any mail.
 */
export function createRecoveryAuthAdmin(url, serviceKey) {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    setPasswordAndConfirm: (userId, password) => client.auth.admin.updateUserById(userId, { password, email_confirm: true }),
  };
}

async function main() {
  const redactor = makeRedactor();
  const io = makeTerminalIo(redactor);
  try {
    const result = await runRecoveryCli({
      argv: process.argv.slice(2),
      env: process.env,
      io,
      redactor,
      deps: {
        gitState: () => gitState(REPO_ROOT),
        createAuthAdmin: createRecoveryAuthAdmin,
        createDb: createReadOnlyDb,
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
