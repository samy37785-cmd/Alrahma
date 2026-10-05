// Core of supabase-owner-bootstrap.mjs: what the real Super Admin does with
// their own account, through Supabase Auth's public API only (the
// anon/publishable key -- a service_role or secret key is refused). All
// I/O is injected, so the whole run is testable against a fake client and
// against a real local Supabase stack.
//
//   accept-invite  The invite email's link cannot be accepted anywhere in
//                  the app while Render stays on Mongo, so this does it:
//                  the owner pastes the link (hidden; it must NOT be opened
//                  in a browser first), types the new password twice
//                  (hidden, checked BEFORE the one-time link is used), and
//                  the tool verifies the link, sets the password and signs
//                  out. No admin action, no MFA, no plan.
//
//   run            One password sign-in (email and password hidden), then:
//                  the account must be --expect-user-id and an admin;
//                  plans must be empty; TOTP MFA is enrolled (QR shown in
//                  this terminal only, cleared after) and verified, or an
//                  already verified factor is challenged; the session must
//                  then be AAL2, the account the one and only
//                  admin_role_assignments row, as 'super-admin'; then
//                  Starter, Standard and Premium are created exactly as the
//                  canonical catalog defines them, through the official
//                  create_plan_version() RPC, read back, and their audit
//                  rows checked. Sign-out (all sessions) always runs last.
//
// Never: a service-role key, a new user, a password reset, a plan
// definition from the command line, a change to an existing plan,
// DATA_BACKEND or Render. Prints IDs and statuses only.
import { parseStrictCliArgs } from '../../migration/lib/cli-args.mjs';
import { CANONICAL_PLANS } from '../../migration/lib/plan-catalog.mjs';
import { catalogMismatch } from '../../migration/lib/bootstrap-allowlist.mjs';
import { normalizeEmail } from '../../migration/lib/email-collision.mjs';
import {
  OperatorError,
  assertApiKey,
  assertNoRemoteTargetInCi,
  assertTargetEnvMatches,
  isUuid,
  parseTarget,
  requireConfirmationPhrase,
  requireInteractive,
  resolveSupabaseApi,
  secretInput,
} from './operator-io.mjs';

export const TOOL = 'supabase-owner-bootstrap';
export const COMMANDS = ['accept-invite', 'run'];
export const CLI_SPEC = {
  flags: {
    target: { type: 'string' },
    'expect-user-id': { type: 'string' },
    'confirm-create-canonical-plans': { type: 'boolean' },
  },
};
export const MFA_ISSUER = 'Al-Rahma Academy Admin';
export const MAX_TOTP_ATTEMPTS = 3;
export const MAX_PASSWORD_ATTEMPTS = 3;
export const MIN_PASSWORD_LENGTH = 12;

/**
 * The exact create_plan_version() arguments for the three canonical plans
 * (lib/plan-catalog.mjs, itself backend/config/plans.js in cents). Fixed
 * here; there is no flag or input that changes them.
 */
export function canonicalPlanVersionParams() {
  return CANONICAL_PLANS.map((p, i) => ({
    p_old_plan_id: null,
    p_slug: p.slug,
    p_name: p.name,
    p_amount_minor: p.amountMinor,
    p_currency: p.currency,
    p_billing_interval: p.billingInterval,
    p_stripe_product_id: null,
    p_stripe_price_id: null,
    p_paypal_plan_id: null,
    p_sessions_per_week: null,
    p_sessions_per_month: null,
    p_display_order: i,
  }));
}

export function parseOwnerArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) {
    throw new OperatorError(
      'BAD_ARGS',
      'usage: supabase-owner-bootstrap.mjs accept-invite --target=<local|production> --expect-user-id=<uuid> | ' +
      'run --target=<local|production> --expect-user-id=<uuid> --confirm-create-canonical-plans'
    );
  }
  let args;
  try {
    args = parseStrictCliArgs(rest, CLI_SPEC);
  } catch (err) {
    throw new OperatorError('BAD_ARGS', err.message);
  }
  if (command === 'accept-invite' && args['confirm-create-canonical-plans']) {
    throw new OperatorError('BAD_ARGS', '--confirm-create-canonical-plans belongs to run, not accept-invite');
  }
  return { command, args };
}

/** Pure gate check, before any input or connection. */
export function resolveOwnerConfig({ command, args, env }) {
  const target = parseTarget(args.target);
  assertNoRemoteTargetInCi({ env, target });
  assertTargetEnvMatches({ env, target });
  if (!isUuid(args['expect-user-id'])) {
    throw new OperatorError('BAD_ARGS', '--expect-user-id=<the SUPER_ADMIN_USER_ID the bootstrap printed> is required');
  }
  if (command === 'run' && !args['confirm-create-canonical-plans']) {
    throw new OperatorError('BAD_ARGS', 'run requires --confirm-create-canonical-plans');
  }
  return { command, target, expectUserId: args['expect-user-id'] };
}

/**
 * The token hash in a Supabase invite link
 * (<api>/auth/v1/verify?token=<hash>&type=invite&redirect_to=...). The
 * link must come from this project's own API host.
 */
export function parseInviteLink(link, { apiUrl }) {
  let url;
  try {
    url = new URL(String(link).trim());
  } catch {
    throw new OperatorError('BAD_INVITE_LINK', 'that is not a link -- copy the "Accept the invite" link from the email');
  }
  if (url.origin !== new URL(apiUrl).origin) {
    throw new OperatorError('BAD_INVITE_LINK', 'the link does not point at this Supabase project (a wrapped or rewritten link is refused too)');
  }
  if (!/\/auth\/v1\/verify\/?$/.test(url.pathname) || url.searchParams.get('type') !== 'invite') {
    throw new OperatorError('BAD_INVITE_LINK', 'that is not a Supabase invite link');
  }
  const token = url.searchParams.get('token');
  if (!token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
    throw new OperatorError('BAD_INVITE_LINK', 'the link carries no usable token');
  }
  return { tokenHash: token };
}

async function signOutEverywhere(client, io) {
  const { error } = await client.auth.signOut({ scope: 'global' });
  io.print(error ? 'LOGOUT=FAILED -- sign out from the Supabase dashboard (Authentication > Users)' : 'LOGOUT=OK (every session of this account)');
  return !error;
}

async function readPassword(io, redactor) {
  const password = await io.promptHidden(`New password, at least ${MIN_PASSWORD_LENGTH} characters (hidden): `);
  const again = await io.promptHidden('Same password again (hidden): ');
  redactor.add(password, again);
  if (password !== again) throw new OperatorError('PASSWORD_MISMATCH', 'the two password entries differ');
  if (password.length < MIN_PASSWORD_LENGTH) throw new OperatorError('PASSWORD_TOO_SHORT', `the password must have at least ${MIN_PASSWORD_LENGTH} characters`);
  return password;
}

export async function acceptInvite({ client, config, apiUrl, io, redactor }) {
  io.print('Copy the "Accept the invite" link from the email WITHOUT opening it (right-click > Copy link address).');
  const link = await io.promptHidden('Invite link (hidden): ');
  redactor.add(link);
  const { tokenHash } = parseInviteLink(link, { apiUrl });
  redactor.add(tokenHash);
  // Asked before the link is used: the link works once, so a typo here
  // must not cost it.
  let password = await readPassword(io, redactor);

  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
  if (error || !data?.session) {
    throw new OperatorError(
      'INVITE_LINK_REJECTED',
      'Supabase refused the link: it was already used (opened in a browser or by a mail scanner) or it expired. Nothing was changed; stop here.'
    );
  }
  try {
    if (data.user?.id !== config.expectUserId) {
      throw new OperatorError('WRONG_ACCOUNT', 'the link belongs to a different account than --expect-user-id; the password was not set');
    }
    for (let attempt = 1; ; attempt++) {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (!updateError) break;
      io.print(`PASSWORD_REJECTED (${attempt}/${MAX_PASSWORD_ATTEMPTS}): ${redactor.text(updateError.message)}`);
      if (attempt === MAX_PASSWORD_ATTEMPTS) {
        throw new OperatorError('PASSWORD_NOT_SET', 'the password was refused 3 times; the link is used now -- stop here and ask for help');
      }
      password = await readPassword(io, redactor);
    }
    password = null;
    io.print(`INVITE_ACCEPTED=YES user_id=${data.user.id}`);
    io.print('PASSWORD_SET=YES');
  } finally {
    await signOutEverywhere(client, io);
  }
  return { status: 'success', userId: data.user.id };
}

async function readPlans(client) {
  const { data, error } = await client
    .from('plans')
    .select('id, slug, name, amount_minor, currency, billing_interval, active, version, display_order')
    .order('display_order', { ascending: true });
  if (error) throw new OperatorError('PLANS_UNREADABLE', 'the plans table could not be read with this session');
  return data;
}

async function assertNoPlans(client) {
  const plans = await readPlans(client);
  if (plans.length > 0) {
    const matching = plans.filter((p) => !catalogMismatch(p)).length;
    throw new OperatorError(
      'PLANS_ALREADY_EXIST',
      `${plans.length} plans row(s) already exist (${matching} identical to the catalog) -- nothing was created or changed`
    );
  }
}

async function verifyTotp(client, factorId, io, redactor) {
  for (let attempt = 1; attempt <= MAX_TOTP_ATTEMPTS; attempt++) {
    const code = String(await io.promptVisible(`6-digit code from the authenticator app (${attempt}/${MAX_TOTP_ATTEMPTS}): `)).trim();
    redactor.add(code);
    if (!/^\d{6}$/.test(code)) {
      io.print('MFA: that is not a 6-digit code');
      continue;
    }
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (!error) return;
    io.print(`MFA: the code was refused (${attempt}/${MAX_TOTP_ATTEMPTS})`);
  }
  throw new OperatorError('MFA_VERIFY_FAILED', `the TOTP code was refused ${MAX_TOTP_ATTEMPTS} times -- nothing was created`);
}

export async function ownerRun({ client, config, projectRef, io, redactor, renderQr }) {
  io.print(`[${TOOL}] will create exactly: ${CANONICAL_PLANS.map((p) => `${p.slug} ${(p.amountMinor / 100).toFixed(2)} ${p.currency}/${p.billingInterval}`).join(', ')}`);
  await requireConfirmationPhrase(io, `CREATE CANONICAL PLANS ${projectRef}`, 'sign in and create them');

  const email = String(await io.promptHidden('Owner email (hidden): ')).trim();
  redactor.add(email, normalizeEmail(email));
  let password = await io.promptHidden('Password (hidden): ');
  redactor.add(password);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  password = null;
  if (error || !data?.session) throw new OperatorError('LOGIN_FAILED', 'the sign-in was refused -- nothing was changed');
  io.print('LOGIN=OK (one sign-in)');

  const userId = data.user.id;
  let newFactorId = null;
  let qrShown = false;
  let mfaVerified = false;
  try {
    if (userId !== config.expectUserId) throw new OperatorError('WRONG_ACCOUNT', 'signed in as a different account than --expect-user-id -- nothing was changed');
    const { data: isAdmin, error: adminError } = await client.rpc('is_admin');
    if (adminError || isAdmin !== true) throw new OperatorError('NOT_ADMIN', 'this account is not an admin -- no MFA factor was enrolled and nothing was created');
    await assertNoPlans(client);

    const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
    if (factorsError) throw new OperatorError('MFA_UNAVAILABLE', 'the MFA factors could not be read -- nothing was created');
    let factorId = factors.totp[0]?.id ?? null;
    if (!factorId) {
      for (const stale of factors.all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
        await client.auth.mfa.unenroll({ factorId: stale.id });
      }
      let { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: MFA_ISSUER });
      if (enrollError || !enrolled?.totp) {
        throw new OperatorError('MFA_ENROLL_FAILED', `TOTP enrollment was refused (${redactor.text(enrollError?.message ?? 'no factor returned')}) -- nothing was created`);
      }
      redactor.add(enrolled.totp.secret, enrolled.totp.uri, enrolled.totp.qr_code);
      newFactorId = enrolled.id;
      factorId = enrolled.id;
      io.showSensitive([
        'Scan this QR code with your authenticator app (it is shown here only, and cleared after verification):',
        await renderQr(enrolled.totp.uri),
        `Setup key, only if the QR code does not scan: ${enrolled.totp.secret}`,
      ].join('\n'));
      qrShown = true;
      enrolled = null;
    }
    await verifyTotp(client, factorId, io, redactor);
    mfaVerified = true;
    if (qrShown) {
      io.clearSensitive();
      qrShown = false;
    }
    io.print(`MFA=VERIFIED factor_id=${factorId}`);

    const { data: aal, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || aal?.currentLevel !== 'aal2') throw new OperatorError('AAL2_REQUIRED', 'the session is not AAL2 after MFA -- nothing was created');
    io.print('SESSION=aal2');

    const { data: isSuper, error: superError } = await client.rpc('is_super_admin_aal2');
    if (superError || isSuper !== true) throw new OperatorError('ROLE_NOT_SUPER_ADMIN', "this account's admin role is not super-admin -- nothing was created");
    const { data: roles, error: rolesError } = await client.from('admin_role_assignments').select('user_id, role');
    if (rolesError || roles.length !== 1 || roles[0].user_id !== userId || roles[0].role !== 'super-admin') {
      throw new OperatorError('UNEXPECTED_ADMIN_ROLES', 'admin_role_assignments must hold exactly this account as super-admin and nothing else -- nothing was created');
    }
    io.print('ROLE=super-admin (the only admin_role_assignments row)');
    await assertNoPlans(client);

    const created = [];
    for (const params of canonicalPlanVersionParams()) {
      const { data: plan, error: planError } = await client.rpc('create_plan_version', params);
      if (planError || !isUuid(plan?.id)) {
        throw new OperatorError(
          'PLAN_CREATE_FAILED',
          `${params.p_slug} was refused (${redactor.text(planError?.message ?? 'no id returned')}); created before it: ${created.map((p) => `${p.slug}=${p.id}`).join(', ') || 'none'}`
        );
      }
      created.push(plan);
    }

    const plans = await readPlans(client);
    const createdIds = new Set(created.map((p) => p.id));
    const exact = plans.length === CANONICAL_PLANS.length
      && plans.every((p) => createdIds.has(p.id) && !catalogMismatch(p) && p.version === 1);
    if (!exact) throw new OperatorError('PLAN_READBACK_FAILED', 'the plans did not read back as exactly the canonical three');
    const { data: audit, error: auditError } = await client
      .from('admin_audit_log')
      .select('id, actor_admin_id, action, resource_type, resource_id');
    const planAudit = (audit ?? []).filter((a) => a.action === 'create_plan_version');
    if (auditError || planAudit.length !== 3 || !planAudit.every((a) => a.actor_admin_id === userId && a.resource_type === 'plans' && createdIds.has(a.resource_id))) {
      throw new OperatorError('AUDIT_READBACK_FAILED', 'the three create_plan_version audit rows did not read back as expected');
    }

    io.print(`OWNER_USER_ID=${userId}`);
    for (const p of plans) io.print(`PLAN ${p.slug}=${p.id}`);
    io.print(`AUDIT_ROWS create_plan_version=${planAudit.length} other=${(audit ?? []).length - planAudit.length}`);
    io.print('STATUS=success');
    return { status: 'success', userId, factorId, planIds: plans.map((p) => p.id), auditRowIds: planAudit.map((a) => a.id) };
  } catch (err) {
    if (newFactorId && !mfaVerified) await client.auth.mfa.unenroll({ factorId: newFactorId }).catch(() => {});
    if (qrShown) io.clearSensitive();
    throw err;
  } finally {
    await signOutEverywhere(client, io);
  }
}

/**
 * @param {object} p.deps
 * @param {() => {sha, dirty}} p.deps.gitState
 * @param {(url, anonKey) => SupabaseClient} p.deps.createClient
 * @param {(uri) => Promise<string>} p.deps.renderQr
 */
export async function runOwnerCli({ argv, env, io, redactor, deps }) {
  const { command, args } = parseOwnerArgs(argv);
  const config = resolveOwnerConfig({ command, args, env });
  requireInteractive(io);
  const git = deps.gitState();
  if (config.target === 'production' && git.dirty) {
    throw new OperatorError('DIRTY_CHECKOUT', 'the checkout has uncommitted changes -- run from a clean checkout of the reviewed commit');
  }
  const { url, projectRef } = resolveSupabaseApi({ target: config.target, env });
  io.print(`[${TOOL}] ${command} target=${config.target} projectRef=${projectRef} gitSha=${git.sha} expectUserId=${config.expectUserId}`);

  const anonKey = await secretInput({ env, key: 'SUPABASE_ANON_KEY', label: 'Anon (public) key', io, redactor });
  assertApiKey(anonKey, { expected: 'public', projectRef });
  const client = deps.createClient(url, anonKey);
  client.auth.onAuthStateChange((_event, session) => {
    if (session) redactor.add(session.access_token, session.refresh_token);
  });

  if (command === 'accept-invite') return acceptInvite({ client, config, apiUrl: url, io, redactor });
  return ownerRun({ client, config, projectRef, io, redactor, renderQr: deps.renderQr });
}
