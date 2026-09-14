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
import logger from '../../config/logger.js';
import { handleValidationErrors } from '../../utils/validationHelper.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  signAccessToken,
  clearLegacyRefreshCookie,
} from '../../utils/adminAuthTokens.js';
import { getAnonClient, createScopedAnonClient, revokeGoTrueSession, exchangeRefreshTokenForAccessToken } from './authClients.js';
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
  // Legacy-Path clear MUST precede the real .cookie() set below — supertest/
  // superagent's test-harness cookiejar (unlike a spec-compliant browser)
  // resolves two same-named Set-Cookie headers by Path-prefix collision
  // rather than exact-Path identity, so clearing the narrower legacy Path
  // AFTER setting the real, wider-Path cookie in the same response wipes
  // the real cookie right back out of the jar. See clearLegacyRefreshCookie
  // itself (utils/adminAuthTokens.js) for the Path-migration rationale.
  clearLegacyRefreshCookie(res);
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
  clearLegacyRefreshCookie(res); // must precede the real .cookie() set below — see confirmMfaSetup()'s comment on why
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

  // Auth hardening security batch: this used to call getAnonClient() — the
  // module-level SHARED singleton. supabase-js keeps an in-memory
  // currentSession on the client instance itself even with
  // persistSession:false (that flag only controls the storage adapter,
  // not in-memory state), and refreshSession()/signOut() read/mutate that
  // ambient state, not just their own return value. Two concurrent admin
  // sessions refreshing at the same time on the shared client could
  // clobber each other's in-memory session — the exact hazard
  // authController.js's resetPassword() already documented and solved for
  // itself via createScopedAnonClient(). This call only ever reads
  // `data.session` from THIS call's own return value below, so it was not
  // actually exploitable here — but using the scoped client removes any
  // shared ambient state for this request entirely, matching the
  // established pattern and closing the same hazard class as logout()
  // below, which — unlike this function — DID read ambient client state
  // and therefore WAS exploitable (see logout()'s own comment).
  const client = createScopedAnonClient();
  const { data, error } = await client.auth.refreshSession({ refresh_token: rawRefresh });

  if (error || !data?.session) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/api/v1/admin' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth' });
    res.clearCookie(SUPABASE_AT_COOKIE, { path: '/api/v1/admin' });
    clearLegacyRefreshCookie(res); // see its own comment (utils/adminAuthTokens.js) — Path migration
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

  clearLegacyRefreshCookie(res); // must precede the real .cookie() set below — see confirmMfaSetup()'s comment on why
  res
    .cookie(ACCESS_TOKEN_COOKIE, accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, data.session.refresh_token, refreshCookieOptions())
    .cookie(SUPABASE_AT_COOKIE, data.session.access_token, supabaseAtCookieOptions());

  return res.json({ message: 'Tokens refreshed' });
}

// ── POST /api/v1/admin/auth/logout ───────────────────────────────────────────
/**
 * Reachable even when admin_at has already expired — this route no longer
 * sits behind verifyAccessToken (see
 * data/supabase/routes/adminAuthRoutes.js and middleware/adminAuth.js's
 * identifyAdminForLogout()). Its actual revocation logic never depended on
 * admin_at: it tries admin_sat (SUPABASE_AT_COOKIE, Path=/api/v1/admin)
 * first, and — since that cookie shares admin_at's own short 15-minute
 * window and may just as well have expired by the time this runs — falls
 * back to redeeming admin_rt (a real GoTrue refresh token) for a fresh
 * access token purely to revoke with, when admin_sat is missing or GoTrue
 * itself rejects it. Either path performs a real, global, server-side
 * GoTrue revocation; see this function's own comments for the full
 * reasoning.
 */
export async function logout(req, res) {
  // admin_rt (REFRESH_TOKEN_COOKIE) is now Path-scoped to the whole /auth
  // subtree (utils/adminAuthTokens.js's refreshCookieOptions — widened so
  // the Mongo backend's logout() can revoke via it too), so it DOES reach
  // this route now. admin_sat (SUPABASE_AT_COOKIE, Path=/api/v1/admin) is
  // the DIRECT credential revokeGoTrueSession() needs — see its comment in
  // authClients.js for why this calls GoTrue's REST endpoint directly
  // rather than through a supabase-js client's signOut() — and is tried
  // first below since it needs no extra network round trip when it's
  // simply still valid.
  const supabaseAccessToken = req.cookies?.[SUPABASE_AT_COOKIE];
  const rawRefresh = req.cookies?.[REFRESH_TOKEN_COOKIE];
  let upstreamRevocationFailed = false;

  // Review follow-up (round 5): the entire revoke/audit sequence below now
  // runs inside this try, with cookie-clearing moved to `finally` — an
  // admin must never be stuck looking "logged in" in their own browser
  // because of ANY unexpected throw here (not just the specific failure
  // modes each inner try/catch already anticipates). Every call in this
  // block already has its own non-throwing failure path
  // (exchangeRefreshTokenForAccessToken/revokeGoTrueSession never reject;
  // both auditAdminAuthEvent calls have their own try/catch), so this outer
  // catch is defense-in-depth for a genuinely unforeseen error, not the
  // primary handler for any of the documented failure modes below.
  try {
    // Review follow-up (round 5.1): kept in its OWN variable, separate from
    // the final revokeResult below — a failed admin_sat attempt is a real,
    // already-happened failure (an already-issued GoTrue session this call
    // could not reach to revoke) and must never be silently erased just
    // because the admin_rt fallback below turns out to have nothing further
    // to do. The previous version reused a single `revokeResult` variable
    // for both attempts, so admin_rt confirming "already invalid" after a
    // FAILED admin_sat attempt (e.g. GoTrue returned 503, or the call timed
    // out) overwrote that real failure with `{ ok: true }` — reporting a
    // fully successful logout (no upstreamRevocationFailed, no audit) while
    // the admin's actual GoTrue session, tied to admin_sat, was never
    // reached at all.
    const primaryResult = supabaseAccessToken ? await revokeGoTrueSession(supabaseAccessToken, 'global') : null;
    let revokeResult = primaryResult;

    // Review follow-up: admin_sat shares admin_at's short 15-minute window —
    // by the time an idle admin actually clicks logout (or an admin_at-expired
    // logout retry per identifyAdminForLogout's own grace window fires), it
    // may well be gone or already rejected by GoTrue above. Leaving it there
    // meant a real, still-live GoTrue session — and the still-valid admin_rt
    // refresh token that can silently resurrect it — was left completely
    // untouched server-side: this app's own cookies were cleared locally, but
    // anyone holding a copy of admin_rt (the admin's other tabs, or an
    // attacker who stole it) could still mint fresh GoTrue sessions from it
    // forever, "logout" notwithstanding. admin_rt IS a real GoTrue refresh
    // token (this backend never reimplements its own — see this file's
    // module comment), so exchangeRefreshTokenForAccessToken() (a bounded,
    // AbortController-timed direct GoTrue REST call — see its own comment in
    // authClients.js for why this no longer goes through a supabase-js
    // client's refreshSession() at all) redeems it for a fresh access token
    // purely to hand straight to revokeGoTrueSession() — this performs a
    // real, global, server-side revocation exactly like the admin_sat path
    // above, just reached via one extra hop. The fresh access token this
    // mints is deliberately NEVER cookied back to this response: a client
    // that asked to log out must never receive a freshly-live session in the
    // same response that claims to have ended it.
    if (!primaryResult?.ok && rawRefresh) {
      const exchangeResult = await exchangeRefreshTokenForAccessToken(rawRefresh);

      if (exchangeResult.ok) {
        const fallbackRevoke = await revokeGoTrueSession(exchangeResult.accessToken, 'global');
        if (fallbackRevoke.ok) {
          // A genuine, successful GoTrue revocation happened via the
          // redeemed admin_rt token — this (and the "no admin_sat attempt +
          // GoTrue explicitly confirms admin_rt is already dead" branch
          // below) are the ONLY two conditions that may supersede a prior
          // admin_sat failure. Self-healed: no failure to report.
          revokeResult = fallbackRevoke;
        } else if (primaryResult) {
          // admin_sat was attempted and failed; admin_rt redeemed fine but
          // the SUBSEQUENT revoke call itself also failed operationally —
          // keep the original admin_sat failure as the one reported (both
          // attempts failing is still one real, unrecovered failure, not a
          // reason to fabricate a different one or a success).
          revokeResult = primaryResult;
        } else {
          // No admin_sat attempt ever existed — this fallback revoke
          // failure is the only failure there is to report.
          revokeResult = fallbackRevoke;
        }
      } else if (exchangeResult.reason === 'refresh_token_invalid') {
        if (primaryResult) {
          // Review follow-up (round 5.1): admin_sat WAS attempted and
          // failed (e.g. GoTrue was down, or the call timed out) — admin_rt
          // separately turning out to already be dead does NOT retroactively
          // make the admin_sat failure a success. An already-issued
          // admin_sat session this call could not reach GoTrue to revoke is
          // a real, unresolved failure regardless of admin_rt's own state;
          // previously this branch unconditionally set `{ ok: true }` here,
          // hiding that real failure from both the response and the audit
          // log.
          revokeResult = primaryResult;
        } else {
          // No admin_sat attempt ever happened (it was simply absent), and
          // GoTrue's own EXPLICIT confirmation
          // (isExplicitInvalidRefreshTokenResponse() in authClients.js) says
          // admin_rt is already dead — there was genuinely nothing to
          // revoke in the first place.
          revokeResult = { ok: true, reason: 'refresh_token_already_invalid' };
        }
      } else {
        // The admin_rt exchange itself hit a real operational failure
        // (network error, timeout, HTTP 5xx, or an unexpected response
        // shape — never silently read as "already invalid"; see
        // authClients.js's isExplicitInvalidRefreshTokenResponse()). Keep
        // the admin_sat failure if one exists (same reasoning as above) —
        // otherwise this IS the failure to report.
        revokeResult = primaryResult ?? {
          ok:      false,
          reason:  exchangeResult.reason,
          status:  exchangeResult.status ?? null,
          message: exchangeResult.message ?? null,
        };
      }
    }

    if (revokeResult && !revokeResult.ok) {
      // Review follow-up: this used to be silently discarded (the caller
      // never even looked at the return value). Cookies are ALWAYS cleared
      // locally regardless (see `finally` below) — an admin must never be
      // stuck looking "logged in" in their own browser just because GoTrue
      // was unreachable, timed out, or rejected the call — but a real
      // upstream failure here means the admin's GoTrue session may still be
      // alive on other devices/tabs, which is exactly the kind of thing
      // that needs to be logged and auditable, not swallowed.
      // revokeResult.reason is one of 'non_2xx_response' | 'network_error' |
      // 'timeout' | 'unexpected_response' — see authClients.js's
      // revokeGoTrueSession()/exchangeRefreshTokenForAccessToken() for the
      // bounded, AbortController-based timeout that produces 'timeout'; a
      // hung GoTrue call must never hang this response.
      upstreamRevocationFailed = true;
      logger.error('Admin logout: GoTrue session revocation failed', {
        adminId: req.adminUser?.id ?? null,
        reason:  revokeResult.reason,
        status:  revokeResult.status ?? null,
        message: revokeResult.message ?? null,
      });
      // Review follow-up: an audit-write failure here must never prevent
      // the local cookie clearing below — see the matching comment on the
      // 'auth.logout' audit call further down for the full rationale.
      if (req.adminUser) {
        try {
          await auditAdminAuthEvent({
            adminId:  req.adminUser.id,
            action:   'auth.logout_gotrue_revoke_failed',
            severity: 'warning',
            after:    { reason: revokeResult.reason, status: revokeResult.status ?? null },
          });
        } catch (err) {
          logger.error('Admin logout: failed to audit the GoTrue revoke failure itself — cookies are still cleared locally', {
            adminId: req.adminUser?.id ?? null,
            error:   err.message,
          });
        }
      }
    }

    // Review follow-up: an audit-write failure (e.g. Postgres unreachable)
    // must never prevent this app's own cookies from being cleared locally —
    // an admin must never be stuck looking "logged in" in their own browser
    // just because the audit log couldn't be written. The failure is still
    // logged (not silently swallowed), just never allowed to abort the
    // response below.
    if (req.adminUser) {
      try {
        await auditAdminAuthEvent({ adminId: req.adminUser.id, action: 'auth.logout' });
      } catch (err) {
        logger.error('Admin logout: audit write failed — cookies are still cleared locally', {
          adminId: req.adminUser?.id ?? null,
          error:   err.message,
        });
      }
    }
  } catch (err) {
    // Defense in depth (see this function's opening comment) — nothing
    // above is expected to reach here, but if it ever does, this must still
    // behave like any other upstream-revocation failure: logged, audited
    // when the caller's identity is known (round 5.1 review follow-up — this
    // used to only log, silently skipping the audit trail a documented
    // revoke failure always gets), and never allowed to block cookie-
    // clearing below, no matter what happens next.
    upstreamRevocationFailed = true;
    logger.error('Admin logout: unexpected error during GoTrue revocation/audit — cookies are still cleared locally', {
      adminId: req.adminUser?.id ?? null,
      error:   err.message,
    });
    if (req.adminUser) {
      try {
        await auditAdminAuthEvent({
          adminId:  req.adminUser.id,
          action:   'auth.logout_gotrue_revoke_failed',
          severity: 'warning',
          after:    { reason: 'unexpected_error', message: err.message },
        });
      } catch (auditErr) {
        // Review follow-up: an audit-write failure HERE (on top of the
        // already-unexpected error above) must be exactly as non-fatal as
        // every other audit failure in this function — logged, never
        // rethrown, never allowed to skip the `finally` cookie-clearing
        // below or turn this into a 500.
        logger.error('Admin logout: failed to audit the unexpected revocation error itself — cookies are still cleared locally', {
          adminId: req.adminUser?.id ?? null,
          error:   auditErr.message,
        });
      }
    }
  } finally {
    // Review follow-up (round 5): moved into `finally` so this runs no
    // matter what happened above — including the genuinely unforeseen throw
    // the outer catch exists for. An admin's own browser must always end up
    // logged out locally, even on a codepath nobody anticipated.
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/api/v1/admin' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth' });
    res.clearCookie(SUPABASE_AT_COOKIE, { path: '/api/v1/admin' });
    clearLegacyRefreshCookie(res); // see its own comment (utils/adminAuthTokens.js) — Path migration
  }

  return res.json({
    message: 'Logged out successfully',
    // Present only when the upstream GoTrue revocation failed — this
    // app's own (local) logout still always succeeds either way. See
    // revokeGoTrueSession()'s comment on why the already-issued admin_sat
    // access token stays cryptographically valid until its own expiry
    // regardless of this call's outcome.
    ...(upstreamRevocationFailed ? { upstreamRevocationFailed: true } : {}),
  });
}
