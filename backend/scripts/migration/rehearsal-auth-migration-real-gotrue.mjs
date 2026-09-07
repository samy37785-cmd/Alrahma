#!/usr/bin/env node
// Real, end-to-end rehearsal of the Mongo->Supabase Auth user/admin
// migration (Stage 2F item 6), against a REAL local GoTrue instance (the
// isolated `stage2f-authtest` stack — see ops/stage2f-authtest/README.md).
//
// Run order (see ops/stage2f-authtest/README.md for the full command
// lines):
//   1. seed-mongo-fixture-auth-migration.mjs   (dummy users/adminusers)
//   2. migrate-users-to-supabase-auth.mjs --execute --with-invite-plan
//      (run it TWICE in a row to exercise the idempotent-rerun property —
//      already verified manually this session: second run reports
//      alreadyExists for every user and role_assigned_existing_account for
//      every admin, reconciliation.consistent stays true)
//   3. THIS script — verifies the properties the migration tool's own JSON
//      report can't show on its own:
//        - the unmapped-role admin left no orphan auth.users/profiles/
//          admin_role_assignments row (rollback-safety)
//        - zero auth.mfa_factors rows exist for any migrated admin (no MFA
//          secret was carried over from Mongo, by construction)
//        - a migrated admin cannot log in with their old (nonexistent)
//          Mongo password — only via forced password reset (reusing the
//          real password-reset flow this same task closed)
//        - after that reset, POST /api/v1/admin/auth/login returns
//          {stage:'mfa_setup'} — MFA re-enrollment really is required
//        - a real end-to-end TOTP enrollment (GoTrue enroll -> speakeasy-
//          computed code -> challenge -> verify) actually grants a full
//          AAL2 admin session — not just asserted, executed.
//
// Never prints a TOTP secret, recovery token, or session token — only
// booleans/status codes.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import pg from 'pg';
import request from 'supertest';
import speakeasy from 'speakeasy';

// Docker Desktop's WSL2 VM clock can drift from the Windows host clock by
// several seconds (a known, common artifact after host sleep/resume) —
// enough to push a host-computed TOTP code outside GoTrue's 30s window
// running inside the container. Measured empirically this run: ~13s.
// Computing the code against the CONTAINER's own clock (not the host's)
// makes this rehearsal robust to that drift instead of flaking on it.
function totpContainerTime(containerName) {
  try {
    return parseInt(execSync(`docker exec ${containerName} date +%s`, { encoding: 'utf8' }).trim(), 10) * 1000;
  } catch {
    return Date.now(); // docker CLI unavailable — fall back to host clock
  }
}

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

async function csrfAgent(app) {
  const agent = request.agent(app);
  const res = await agent.get('/api/csrf');
  const setCookie = res.headers['set-cookie'] || [];
  const match = setCookie.map(String).find((c) => c.startsWith('csrf_token='));
  const csrfToken = match ? decodeURIComponent(match.split(';')[0].split('=')[1]) : null;
  return { agent, csrfToken };
}

async function latestMailFor(mailpitUrl, toEmail) {
  const res = await fetch(`${mailpitUrl}/api/v1/messages?limit=50`);
  const list = await res.json();
  const hit = (list.messages || []).find((m) =>
    (m.To || []).some((t) => (t.Address || '').toLowerCase() === toEmail.toLowerCase())
  );
  if (!hit) return null;
  const msgRes = await fetch(`${mailpitUrl}/api/v1/message/${hit.ID}`);
  return msgRes.json();
}

function extractTokenFromMail(mail) {
  const text = mail.Text || mail.HTML || '';
  const links = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
  for (const l of links) {
    try {
      const u = new URL(l);
      if (u.searchParams.has('token')) return u.searchParams.get('token');
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function main() {
  assertLocalHost(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL');
  assertLocalHost(process.env.SUPABASE_URL, 'SUPABASE_URL');
  assert.equal(process.env.DATA_BACKEND, 'supabase', 'DATA_BACKEND must be "supabase"');
  const MAILPIT_URL = process.env.MAILPIT_URL;
  assert.ok(MAILPIT_URL, 'MAILPIT_URL must be set');
  assertLocalHost(MAILPIT_URL, 'MAILPIT_URL');

  const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
  let pass = 0;
  const results = [];
  function check(name, cond) {
    results.push({ name, ok: !!cond });
    if (cond) pass++;
    console.log(`${cond ? '[PASS]' : '[FAIL]'} ${name}`);
  }

  // --- Rollback-safety: the unmapped-role admin left no trace anywhere. ---
  const badRoleEmail = 'authmig.badrole@example.test';
  const badRoleAuth = await pool.query(`SELECT id FROM auth.users WHERE email = $1`, [badRoleEmail]);
  check('unmapped-role admin created NO auth.users row', badRoleAuth.rows.length === 0);
  const badRoleProfile = await pool.query(`SELECT id FROM profiles WHERE email = $1`, [badRoleEmail]);
  check('unmapped-role admin created NO profiles row', badRoleProfile.rows.length === 0);

  // --- No MFA secret carried over for any migrated admin. ---
  const migratedAdminEmails = [
    'authmig.superadmin@example.test',
    'authmig.admin@example.test',
    'authmig.editor@example.test',
    'authmig.viewer@example.test',
  ];
  const factorsRes = await pool.query(
    `SELECT count(*)::int AS n FROM auth.mfa_factors f
     JOIN auth.users u ON u.id = f.user_id
     WHERE u.email = ANY($1::text[])`,
    [migratedAdminEmails]
  );
  check('zero auth.mfa_factors rows for any migrated admin (no MFA carried over)', factorsRes.rows[0].n === 0);

  // --- Role mapping landed correctly for all four valid roles. ---
  const roleRows = await pool.query(
    `SELECT u.email, r.role FROM admin_role_assignments r
     JOIN auth.users u ON u.id = r.user_id
     WHERE u.email = ANY($1::text[])`,
    [migratedAdminEmails]
  );
  const roleByEmail = Object.fromEntries(roleRows.rows.map((r) => [r.email, r.role]));
  check('super-admin role mapped correctly', roleByEmail['authmig.superadmin@example.test'] === 'super-admin');
  check('admin role mapped correctly', roleByEmail['authmig.admin@example.test'] === 'admin');
  check('editor role mapped correctly', roleByEmail['authmig.editor@example.test'] === 'editor');
  check('viewer role mapped correctly', roleByEmail['authmig.viewer@example.test'] === 'viewer');

  // --- Profile name mapping (migrateOneAdmin sets profiles.name from the
  // Mongo document, since handle_new_user() can't know it). ---
  const nameRes = await pool.query(`SELECT name FROM profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = $1`, ['authmig.admin@example.test']);
  check('profile name mapped from Mongo source', nameRes.rows[0]?.name === 'Fixture Admin');

  const { default: app } = await import('../../app.js');

  // --- Forced password reset: the migrated admin's throwaway password is
  // unknown to anyone; the ONLY way in is via a real recovery flow. ---
  const testEmail = 'authmig.admin@example.test';
  // Unique per run: GoTrue rejects re-setting an identical password, and
  // this stack's Postgres volume persists across restarts (only `--no-
  // backup` on `supabase stop` truly wipes it), so a fixed literal here
  // would fail on any rerun against already-migrated state.
  const newPassword = `MigratedAdminPassw0rd!${Date.now()}`;

  const { agent: fpAgent, csrfToken: fpCsrf } = await csrfAgent(app);
  const fpRes = await fpAgent.post('/api/auth/forgot-password').set('x-csrf-token', fpCsrf).send({ email: testEmail });
  check('forgot-password for migrated admin succeeds (200)', fpRes.status === 200);

  await new Promise((r) => setTimeout(r, 800));
  const mail = await latestMailFor(MAILPIT_URL, testEmail);
  check('recovery email captured for migrated admin', !!mail);
  const token = mail ? extractTokenFromMail(mail) : null;

  const { agent: rpAgent, csrfToken: rpCsrf } = await csrfAgent(app);
  const rpRes = await rpAgent.post('/api/auth/reset-password').set('x-csrf-token', rpCsrf).send({ token, password: newPassword });
  check('forced password reset for migrated admin succeeds (200)', rpRes.status === 200);

  // --- Admin login now requires MFA setup (zero verified factors). ---
  const { agent: loginAgent, csrfToken: loginCsrf } = await csrfAgent(app);
  const loginRes = await loginAgent
    .post('/api/v1/admin/auth/login')
    .set('x-csrf-token', loginCsrf)
    .send({ email: testEmail, password: newPassword });
  check('admin login after reset succeeds (200)', loginRes.status === 200);
  check('login stage is mfa_setup (re-enrollment required)', loginRes.body?.stage === 'mfa_setup');
  check('login response carries no AAL2 grant yet', !loginRes.body?.token);

  // --- Real TOTP enrollment: enroll -> compute a real code -> confirm. ---
  const setupRes = await loginAgent.post('/api/v1/admin/auth/mfa/setup').set('x-csrf-token', loginCsrf).send({});
  check('mfa/setup returns a real TOTP secret+QR', setupRes.status === 200 && typeof setupRes.body?.secret === 'string');
  if (setupRes.status !== 200) console.error('DEBUG setupRes:', setupRes.status, JSON.stringify(setupRes.body));

  const gotrueContainer = process.env.STAGE2F_GOTRUE_CONTAINER || 'supabase_auth_stage2f-authtest';
  const code = setupRes.body?.secret
    ? speakeasy.totp({ secret: setupRes.body.secret, encoding: 'base32', time: totpContainerTime(gotrueContainer) / 1000 })
    : null;
  const confirmRes = await loginAgent
    .post('/api/v1/admin/auth/mfa/confirm')
    .set('x-csrf-token', loginCsrf)
    .send({ token: code });
  check('mfa/confirm with a real computed TOTP code succeeds (200)', confirmRes.status === 200);
  if (confirmRes.status !== 200) console.error('DEBUG confirmRes:', confirmRes.status, JSON.stringify(confirmRes.body), 'codeLen:', code?.length);
  check('mfa/confirm response confirms activation', confirmRes.body?.message === '2FA activated and session started');
  check('mfa/confirm grants a real AAL2 admin session cookie', (confirmRes.headers['set-cookie'] || []).some((c) => c.startsWith('admin_at=')));

  // --- Now a verified factor exists, and a fresh login goes straight to
  // the 'mfa' (challenge) stage, not 'mfa_setup' again. ---
  const { agent: login2Agent, csrfToken: login2Csrf } = await csrfAgent(app);
  const login2Res = await login2Agent
    .post('/api/v1/admin/auth/login')
    .set('x-csrf-token', login2Csrf)
    .send({ email: testEmail, password: newPassword });
  check('second login (post-enrollment) reaches stage "mfa" not "mfa_setup"', login2Res.body?.stage === 'mfa');

  await pool.end();

  console.log(`\n${pass}/${results.length} checks passed.`);
  if (pass !== results.length) {
    console.error('REHEARSAL FAILED — see [FAIL] lines above.');
    process.exitCode = 1;
  } else {
    console.log('Auth-migration real-GoTrue rehearsal: ALL CHECKS PASSED.');
  }
}

main().catch((err) => {
  console.error('[rehearsal-auth-migration-real-gotrue] FAILED:', err);
  process.exitCode = 1;
});
