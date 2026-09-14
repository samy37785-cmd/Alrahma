import crypto    from 'crypto';
import speakeasy from 'speakeasy';
import qrcode    from 'qrcode';
import jwt       from 'jsonwebtoken';
import { body } from 'express-validator';

import AdminUser    from '../models/AdminUser.js';
import RefreshToken  from '../models/RefreshToken.js';
import TokenFamily   from '../models/TokenFamily.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  signAccessToken,
  clearLegacyRefreshCookie,
} from '../utils/adminAuthTokens.js';
import { anonymizeIp } from '../config/encryption.js';
import { hashToken } from '../utils/hashToken.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { auditFromAdmin } from '../services/auditService.js';
import logger from '../config/logger.js';

// ── Constants ────────────────────────────────────────────────────────────────
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateRawRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function issueRefreshToken(adminId, family, req) {
  const raw       = generateRawRefreshToken();
  const tokenHash = hashToken(raw);
  await RefreshToken.create({
    tokenHash,
    adminId,
    family,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: req.headers['user-agent'] ?? null,
    ipAnon:    anonymizeIp(req.ip ?? ''),
  });

  // Race fix (see refreshTokens()'s reuse branch for the matching half of
  // this proof): a concurrent reuse-detection sweep for this SAME family
  // may be running right now against a *different* racer presenting the
  // token we just rotated away from. That sweep always writes the
  // TokenFamily.revoked flag BEFORE it sweeps existing RefreshToken docs.
  // So exactly one of two things is guaranteed, regardless of real-time
  // interleaving: either that sweep's query runs AFTER our insert above
  // and catches this brand-new document directly, or it runs before our
  // insert -- in which case the flag it set is already `true` by the time
  // we check it here, and we catch ourselves. There is no ordering under
  // which both miss it (the sweep's own two writes are strictly ordered:
  // flag-write happens-before token-sweep; ours are strictly ordered too:
  // insert happens-before this check). This lets the atomic claim-winner
  // in refreshTokens() still unconditionally succeed (its own response
  // must not be retroactively failed just because another racer showed
  // up), while guaranteeing the token it walks away with can never
  // outlive a reuse signal raised against its family.
  // Combines the self-check read with the TTL-lifecycle touch (see
  // models/TokenFamily.js's lastActivityAt/TTL-index comment) in one round
  // trip: findOneAndUpdate returns the PRE-update document by default, so
  // `revoked` below still reflects the state at the moment of this read,
  // exactly like the plain findOne() this replaced.
  const familyDoc = await TokenFamily.findOneAndUpdate(
    { family },
    { $set: { lastActivityAt: new Date() } },
  ).lean();
  if (familyDoc?.revoked) {
    await RefreshToken.updateOne({ tokenHash }, { $set: { revoked: true } });
  }

  return raw;
}

// ── Validation chains ────────────────────────────────────────────────────────
export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isString().notEmpty().withMessage('Password required'),
];

export const mfaTokenValidation = [
  body('token')
    .isString()
    .matches(/^\d{6}$/)
    .withMessage('TOTP token must be exactly 6 digits'),
];

// ── POST /api/v1/admin/auth/login ────────────────────────────────────────────
/**
 * Stage 1 of login.
 * Returns a short-lived pre-auth JWT in a cookie (stage: 'mfa').
 * If MFA is not yet set up, returns stage: 'mfa_setup' instead.
 */
export async function login(req, res) {
  if (handleValidationErrors(req, res)) return;

  const { email, password } = req.body;

  // Always select password (excluded by default)
  const admin = await AdminUser.findOne({ email }).select('+password');
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (admin.isLocked()) {
    return res.status(423).json({
      message: 'Account temporarily locked. Too many failed login attempts.',
      code:    'ACCOUNT_LOCKED',
    });
  }

  const passwordOk = await admin.matchPassword(password);
  if (!passwordOk) {
    await admin.incrementFailedAttempts();
    await auditFromAdmin(admin, 'auth.login_failed', req, {
      severity: 'warning',
      metadata: { reason: 'bad_password' },
    });
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  await admin.resetFailedAttempts();

  // Determine which stage the client must complete next
  const stage = admin.mfaEnabled ? 'mfa' : 'mfa_setup';

  // Pre-auth token: narrow — only valid for the MFA endpoints
  const preAuthToken = jwt.sign(
    { id: String(admin._id), role: admin.role, stage },
    process.env.ADMIN_JWT_ACCESS_SECRET,
    { expiresIn: '10m' }
  );

  res.cookie(ACCESS_TOKEN_COOKIE, preAuthToken, {
    ...accessCookieOptions(),
    maxAge: 10 * 60 * 1000, // 10 min pre-auth window
  });

  await auditFromAdmin(admin, 'auth.login_stage1', req);

  return res.json({ stage });
}

// ── POST /api/v1/admin/auth/mfa/setup ───────────────────────────────────────
/**
 * Generates a new TOTP secret and returns a QR-code data URL.
 * Admin must confirm setup via /mfa/confirm before MFA is activated.
 * Requires stage === 'mfa_setup' in the pre-auth cookie.
 */
export async function setupMfa(req, res) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) return res.status(401).json({ message: 'Pre-auth token missing' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Invalid or expired pre-auth token' });
  }

  if (decoded.stage !== 'mfa_setup') {
    return res.status(403).json({ message: 'MFA setup not required at this stage' });
  }

  const admin = await AdminUser.findById(decoded.id).select('+_mfaPendingSecret');
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Account not found or deactivated' });
  }

  // Generate a fresh TOTP secret
  const secret = speakeasy.generateSecret({
    name:   `Al-Rahma Admin (${admin.email})`,
    length: 32,
  });

  admin.setMfaPendingSecret(secret.base32);
  await admin.save({ validateBeforeSave: false });

  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

  return res.json({
    qrCode: qrDataUrl,
    secret: secret.base32, // show once so admin can manually add to authenticator
  });
}

// ── POST /api/v1/admin/auth/mfa/confirm ─────────────────────────────────────
/**
 * Confirms the pending TOTP secret by verifying the first code.
 * On success, activates MFA and promotes the pre-auth token to a full access token.
 */
export async function confirmMfaSetup(req, res) {
  if (handleValidationErrors(req, res)) return;

  const preToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!preToken) return res.status(401).json({ message: 'Pre-auth token missing' });

  let decoded;
  try {
    decoded = jwt.verify(preToken, process.env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Invalid or expired pre-auth token' });
  }

  if (decoded.stage !== 'mfa_setup') {
    return res.status(403).json({ message: 'MFA confirmation not expected at this stage' });
  }

  const admin = await AdminUser.findById(decoded.id).select('+_mfaPendingSecret');
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Account not found or deactivated' });
  }

  const pendingSecret = admin.getMfaPendingSecret();
  if (!pendingSecret) {
    return res.status(400).json({ message: 'No pending MFA setup found. Run /mfa/setup first.' });
  }

  const { token: totpToken } = req.body;
  const valid = speakeasy.totp.verify({
    secret:   pendingSecret,
    encoding: 'base32',
    token:    totpToken,
    window:   1,
  });

  if (!valid) {
    return res.status(400).json({ message: 'Invalid TOTP code' });
  }

  // Promote pending secret to active and enable MFA
  admin.setMfaSecret(pendingSecret);
  admin.setMfaPendingSecret(null);
  admin.mfaEnabled = true;
  await admin.save({ validateBeforeSave: false });

  // Issue full access + refresh tokens
  const accessToken = signAccessToken(admin._id, admin.role, true);
  const family      = crypto.randomUUID();
  await TokenFamily.create({ family, adminId: admin._id });
  const rawRefresh  = await issueRefreshToken(admin._id, family, req);

  // Legacy-Path clear MUST precede the real .cookie() set below, not follow
  // it — supertest/superagent's test-harness cookiejar (unlike a spec-
  // compliant browser) resolves two same-named Set-Cookie headers by
  // Path-prefix collision rather than exact-Path identity, so clearing the
  // narrower legacy Path AFTER setting the real, wider-Path cookie in the
  // same response wipes the real cookie right back out of the jar. Clearing
  // first means there is nothing left for the real .cookie() call below to
  // collide with. See clearLegacyRefreshCookie's own comment
  // (utils/adminAuthTokens.js) for the Path-migration rationale itself.
  clearLegacyRefreshCookie(res);
  res
    .cookie(ACCESS_TOKEN_COOKIE,  accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, rawRefresh,  refreshCookieOptions());

  await auditFromAdmin(admin, 'auth.mfa_activated', req);

  return res.json({ message: '2FA activated and session started' });
}

// ── POST /api/v1/admin/auth/mfa/verify ──────────────────────────────────────
/**
 * Stage 2 of login for accounts that already have MFA enabled.
 * Verifies the TOTP code and issues full tokens.
 */
export async function verifyMfaLogin(req, res) {
  if (handleValidationErrors(req, res)) return;

  const preToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!preToken) return res.status(401).json({ message: 'Pre-auth token missing' });

  let decoded;
  try {
    decoded = jwt.verify(preToken, process.env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Invalid or expired pre-auth token' });
  }

  if (decoded.stage !== 'mfa') {
    return res.status(403).json({ message: 'MFA verification not expected at this stage' });
  }

  const admin = await AdminUser.findById(decoded.id).select('+_mfaSecret');
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Account not found or deactivated' });
  }

  if (!admin.mfaEnabled) {
    return res.status(400).json({ message: 'MFA is not enabled on this account' });
  }

  const mfaSecret = admin.getMfaSecret();
  if (!mfaSecret) {
    return res.status(500).json({ message: 'MFA secret missing. Contact super-admin.' });
  }

  const { token: totpToken } = req.body;
  const valid = speakeasy.totp.verify({
    secret:   mfaSecret,
    encoding: 'base32',
    token:    totpToken,
    window:   1,
  });

  if (!valid) {
    await admin.incrementFailedAttempts();
    await auditFromAdmin(admin, 'auth.mfa_failed', req, {
      severity: 'warning',
      metadata: { reason: 'bad_totp' },
    });
    return res.status(401).json({ message: 'Invalid TOTP code' });
  }

  await admin.resetFailedAttempts();

  // Update last login metadata
  admin.lastLoginAt = new Date();
  admin.lastLoginIp = anonymizeIp(req.ip ?? '');
  await admin.save({ validateBeforeSave: false });

  const accessToken = signAccessToken(admin._id, admin.role, true);
  const family      = crypto.randomUUID();
  await TokenFamily.create({ family, adminId: admin._id });
  const rawRefresh  = await issueRefreshToken(admin._id, family, req);

  clearLegacyRefreshCookie(res); // must precede the real .cookie() set below — see confirmMfaSetup()'s comment on why
  res
    .cookie(ACCESS_TOKEN_COOKIE,  accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, rawRefresh,  refreshCookieOptions());

  await auditFromAdmin(admin, 'auth.login_success', req);

  return res.json({
    message: 'Login successful',
    admin: {
      id:          String(admin._id),
      name:        admin.name,
      email:       admin.email,
      role:        admin.role,
      permissions: admin.getPermissions(),
    },
  });
}

// ── POST /api/v1/admin/auth/refresh ─────────────────────────────────────────
/**
 * Rotates the refresh token.
 * Reuse detection: if the presented token was already used, the entire family
 * is revoked immediately (signals token theft).
 */
export async function refreshTokens(req, res) {
  const rawRefresh = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!rawRefresh) return res.status(401).json({ message: 'Refresh token missing' });

  const tokenHash = hashToken(rawRefresh);

  // Auth hardening security batch: the "is this token still unused" check
  // and the "mark it used" write used to be two separate steps
  // (findOne(...) then, later, stored.save()) — a real TOCTOU race. Two
  // concurrent requests presenting the SAME still-valid refresh token
  // (e.g. two tabs racing a refresh, or a genuine theft attempt) could
  // both read usedAt: null before either write landed, and both would
  // then pass the reuse check and mint a new token pair from the same
  // family — silently defeating one-time-use rotation. findOneAndUpdate's
  // filter+update is atomic at the storage-engine level: only ONE
  // concurrent caller can ever flip usedAt from null to a real timestamp
  // for a given token, so at most one request can win a race on the same
  // token. Every other racer (including a genuine double-fire from the
  // legitimate client, indistinguishable from theft at this layer by
  // design) falls through to the same reuse-detected/family-revoked path
  // below — the conservative, correct behavior for a token that fails a
  // strict single-use claim.
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, usedAt: null, revoked: false },
    { $set: { usedAt: new Date() } },
  );

  if (!claimed) {
    const existing = await RefreshToken.findOne({ tokenHash }).lean();
    if (!existing) {
      return res.status(401).json({ message: 'Refresh token not recognized' });
    }
    // Token exists but failed the atomic single-use claim above — either
    // an earlier rotation already consumed it, it was revoked, or it lost
    // a concurrent race just now. All three are reuse from this endpoint's
    // point of view: revoke the whole family and reject. The flag write
    // MUST happen before the sweep (see issueRefreshToken()'s matching
    // comment) — it's what guarantees a token minted by a concurrent
    // claim-winner for this same family can never end up live.
    await TokenFamily.updateOne(
      { family: existing.family },
      { $set: { revoked: true, revokedAt: new Date(), lastActivityAt: new Date() } },
      { upsert: true },
    );
    await RefreshToken.updateMany({ family: existing.family }, { revoked: true });
    clearLegacyRefreshCookie(res); // see confirmMfaSetup()'s comment on why this order matters
    res.clearCookie(ACCESS_TOKEN_COOKIE,  { path: '/api/v1/admin' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth' });
    return res.status(401).json({
      message: 'Refresh token reuse detected. All sessions for this device have been revoked.',
      code:    'TOKEN_REUSE',
    });
  }

  if (claimed.expiresAt < new Date()) {
    return res.status(401).json({ message: 'Refresh token expired', code: 'TOKEN_EXPIRED' });
  }

  const admin = await AdminUser.findById(claimed.adminId).lean();
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Account not found or deactivated' });
  }

  // Issue new token pair in the same family
  const accessToken = signAccessToken(admin._id, admin.role, true);
  const rawNew      = await issueRefreshToken(admin._id, claimed.family, req);

  clearLegacyRefreshCookie(res); // see confirmMfaSetup()'s comment on why this order matters
  res
    .cookie(ACCESS_TOKEN_COOKIE,  accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, rawNew,      refreshCookieOptions());

  return res.json({ message: 'Tokens refreshed' });
}

// ── POST /api/v1/admin/auth/logout ───────────────────────────────────────────
/**
 * Revokes every refresh-token family belonging to the calling admin and
 * clears cookies. Reachable even when admin_at has already expired — see
 * routes/v1/admin/authRoutes.js's route comment and
 * middleware/adminAuth.js's identifyAdminForLogout(). Also reachable, and
 * still clears cookies, even when MongoDB itself is unreachable — see
 * app.js's DB_INDEPENDENT_PATHS and this function's own try/finally below.
 */
export async function logout(req, res) {
  let targetAdminId = req.adminId ?? null;

  try {
    const rawRefresh = req.cookies?.[REFRESH_TOKEN_COOKIE];

    // Review follow-up: admin_rt (REFRESH_TOKEN_COOKIE) is now Path-scoped to
    // the whole /auth subtree (utils/adminAuthTokens.js's refreshCookieOptions)
    // rather than /auth/refresh alone, specifically so it reaches THIS route
    // too. When present, the RefreshToken document it hashes to is the most
    // authoritative source of "who is this" available — a live, DB-backed
    // proof of session ownership — so it takes priority over req.adminId
    // (which, via identifyAdminForLogout, may come from a token whose `exp`
    // has already lapsed, within a short, bounded grace window — see that
    // middleware's own comment on why an unbounded version of that trust
    // would itself be a vulnerability). Falls back to req.adminId when
    // admin_rt is missing/unrecognized (e.g. already consumed, or a caller
    // that never had one), and to a plain no-op (cookies still cleared
    // below either way) when neither identifies anyone.
    if (rawRefresh) {
      try {
        const tokenHash = hashToken(rawRefresh);
        const stored    = await RefreshToken.findOne({ tokenHash }).lean();
        if (stored) targetAdminId = stored.adminId;
      } catch (err) {
        // Review follow-up: a DB error here (e.g. MongoDB unreachable) must
        // not prevent falling back to req.adminId below, nor abort the
        // whole request — see this function's outer try/finally.
        logger.error('Admin logout: could not look up the refresh token — falling back to req.adminId if available', {
          error: err.message,
        });
      }
    }

    if (targetAdminId) {
      try {
        // Revokes every family this admin has (logging out of all devices,
        // matching the Supabase backend's own scope=global GoTrue revocation
        // — see data/supabase/authClients.js's revokeGoTrueSession()), not
        // just the one session's family admin_rt happens to belong to.
        //
        // Review follow-up: revoking RefreshToken docs alone left a real
        // race open. A refresh request that atomically claimed an old,
        // still-valid token an instant before this logout request lands is
        // still free to mint and return a brand-new successor token AFTER
        // this sweep has already run and returned -- issueRefreshToken()'s
        // post-insert self-check only catches itself by reading
        // TokenFamily.revoked, and if this never sets that flag, the
        // self-check sees revoked:false and the new token survives logout
        // alive. Setting TokenFamily.revoked=true for every one of this
        // admin's families BEFORE the RefreshToken sweep closes this:
        // whichever of {this logout's flag-write, that refresh's
        // post-insert check} runs second is guaranteed to observe the
        // other's effect. See tests/admin-logout-refresh-race.test.js for a
        // deterministic reproduction against the real HTTP endpoints.
        //
        // `upsert: true` additionally covers families minted before the
        // TokenFamily collection existed at all (no doc for them yet) --
        // without it, a legacy family with no TokenFamily row would
        // silently have nothing to set, and a refresh racing THIS logout
        // for one of those old families would still slip through.
        const families = await RefreshToken.distinct('family', { adminId: targetAdminId });
        if (families.length > 0) {
          await Promise.all(families.map((family) => TokenFamily.updateOne(
            { family },
            { $set: { revoked: true, revokedAt: new Date(), lastActivityAt: new Date(), adminId: targetAdminId } },
            { upsert: true },
          )));
        }
        await RefreshToken.updateMany({ adminId: targetAdminId, revoked: false }, { revoked: true });
      } catch (err) {
        // Review follow-up: a DB error here (MongoDB unreachable, a query
        // timeout, ...) must never prevent the local cookie clearing below
        // — an admin must never be stuck looking "logged in" in their own
        // browser just because the database that would have revoked their
        // sessions was itself unavailable. The failure is still logged (not
        // silently swallowed), just never allowed to abort the response.
        logger.error('Admin logout: session revoke failed (DB unavailable or query error) — cookies are still cleared locally', {
          adminId: String(targetAdminId),
          error:   err.message,
        });
      }
    }

    // Review follow-up: an audit-write failure (e.g. a transient Mongo
    // error) must never prevent this app's own cookies from being cleared
    // locally either — same reasoning as the revoke failure above.
    if (req.adminUser) {
      try {
        await auditFromAdmin(req.adminUser, 'auth.logout', req);
      } catch (err) {
        logger.error('Admin logout: audit write failed — cookies are still cleared locally', {
          adminId: String(targetAdminId ?? ''),
          error:   err.message,
        });
      }
    }
  } finally {
    // Review follow-up: this must run regardless of anything above —
    // including a failure this function's own try/catch blocks did not
    // anticipate — so this app's own cookies are cleared locally whenever
    // this route is reached at all, MongoDB up or down. res.clearCookie()
    // only stages Set-Cookie headers; it does not itself end the response,
    // so this is safe even if control later reaches an error handler
    // instead of the res.json() call below.
    res.clearCookie(ACCESS_TOKEN_COOKIE,  { path: '/api/v1/admin' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth' });
    clearLegacyRefreshCookie(res); // see its own comment (utils/adminAuthTokens.js) — Path migration
  }

  return res.json({ message: 'Logged out successfully' });
}
