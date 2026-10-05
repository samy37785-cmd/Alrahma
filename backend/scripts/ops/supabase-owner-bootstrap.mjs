#!/usr/bin/env node
// Owner-run tool, after supabase-first-super-admin-bootstrap.mjs: the real
// Super Admin accepts the invite, then signs in once, enrolls TOTP MFA and
// creates the three canonical plans through create_plan_version() on an
// AAL2 session. Run it yourself, in an interactive PowerShell window -- see
// docs/supabase-first-super-admin-bootstrap-runbook.md.
//
//   node supabase-owner-bootstrap.mjs accept-invite --target=production --expect-user-id=<uuid>
//   node supabase-owner-bootstrap.mjs run --target=production --expect-user-id=<uuid> --confirm-create-canonical-plans
//
// Uses the anon/publishable key only (a service_role or secret key is
// refused). The email, password, invite link and codes are only ever read
// from hidden prompts; the key from the environment or a hidden prompt.
// Nothing is written to a file: the Supabase session lives in memory, the
// QR code and setup key are shown on this screen only and cleared after
// verification. No .env file is read. The run itself is
// lib/supabase-owner-bootstrap-core.mjs's runOwnerCli().
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import { TOOL, runOwnerCli } from './lib/supabase-owner-bootstrap-core.mjs';
import { describeError, gitState, makeRedactor, makeTerminalIo } from './lib/operator-io.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function createOwnerClient(url, anonKey) {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function renderTerminalQr(uri) {
  return QRCode.toString(uri, { type: 'terminal', small: true });
}

async function main() {
  const redactor = makeRedactor();
  const io = makeTerminalIo(redactor);
  try {
    await runOwnerCli({
      argv: process.argv.slice(2),
      env: process.env,
      io,
      redactor,
      deps: { gitState: () => gitState(REPO_ROOT), createClient: createOwnerClient, renderQr: renderTerminalQr },
    });
  } catch (err) {
    process.stderr.write(`[${TOOL}] STOPPED ${describeError(err, redactor)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
