import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';

import env from '../config/env.js';
import AdminUser from '../models/AdminUser.js';
import RefreshToken from '../models/RefreshToken.js';
import { signAccessToken } from '../utils/adminAuthTokens.js';
import { anonymizeIp } from '../config/encryption.js';
import { hashToken } from '../utils/hashToken.js';

/**
 * Admin session mechanics — the TOTP/pre-auth/refresh-rotation domain that
 * previously lived inline in adminAuthController.js. The controller keeps
 * the HTTP surface (cookies, statuses, audit calls); this module owns token
 * families and their invariants, and is unit-testable without HTTP.
 *
 * Results follow one shape: { ok: true, ...data } | { ok: false, status,
 * message, code? } — the controller maps them onto responses 1:1.
 */

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateRawRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function issueRefreshToken(adminId, family, { userAgent, ip }) {
  const raw       = generateRawRefreshToken();
  const tokenHash = hashToken(raw);
  await RefreshToken.create({
    tokenHash,
    adminId,
    family,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: userAgent ?? null,
    ipAnon:    anonymizeIp(ip ?? ''),
  });
  return raw;
}

/**
 * Verifies the short-lived pre-auth JWT issued by login stage 1 and checks
 * it carries the expected stage claim ('mfa' or 'mfa_setup').
 */
export function verifyPreAuthStage(token, expectedStage, stageMismatchMessage) {
  if (!token) return { ok: false, status: 401, message: 'Pre-auth token missing' };

  let decoded;
  try {
    decoded = jwt.verify(token, env.ADMIN_JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch {
    return { ok: false, status: 401, message: 'Invalid or expired pre-auth token' };
  }

  if (decoded.stage !== expectedStage) {
    return { ok: false, status: 403, message: stageMismatchMessage };
  }
  return { ok: true, decoded };
}

/** TOTP check with the standard ±1 window. */
export function verifyTotpCode(secret, token) {
  return speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
}

/**
 * Starts a full admin session: fresh token family, refresh token persisted,
 * access token signed. Returns both raw tokens for the controller to set as
 * cookies.
 */
export async function startAdminSession(admin, { userAgent, ip }) {
  const accessToken = signAccessToken(admin._id, admin.role, true);
  const family      = crypto.randomUUID();
  const rawRefresh  = await issueRefreshToken(admin._id, family, { userAgent, ip });
  return { accessToken, rawRefresh };
}

/**
 * Rotates a refresh token (one-time use). Reuse of an already-rotated token
 * signals theft: the entire family is revoked and the caller must clear the
 * session cookies ({ code: 'TOKEN_REUSE' }).
 */
export async function rotateAdminSession(rawRefresh, { userAgent, ip }) {
  if (!rawRefresh) return { ok: false, status: 401, message: 'Refresh token missing' };

  const tokenHash = hashToken(rawRefresh);
  const stored    = await RefreshToken.findOne({ tokenHash });

  if (!stored) {
    return { ok: false, status: 401, message: 'Refresh token not recognized' };
  }

  if (stored.usedAt || stored.revoked) {
    await RefreshToken.updateMany({ family: stored.family }, { revoked: true });
    return {
      ok:      false,
      status:  401,
      code:    'TOKEN_REUSE',
      message: 'Refresh token reuse detected. All sessions for this device have been revoked.',
    };
  }

  if (stored.expiresAt < new Date()) {
    return { ok: false, status: 401, code: 'TOKEN_EXPIRED', message: 'Refresh token expired' };
  }

  const admin = await AdminUser.findById(stored.adminId).lean();
  if (!admin || !admin.isActive) {
    return { ok: false, status: 401, message: 'Account not found or deactivated' };
  }

  // Mark old token as used (one-time rotation), then reissue in-family.
  stored.usedAt = new Date();
  await stored.save();

  const accessToken = signAccessToken(admin._id, admin.role, true);
  const rawNew      = await issueRefreshToken(admin._id, stored.family, { userAgent, ip });

  return { ok: true, accessToken, rawRefresh: rawNew };
}

/**
 * Logout revocation. With a refresh cookie, revokes that token's family.
 * Without one (the refresh cookie is path-scoped to /auth/refresh, so real
 * browsers never send it to /logout), falls back to revoking every active
 * refresh token for the admin — logging out everywhere is safer than
 * silently revoking nothing.
 */
export async function revokeAdminSessions({ rawRefresh, adminId }) {
  if (rawRefresh) {
    const tokenHash = hashToken(rawRefresh);
    const stored    = await RefreshToken.findOne({ tokenHash }).lean();
    if (stored) {
      await RefreshToken.updateMany({ family: stored.family }, { revoked: true });
    }
  } else if (adminId) {
    await RefreshToken.updateMany({ adminId, revoked: false }, { revoked: true });
  }
}
