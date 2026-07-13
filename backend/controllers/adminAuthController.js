import crypto    from 'crypto';
import speakeasy from 'speakeasy';
import qrcode    from 'qrcode';
import jwt       from 'jsonwebtoken';

import AdminUser    from '../models/AdminUser.js';
import RefreshToken  from '../models/RefreshToken.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  signAccessToken,
} from '../utils/adminAuthTokens.js';
import { anonymizeIp } from '../config/encryption.js';
import { hashToken } from '../utils/hashToken.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { auditFromAdmin } from '../services/auditService.js';

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
  return raw;
}

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
  const rawRefresh  = await issueRefreshToken(admin._id, family, req);

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

  // Enforce the per-account lock here too, not just at the password stage.
  // Failed TOTP attempts below increment the same failedLoginAttempts
  // counter that locks the account — without this check, a caller holding a
  // still-valid 10-minute pre-auth token could keep brute-forcing TOTP codes
  // after the lock engaged, bounded only by the per-IP mfaLimiter.
  if (admin.isLocked()) {
    return res.status(423).json({
      message: 'Account temporarily locked. Too many failed login attempts.',
      code:    'ACCOUNT_LOCKED',
    });
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
  const rawRefresh  = await issueRefreshToken(admin._id, family, req);

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
  const stored    = await RefreshToken.findOne({ tokenHash });

  if (!stored) {
    return res.status(401).json({ message: 'Refresh token not recognized' });
  }

  // Reuse detection: token was already rotated — revoke entire family
  if (stored.usedAt || stored.revoked) {
    await RefreshToken.updateMany({ family: stored.family }, { revoked: true });
    res.clearCookie(ACCESS_TOKEN_COOKIE,  { path: '/api/v1/admin' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth/refresh' });
    return res.status(401).json({
      message: 'Refresh token reuse detected. All sessions for this device have been revoked.',
      code:    'TOKEN_REUSE',
    });
  }

  if (stored.expiresAt < new Date()) {
    return res.status(401).json({ message: 'Refresh token expired', code: 'TOKEN_EXPIRED' });
  }

  const admin = await AdminUser.findById(stored.adminId).lean();
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Account not found or deactivated' });
  }

  // Mark old token as used (one-time rotation)
  stored.usedAt = new Date();
  await stored.save();

  // Issue new token pair in the same family
  const accessToken = signAccessToken(admin._id, admin.role, true);
  const rawNew      = await issueRefreshToken(admin._id, stored.family, req);

  res
    .cookie(ACCESS_TOKEN_COOKIE,  accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, rawNew,      refreshCookieOptions());

  return res.json({ message: 'Tokens refreshed' });
}

// ── POST /api/v1/admin/auth/logout ───────────────────────────────────────────
/**
 * Revokes the current refresh token family and clears cookies.
 */
export async function logout(req, res) {
  const rawRefresh = req.cookies?.[REFRESH_TOKEN_COOKIE];

  if (rawRefresh) {
    const tokenHash = hashToken(rawRefresh);
    const stored    = await RefreshToken.findOne({ tokenHash }).lean();
    if (stored) {
      await RefreshToken.updateMany({ family: stored.family }, { revoked: true });
    }
  } else if (req.adminId) {
    // The refresh cookie is deliberately path-scoped to /auth/refresh only
    // (refreshCookieOptions), so a real browser never actually sends it on a
    // request to /logout -- meaning the branch above never ran in practice,
    // and refresh tokens were never revoked on logout at all. Without the
    // cookie we can't identify one specific family, so fall back to revoking
    // every active refresh token for this admin: logging out everywhere is
    // safer than the previous behavior of silently revoking nothing.
    await RefreshToken.updateMany({ adminId: req.adminId, revoked: false }, { revoked: true });
  }

  if (req.adminUser) {
    await auditFromAdmin(req.adminUser, 'auth.logout', req);
  }

  res.clearCookie(ACCESS_TOKEN_COOKIE,  { path: '/api/v1/admin' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth/refresh' });

  return res.json({ message: 'Logged out successfully' });
}
