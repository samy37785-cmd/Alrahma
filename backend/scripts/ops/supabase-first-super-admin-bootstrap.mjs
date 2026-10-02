#!/usr/bin/env node
// Ops tool: bootstraps the FIRST Supabase-native super-admin identity
// (auth.users + profiles.role='admin' + admin_role_assignments.role=
// 'super-admin'), for the eventual DATA_BACKEND=supabase cutover. Never
// run as part of the task that added this file — see
// docs/supabase-first-super-admin-bootstrap-runbook.md for the full,
// separately-authorized operational procedure this tool is meant to run
// under.
//
// Why this exists: admin_set_admin_role() (lib/db/drizzle/
// 0013_admin_rbac.sql) — the normal, in-app way to grant an admin role —
// itself requires the CALLER to already be a super-admin with AAL2. There
// is deliberately no self-service or ordinary-admin-gated way to create
// the very first one; this offline, operator-run tool is that one
// exception, exactly analogous to backend/scripts/createAdminUser.js on
// the Mongo side.
//
// Hard rules this script enforces structurally, not just by convention:
//   1. Default is --dry-run (no flags at all): validates configuration
//      only, connects to nothing, writes nothing.
//   2. NEVER accepts, generates, or prints a password. The new identity is
//      created via supabase.auth.admin.inviteUserByEmail() — Supabase Auth
//      itself emails a real invite link; the owner sets their own password
//      by following it. No password of any kind ever exists inside this
//      tool's process.
//   3. --apply requires ALL FIVE of: --apply, --confirm-create-first-
//      super-admin, ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1,
//      --target=staging|production matching SUPABASE_BOOTSTRAP_TARGET_ENV,
//      and an explicit --email=<address>. See resolveRunConfig() in the
//      core module — this is the ONLY place these gates are checked, and
//      it runs before any client is constructed.
//   4. Fails closed if ANY admin_role_assignments row already exists, or
//      if profiles has an orphaned role='admin' row — never silently
//      "fixes" an ambiguous state, never promotes a second admin.
//   5. If the target email already has an auth.users account, refuses to
//      touch it unless --confirm-promote-existing-account is ALSO passed
//      — a second, separate acknowledgement from --confirm-create-first-
//      super-admin.
//   6. If account creation succeeds but the profile/role write fails, the
//      newly-created auth identity (and ONLY that one, by the exact id
//      this run itself just created it with) is deleted again — never an
//      existing account this run did not create.
//   7. Every log line is a mode/status/count — never an email, password,
//      token, link, or secret value.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { parseStrictCliArgs } from '../migration/lib/cli-args.mjs';
import { CLI_SPEC, resolveRunConfig, runBootstrap } from './lib/supabase-first-super-admin-bootstrap-core.mjs';
import { withServiceRole } from '../../data/supabase/client.js';
import { getAdminClient } from '../../data/supabase/authClients.js';

const CLIENT_URL = () => process.env.CLIENT_URL || null;

async function inviteUser(email) {
  const client = getAdminClient();
  const redirectTo = CLIENT_URL() ? `${CLIENT_URL()}/admin/login` : undefined;
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
  return { data, error };
}

async function deleteUser(userId) {
  const client = getAdminClient();
  await client.auth.admin.deleteUser(userId);
}

async function main() {
  const args = parseStrictCliArgs(process.argv.slice(2), CLI_SPEC);
  const config = resolveRunConfig({ args, env: process.env });

  console.log(`[supabase-super-admin-bootstrap] mode=${config.apply ? 'apply' : 'dry-run'}`);

  if (!config.apply) {
    console.log('[supabase-super-admin-bootstrap] dry-run only — no connection was made, no write performed.');
    console.log(
      '[supabase-super-admin-bootstrap] to apply: --apply --confirm-create-first-super-admin ' +
      '--target=<staging|production> --email=<address>, with ALLOW_SUPABASE_SUPER_ADMIN_BOOTSTRAP=1 and ' +
      'SUPABASE_BOOTSTRAP_TARGET_ENV matching --target both set in the environment.'
    );
    return;
  }

  console.log(`[supabase-super-admin-bootstrap] target=${config.target}`);

  const result = await runBootstrap({
    email: config.email,
    confirmPromoteExisting: config.confirmPromoteExisting,
    inviteUser,
    deleteUser,
    runInServiceRoleTransaction: withServiceRole,
  });

  console.log('[supabase-super-admin-bootstrap] result:', JSON.stringify({
    status: result.status,
    createdByThisRun: result.createdByThisRun,
    promoted: result.promoted,
  }));

  if (result.status !== 'success') {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[supabase-super-admin-bootstrap] FATAL:', err.code ? `${err.code}: ${err.message}` : err.message);
    process.exitCode = 1;
  });
}
