// DATA_BACKEND=supabase admin auth controller — same routes, same request
// validation, same admin_at/admin_rt cookie contract as
// controllers/adminAuthController.js, so the admin frontend cannot tell the
// two apart. Underneath, this is a genuinely different mechanism: password
// verification and TOTP MFA are both delegated to Supabase Auth (GoTrue)
// itself, per the Stage 2F Admin RBAC decision (see lib/db/drizzle/
// 0013_admin_rbac.sql's header comment) — no password hash or MFA secret is
// ever stored in a public table under this backend.
//
// The one real design wrinkle: GoTrue's MFA enroll/challenge/verify API only
// exists on a live, per-user session client — there's no admin/service-role
// equivalent. But our own login flow is stage-split across multiple HTTP
// requests (login -> mfa/setup -> mfa/confirm, or login -> mfa/verify), and
// this backend never persists a Supabase session server-side. So the
// short-lived (10 min), already-httpOnly/secure admin_at PRE-AUTH cookie also
// carries that Supabase session's access+refresh token (see the `sess` claim
// below) purely so the next request in the sequence can reconstruct a
// session client via adminSessionClient.js and continue the MFA flow as that
// specific user. This is scoped, short-lived, and never exposed to the
// browser in readable form (httpOnly) — it is not a general session-storage
// mechanism, just how this one multi-step flow survives being stateless.
//
// Refresh tokens are NOT reimplemented here (no Postgres RefreshToken table,
// no reuse-detection code of our own) — admin_rt holds GoTrue's own session
// refresh token verbatim, and refreshTokens() below simply calls GoTrue's
// refreshSession(). Rotation and reuse-detection are therefore GoTrue's,
// not ours — an explicit, documented behavioral difference from the Mongo
// path's hand-rolled RefreshToken family/reuse tracking, not an oversight.
import jwt from 'jsonwebtoken';
import { handleValidationErrors } from '../../utils/validationHelper.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  signAccessToken,
} from '../../utils/adminAuthTokens.js';
import { getAnonClient } from './authClients.js';
import { createAdminSessionClient } from './adminSessionClient.js';
import { loadAdminById, hasVerifiedMfaFactor, getAdminPermissions } from './loadAdmin.js';
import { auditAdminAuthEvent } from './adminAuditLog.js';
import { SUPABASE_AT_COOKIE, supabaseAtCookieOptions } from './supabaseSessionCookie.js';

// Same validation chains the Mongo controller uses — pure express-validator,
// no backend dependency.
export { loginValidation, mfaTokenValidation } from '../../controllers/adminAuthController.js';

const PRE_AUTH_TTL_MS = 10 * 60 * 1000;
const normEmail = (v) => String(v ?? '').toLowerCase().trim();

function signPreAuthToken(payload) {
  return jwt.sign(payload, process.env.ADMIN_JWT_ACCESS_SECRET, { expiresIn: '10m' });
}

function readPreAuthToken(req) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) return { error: { status: 401, message: 'Pre-auth token missing' } };
  try {
    const raw = jwt.verify(token, process.env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    // Strip the standard registered claims jwt.verify() adds to the decoded
    // payload (iat/exp[/nbf]) before handing it back — setupMfa() spreads
    // this `decoded` object into a NEW signPreAuthToken({...decoded, ...})
    // call with its own `expiresIn`, and jsonwebtoken refuses to sign a
    // payload that already carries `exp` together with an `expiresIn`
    // option ("Bad \"options.expiresIn\" option the payload already has an
    // \"exp\" property"). This was a real, previously-undiscovered bug:
    // every real mfa_setup step failed with a 500 the first time it was
    // exercised through the actual HTTP login->mfa_setup chain rather than
    // a hand-signed rehearsal token (found via
    // rehearsal-auth-migration-real-gotrue.mjs).
    const decoded = { ...raw };
    delete decoded.iat;
    delete decoded.exp;
    delete decoded.nbf;
    return { decoded };
  } catch {
    return { error: { status: 401, message: 'Invalid or expired pre-auth token' } };
  }
}

// ── POST /api/v1/admin/auth/login ────────────────────────────────────────────
export async function login(req, res) {
  if (handleValidationErrors(req, res)) return;

  const email = normEmail(req.body.email);
  const { password } = req.body;

  const anon = getAnonClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.user || !data?.session) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const admin = await loadAdminById(data.user.id);
  if (!admin) {
    // Authenticated with GoTrue but not an admin (no admin_role_assignments
    // row) — same externally-visible outcome as "wrong password" (no account
    // enumeration), matching the Mongo path's undifferentiated 401.
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const mfaEnabled = await hasVerifiedMfaFactor(admin.id);
  const stage = mfaEnabled ? 'mfa' : 'mfa_setup';

  const payload = {
    id: admin.id,
    role: admin.role,
    stage,
    sess: { at: data.session.access_token, rt: data.session.refresh_token },
  };

  if (stage === 'mfa') {
    const sessionClient = await createAdminSessionClient(data.session.access_token, data.session.refresh_token);
    const { data: factorsData, error: factorsErr } = await sessionClient.auth.mfa.listFactors();
    const factor = !factorsErr && factorsData?.totp?.find((f) => f.status === 'verified');
    if (!factor) {
      // hasVerifiedMfaFactor() said yes but listFactors() disagrees — treat as
      // a data-consistency edge case rather than crash the login flow.
      return res.status(500).json({ message: 'MFA factor lookup failed. Contact super-admin.' });
    }
    payload.factorId = factor.id;
  }

  res.cookie(ACCESS_TOKEN_COOKIE, signPreAuthToken(payload), {
    ...accessCookieOptions(),
    maxAge: PRE_AUTH_TTL_MS,
  });

  await auditAdminAuthEvent({ adminId: admin.id, action: 'auth.login_stage1' });

  return res.json({ stage });
}

// ── POST /api/v1/admin/auth/mfa/setup ───────────────────────────────────────
export async function setupMfa(req, res) {
  const { decoded, error } = readPreAuthToken(req);
  if (error) return res.status(error.status).json({ message: error.message });
  if (decoded.stage !== 'mfa_setup') {
    return res.status(403).json({ message: 'MFA setup not required at this stage' });
  }

  const sessionClient = await createAdminSessionClient(decoded.sess.at, decoded.sess.rt);
  const { data, error: enrollErr } = await sessionClient.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `admin-${Date.now()}`,
  });
  if (enrollErr) {
    return res.status(400).json({ message: enrollErr.message });
  }

  res.cookie(
    ACCESS_TOKEN_COOKIE,
    signPreAuthToken({ ...decoded, factorId: data.id }),
    { ...accessCookieOptions(), maxAge: PRE_AUTH_TTL_MS }
  );

  return res.json({
    qrCode: data.totp.qr_code, // GoTrue returns an SVG data URI, not the qrcode-lib PNG the Mongo path uses
    secret: data.totp.secret,
  });
}

// ── POST /api/v1/admin/auth/mfa/confirm ─────────────────────────────────────
export async function confirmMfaSetup(req, res) {
  if (handleValidationErrors(req, res)) return;

  const { decoded, error } = readPreAuthToken(req);
  if (error) return res.status(error.status).json({ message: error.message });
  if (decoded.stage !== 'mfa_setup') {
    return res.status(403).json({ message: 'MFA confirmation not expected at this stage' });
  }
  if (!decoded.factorId) {
    return res.status(400).json({ message: 'No pending MFA setup found. Run /mfa/setup first.' });
  }

  const sessionClient = await createAdminSessionClient(decoded.sess.at, decoded.sess.rt);
  const { data: chData, error: chErr } = await sessionClient.auth.mfa.challenge({ factorId: decoded.factorId });
  if (chErr) return res.status(400).json({ message: 'Invalid TOTP code' });

  // supabase-js's mfa.verify() resolves to the new session's tokens FLAT on
  // `data` (data.access_token/data.refresh_token) — NOT nested under
  // `data.session` the way signInWithPassword()/setSession() responses are.
  // This was a real, previously-undiscovered bug: checking `vData?.session`
  // is always falsy for a real verify() response, so this endpoint 400'd
  // "Invalid TOTP code" on every real TOTP code, correct or not — no admin
  // could ever complete MFA enrollment against real GoTrue. Masked in every
  // prior rehearsal because those hand-signed AAL2 tokens directly and
  // never called mfa.verify() at all. Found via
  // rehearsal-auth-migration-real-gotrue.mjs (a direct supabase-js probe
  // isolating enroll->challenge->verify from this controller confirmed the
  // real response shape).
  const { data: vData, error: vErr } = await sessionClient.auth.mfa.verify({
    factorId: decoded.factorId,
    challengeId: chData.id,
    code: req.body.token,
  });
  if (vErr || !vData?.access_token) return res.status(400).json({ message: 'Invalid TOTP code' });

  const accessToken = signAccessToken(decoded.id, decoded.role, true);
  res
    .cookie(ACCESS_TOKEN_COOKIE, accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, vData.refresh_token, refreshCookieOptions())
    .cookie(SUPABASE_AT_COOKIE, vData.access_token, supabaseAtCookieOptions());

  await auditAdminAuthEvent({ adminId: decoded.id, action: 'auth.mfa_activated' });

  return res.json({ message: '2FA activated and session started' });
}

// ── POST /api/v1/admin/auth/mfa/verify ──────────────────────────────────────
export async function verifyMfaLogin(req, res) {
  if (handleValidationErrors(req, res)) return;

  const { decoded, error } = readPreAuthToken(req);
  if (error) return res.status(error.status).json({ message: error.message });
  if (decoded.stage !== 'mfa') {
    return res.status(403).json({ message: 'MFA verification not expected at this stage' });
  }
  if (!decoded.factorId) {
    return res.status(500).json({ message: 'MFA factor missing from session. Log in again.' });
  }

  const sessionClient = await createAdminSessionClient(decoded.sess.at, decoded.sess.rt);
  const { data: chData, error: chErr } = await sessionClient.auth.mfa.challenge({ factorId: decoded.factorId });
  if (chErr) return res.status(401).json({ message: 'Invalid TOTP code' });

  // Same flat-shape response as confirmMfaSetup() above (data.access_token/
  // data.refresh_token, not data.session.*) — see that function's comment.
  const { data: vData, error: vErr } = await sessionClient.auth.mfa.verify({
    factorId: decoded.factorId,
    challengeId: chData.id,
    code: req.body.token,
  });
  if (vErr || !vData?.access_token) {
    await auditAdminAuthEvent({ adminId: decoded.id, action: 'auth.mfa_failed', severity: 'warning' });
    return res.status(401).json({ message: 'Invalid TOTP code' });
  }

  const admin = await loadAdminById(decoded.id);
  if (!admin) return res.status(401).json({ message: 'Account not found or deactivated' });

  const accessToken = signAccessToken(admin.id, admin.role, true);
  res
    .cookie(ACCESS_TOKEN_COOKIE, accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, vData.refresh_token, refreshCookieOptions())
    .cookie(SUPABASE_AT_COOKIE, vData.access_token, supabaseAtCookieOptions());

  await auditAdminAuthEvent({ adminId: admin.id, action: 'auth.login_success' });

  const permissions = await getAdminPermissions(admin.id, admin.role);
  return res.json({
    message: 'Login successful',
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, permissions },
  });
}

// ── POST /api/v1/admin/auth/refresh ─────────────────────────────────────────
export async function refreshTokens(req, res) {
  const rawRefresh = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!rawRefresh) return res.status(401).json({ message: 'Refresh token missing' });

  const client = getAnonClient();
  const { data, error } = await client.auth.refreshSession({ refresh_token: rawRefresh });

  if (error || !data?.session) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/api/v1/admin' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth/refresh' });
    res.clearCookie(SUPABASE_AT_COOKIE, { path: '/api/v1/admin' });
    // GoTrue itself detects refresh-token reuse (rotation is enabled project-
    // wide) and returns an error on the reused token — we cannot cleanly
    // distinguish "expired" from "reuse" from its generic error shape, so
    // both surface as an expired-session response; either way the cookies
    // above are cleared and the admin must log in again.
    return res.status(401).json({ message: 'Refresh token expired', code: 'TOKEN_EXPIRED' });
  }

  const admin = await loadAdminById(data.session.user.id);
  if (!admin) return res.status(401).json({ message: 'Account not found or deactivated' });

  // `mfaVerified` here is informational only (mirrors the claim shape the
  // Mongo-mode token carries) — it is never trusted as AAL2 proof under this
  // backend. The real, per-request AAL2 check re-verifies admin_sat's own
  // signature and `aal` claim in middleware/adminAuth.js, every request.
  const claims = jwt.decode(data.session.access_token) ?? {};
  const accessToken = signAccessToken(admin.id, admin.role, claims.aal === 'aal2');

  res
    .cookie(ACCESS_TOKEN_COOKIE, accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, data.session.refresh_token, refreshCookieOptions())
    .cookie(SUPABASE_AT_COOKIE, data.session.access_token, supabaseAtCookieOptions());

  return res.json({ message: 'Tokens refreshed' });
}

// ── POST /api/v1/admin/auth/logout ───────────────────────────────────────────
export async function logout(req, res) {
  const rawRefresh = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (rawRefresh) {
    try {
      const client = getAnonClient();
      const { error } = await client.auth.refreshSession({ refresh_token: rawRefresh });
      if (!error) await client.auth.signOut({ scope: 'global' });
    } catch {
      // Best-effort revoke, same spirit as the Mongo path's best-effort
      // family revoke — an already-expired/invalid token needs no revoking.
    }
  }

  if (req.adminUser) {
    await auditAdminAuthEvent({ adminId: req.adminUser.id, action: 'auth.logout' });
  }

  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/api/v1/admin' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth/refresh' });
  res.clearCookie(SUPABASE_AT_COOKIE, { path: '/api/v1/admin' });

  return res.json({ message: 'Logged out successfully' });
}
