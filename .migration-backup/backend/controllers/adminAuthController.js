import env from '../config/env.js';
import speakeasy from 'speakeasy';
import qrcode    from 'qrcode';
import jwt       from 'jsonwebtoken';

import AdminUser    from '../models/AdminUser.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from '../utils/adminAuthTokens.js';
import { anonymizeIp } from '../config/encryption.js';
import { handleValidationErrors } from '../utils/validationHelper.js';
import { auditFromAdmin } from '../services/auditService.js';
import {
  verifyPreAuthStage,
  verifyTotpCode,
  startAdminSession,
  rotateAdminSession,
  revokeAdminSessions,
} from '../services/adminSessionService.js';

// Session mechanics (token families, rotation, TOTP verification) live in
// services/adminSessionService.js — this controller owns the HTTP surface:
// request validation, cookies, status mapping, and audit logging.

function sessionMeta(req) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

function setSessionCookies(res, { accessToken, rawRefresh }) {
  res
    .cookie(ACCESS_TOKEN_COOKIE,  accessToken, accessCookieOptions())
    .cookie(REFRESH_TOKEN_COOKIE, rawRefresh,  refreshCookieOptions());
}

function clearSessionCookies(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE,  { path: '/api/v1/admin' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/v1/admin/auth/refresh' });
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
    env.ADMIN_JWT_ACCESS_SECRET,
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
  const pre = verifyPreAuthStage(
    req.cookies?.[ACCESS_TOKEN_COOKIE],
    'mfa_setup',
    'MFA setup not required at this stage',
  );
  if (!pre.ok) return res.status(pre.status).json({ message: pre.message });

  const admin = await AdminUser.findById(pre.decoded.id).select('+_mfaPendingSecret');
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

  const pre = verifyPreAuthStage(
    req.cookies?.[ACCESS_TOKEN_COOKIE],
    'mfa_setup',
    'MFA confirmation not expected at this stage',
  );
  if (!pre.ok) return res.status(pre.status).json({ message: pre.message });

  const admin = await AdminUser.findById(pre.decoded.id).select('+_mfaPendingSecret');
  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: 'Account not found or deactivated' });
  }

  const pendingSecret = admin.getMfaPendingSecret();
  if (!pendingSecret) {
    return res.status(400).json({ message: 'No pending MFA setup found. Run /mfa/setup first.' });
  }

  if (!verifyTotpCode(pendingSecret, req.body.token)) {
    return res.status(400).json({ message: 'Invalid TOTP code' });
  }

  // Promote pending secret to active and enable MFA
  admin.setMfaSecret(pendingSecret);
  admin.setMfaPendingSecret(null);
  admin.mfaEnabled = true;
  await admin.save({ validateBeforeSave: false });

  setSessionCookies(res, await startAdminSession(admin, sessionMeta(req)));

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

  const pre = verifyPreAuthStage(
    req.cookies?.[ACCESS_TOKEN_COOKIE],
    'mfa',
    'MFA verification not expected at this stage',
  );
  if (!pre.ok) return res.status(pre.status).json({ message: pre.message });

  const admin = await AdminUser.findById(pre.decoded.id).select('+_mfaSecret');
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

  if (!verifyTotpCode(mfaSecret, req.body.token)) {
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

  setSessionCookies(res, await startAdminSession(admin, sessionMeta(req)));

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
 * is revoked immediately (signals token theft) and the cookies are cleared.
 */
export async function refreshTokens(req, res) {
  const result = await rotateAdminSession(
    req.cookies?.[REFRESH_TOKEN_COOKIE],
    sessionMeta(req),
  );

  if (!result.ok) {
    if (result.code === 'TOKEN_REUSE') clearSessionCookies(res);
    return res.status(result.status).json({
      message: result.message,
      ...(result.code ? { code: result.code } : {}),
    });
  }

  setSessionCookies(res, result);

  return res.json({ message: 'Tokens refreshed' });
}

// ── POST /api/v1/admin/auth/logout ───────────────────────────────────────────
/**
 * Revokes the current refresh token family and clears cookies.
 */
export async function logout(req, res) {
  await revokeAdminSessions({
    rawRefresh: req.cookies?.[REFRESH_TOKEN_COOKIE],
    adminId:    req.adminId,
  });

  if (req.adminUser) {
    await auditFromAdmin(req.adminUser, 'auth.logout', req);
  }

  clearSessionCookies(res);

  return res.json({ message: 'Logged out successfully' });
}
