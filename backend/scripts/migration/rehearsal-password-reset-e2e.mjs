#!/usr/bin/env node
// Real, end-to-end rehearsal of POST /api/auth/forgot-password + POST
// /api/auth/reset-password under DATA_BACKEND=supabase, against a REAL
// local GoTrue instance (the isolated `stage2f-authtest` stack under
// ops/stage2f-authtest — distinct project_id/ports/container names from the
// pre-existing, unrelated `option-a-rehearsal` stack; never touches it).
//
// Unlike rehearsal-part-a-final-corrections.mjs (which explicitly does NOT
// stand up GoTrue and rehearses AAL2 by hand-signing a JWT), this script
// exercises the actual GoTrue recovery-email pipeline: real
// resetPasswordForEmail() call, a real email captured by the stack's local
// Mailpit mail-catcher, a real token_hash extracted from that email, real
// verifyOtp() ownership proof, and a real password change — nothing here is
// simulated or hand-signed.
//
// Never prints a full token/link/password — only booleans, lengths, and
// status codes, per the task's "no logging tokens or full recovery links"
// requirement.
import assert from 'node:assert/strict';
import pg from 'pg';
import request from 'supertest';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

// Returns { agent, csrfToken } from a single GET /api/csrf — issueCsrfToken
// only sets the cookie when the request doesn't already carry one, so a
// second GET on the same agent would come back with no Set-Cookie header at
// all (the earlier, now-fixed version of this script called GET twice and
// silently lost the token on the second call).
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
      /* ignore malformed match */
    }
  }
  return null;
}

async function main() {
  assertLocalHost(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL');
  assertLocalHost(process.env.SUPABASE_URL, 'SUPABASE_URL');
  assert.equal(process.env.DATA_BACKEND, 'supabase', 'DATA_BACKEND must be "supabase"');
  const MAILPIT_URL = process.env.MAILPIT_URL;
  assert.ok(MAILPIT_URL, 'MAILPIT_URL must be set (the stage2f-authtest stack local mail catcher)');
  assertLocalHost(MAILPIT_URL, 'MAILPIT_URL');

  const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });
  let pass = 0;
  const results = [];
  function check(name, cond) {
    results.push({ name, ok: !!cond });
    if (cond) pass++;
    console.log(`${cond ? '[PASS]' : '[FAIL]'} ${name}`);
  }

  const { default: app } = await import('../../app.js');

  const email = `pwreset.rehearsal.${Date.now()}@test.local`;
  const oldPassword = 'OldPassw0rd!123';
  const newPassword = 'NewPassw0rd!456';

  // --- Seed a real user via the real backend register endpoint (exercises
  // handle_new_user() against the real GoTrue-backed auth.users insert). ---
  const { agent: seedAgent, csrfToken: seedCsrf } = await csrfAgent(app);
  const regRes = await seedAgent
    .post('/api/auth/register')
    .set('x-csrf-token', seedCsrf)
    .send({ name: 'Reset Rehearsal User', email, password: oldPassword });
  check('seed user registers successfully (201)', regRes.status === 201);

  // --- No email enumeration: forgot-password for a non-existent address
  // returns the same generic message and sends no mail. ---
  const ghostEmail = `no-such-user.${Date.now()}@test.local`;
  const { agent: ghostAgent, csrfToken: ghostCsrf } = await csrfAgent(app);
  const ghostRes = await ghostAgent
    .post('/api/auth/forgot-password')
    .set('x-csrf-token', ghostCsrf)
    .send({ email: ghostEmail });
  check('forgot-password for unknown email returns 200', ghostRes.status === 200);
  await new Promise((r) => setTimeout(r, 500));
  const ghostMail = await latestMailFor(MAILPIT_URL, ghostEmail);
  check('no email sent for unknown address (no enumeration)', ghostMail === null);

  // --- Real forgot-password for the real user. ---
  const { agent: fpAgent, csrfToken: fpCsrf } = await csrfAgent(app);
  const fpRes = await fpAgent
    .post('/api/auth/forgot-password')
    .set('x-csrf-token', fpCsrf)
    .send({ email });
  check('forgot-password for real user returns 200', fpRes.status === 200);

  await new Promise((r) => setTimeout(r, 800));
  const mail = await latestMailFor(MAILPIT_URL, email);
  check('recovery email actually captured by local mail catcher', !!mail);
  const token = mail ? extractTokenFromMail(mail) : null;
  check('recovery token extracted from email body (never logged)', typeof token === 'string' && token.length > 10);

  // --- Missing fields ---
  const { agent: missAgent, csrfToken: missCsrf } = await csrfAgent(app);
  const missRes = await missAgent
    .post('/api/auth/reset-password')
    .set('x-csrf-token', missCsrf)
    .send({ token: '' , password: '' });
  check('missing token/password rejected with 400', missRes.status === 400);

  // --- Invalid/garbage token rejected, generic message ---
  const { agent: badAgent, csrfToken: badCsrf } = await csrfAgent(app);
  const badRes = await badAgent
    .post('/api/auth/reset-password')
    .set('x-csrf-token', badCsrf)
    .send({ token: 'not-a-real-token-hash-0000000000000000000000000000', password: newPassword });
  check('garbage token rejected with 400', badRes.status === 400);
  check('garbage-token error message is generic (no stack/detail leak)', badRes.body?.message === 'Reset link is invalid or has expired');

  // --- Session-invalidation baseline (0033_profiles_token_version.sql):
  // capture a REAL, currently-working session cookie from BEFORE the reset,
  // by logging in with the still-current old password — this is the exact
  // stale token an attacker who stole a cookie before the legitimate
  // owner's reset would be holding. ---
  const { agent: staleAgent, csrfToken: staleCsrf } = await csrfAgent(app);
  const staleLoginRes = await staleAgent
    .post('/api/auth/login')
    .set('x-csrf-token', staleCsrf)
    .send({ email, password: oldPassword });
  check('pre-reset login (to capture a stale session) succeeds (200)', staleLoginRes.status === 200);
  const preResetMeRes = await staleAgent.get('/api/auth/me');
  check('sanity: the pre-reset session works on a protected route BEFORE the reset', preResetMeRes.status === 200);

  // --- Real reset with the real token ---
  const { agent: rpAgent, csrfToken: rpCsrf } = await csrfAgent(app);
  const rpRes = await rpAgent
    .post('/api/auth/reset-password')
    .set('x-csrf-token', rpCsrf)
    .send({ token, password: newPassword });
  check('reset-password with the real recovery token succeeds (200)', rpRes.status === 200);

  // --- THE FIX: the stale, pre-reset session cookie must now be rejected —
  // this is the real, previously-missing Supabase-mode behavior
  // (backend/config/validateEnv.js's SUPABASE_SESSION_INVALIDATION_GAP_
  // ACKNOWLEDGED gate existed because this used to silently keep working). ---
  const staleMeRes = await staleAgent.get('/api/auth/me');
  check('THE FIX: the stale pre-reset session is rejected (401) after the password reset', staleMeRes.status === 401);
  check('THE FIX: the rejection reason is a real tokenVersion mismatch, not an unrelated auth failure', staleMeRes.body?.message === 'Session expired — please log in again');

  // --- Old password now rejected ---
  const { agent: oldLoginAgent, csrfToken: oldCsrf } = await csrfAgent(app);
  const oldLoginRes = await oldLoginAgent
    .post('/api/auth/login')
    .set('x-csrf-token', oldCsrf)
    .send({ email, password: oldPassword });
  check('login with OLD password now fails (401)', oldLoginRes.status === 401);

  // --- New password accepted ---
  const { agent: newLoginAgent, csrfToken: newCsrf } = await csrfAgent(app);
  const newLoginRes = await newLoginAgent
    .post('/api/auth/login')
    .set('x-csrf-token', newCsrf)
    .send({ email, password: newPassword });
  check('login with NEW password succeeds (200)', newLoginRes.status === 200);
  check('login response sets the auth cookie', (newLoginRes.headers['set-cookie'] || []).some((c) => c.startsWith('token=')));

  // --- Replay: the exact same recovery link/token must be rejected the
  // second time (single-use, enforced by GoTrue itself). ---
  const { agent: replayAgent, csrfToken: replayCsrf } = await csrfAgent(app);
  const replayRes = await replayAgent
    .post('/api/auth/reset-password')
    .set('x-csrf-token', replayCsrf)
    .send({ token, password: 'AnotherNewPassw0rd!789' });
  check('replaying the same recovery token is rejected (400)', replayRes.status === 400);

  // --- Confirm the "AnotherNewPassw0rd!789" replay attempt did NOT take
  // effect: the password set by the first, legitimate reset still works. ---
  const { agent: finalAgent, csrfToken: finalCsrf } = await csrfAgent(app);
  const finalRes = await finalAgent
    .post('/api/auth/login')
    .set('x-csrf-token', finalCsrf)
    .send({ email, password: newPassword });
  check('post-replay-attempt, the legitimate new password still works', finalRes.status === 200);

  // --- Session-invalidation via PUT /api/auth/me (updateMe()'s own
  // password-change path, separate code path from reset-password above —
  // both call bump_token_version(), both must be proven independently). A
  // SEPARATE session, captured before this change, is the one checked
  // afterward — isolates "does changing a password invalidate OTHER
  // sessions" from any self-invalidation nuance of the session that made
  // the change itself. ---
  const finalPassword = 'FinalPassw0rd!999';
  const { agent: otherSessionAgent, csrfToken: otherCsrf } = await csrfAgent(app);
  const otherLoginRes = await otherSessionAgent
    .post('/api/auth/login')
    .set('x-csrf-token', otherCsrf)
    .send({ email, password: newPassword });
  check('a second, independent session logs in successfully before the updateMe() change', otherLoginRes.status === 200);
  const preUpdateMeRes = await otherSessionAgent.get('/api/auth/me');
  check('sanity: the second session works BEFORE the updateMe() password change', preUpdateMeRes.status === 200);

  const { agent: updateAgent, csrfToken: updateCsrf } = await csrfAgent(app);
  const updateLoginRes = await updateAgent
    .post('/api/auth/login')
    .set('x-csrf-token', updateCsrf)
    .send({ email, password: newPassword });
  check('a third session (the one performing the change) logs in successfully', updateLoginRes.status === 200);
  const updateMeRes = await updateAgent
    .put('/api/auth/me')
    .set('x-csrf-token', updateCsrf)
    .send({ currentPassword: newPassword, newPassword: finalPassword });
  check('PUT /api/auth/me with a valid currentPassword changes the password (200)', updateMeRes.status === 200);

  const postUpdateMeRes = await otherSessionAgent.get('/api/auth/me');
  check('THE FIX (updateMe path): the OTHER, independent session is rejected (401) after the password change via PUT /api/auth/me', postUpdateMeRes.status === 401);

  await pool.end();

  console.log(`\n${pass}/${results.length} checks passed.`);
  if (pass !== results.length) {
    console.error('REHEARSAL FAILED — see [FAIL] lines above.');
    process.exitCode = 1;
  } else {
    console.log('Password-reset E2E rehearsal: ALL CHECKS PASSED against a real local GoTrue instance.');
  }
}

main().catch((err) => {
  console.error('[rehearsal-password-reset-e2e] FAILED:', err);
  process.exitCode = 1;
});
