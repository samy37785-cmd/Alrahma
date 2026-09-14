import { Router } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { loginLimiter, mfaLimiter, refreshLimiter } from '../../../config/adminRateLimits.js';
import { identifyAdminForLogout } from '../../../middleware/adminAuth.js';
import {
  login,           loginValidation,
  setupMfa,
  confirmMfaSetup, mfaTokenValidation,
  verifyMfaLogin,
  refreshTokens,
  logout,
} from '../../../controllers/adminAuthController.js';

const router = Router();

// Stage 1: password authentication
router.post('/login',       loginLimiter,   loginValidation,    asyncHandler(login));

// Stage 2a: MFA not yet set up — generate TOTP secret + QR code
router.post('/mfa/setup',   mfaLimiter,                         asyncHandler(setupMfa));

// Stage 2b: confirm new TOTP secret (first-time activation)
router.post('/mfa/confirm', mfaLimiter,     mfaTokenValidation, asyncHandler(confirmMfaSetup));

// Stage 2c: verify TOTP code on subsequent logins
router.post('/mfa/verify',  mfaLimiter,     mfaTokenValidation, asyncHandler(verifyMfaLogin));

// Token rotation (access token expired → use refresh token)
router.post('/refresh',     refreshLimiter,                     asyncHandler(refreshTokens));

// Logout (revokes refresh token family). Deliberately NOT verifyAccessToken
// — an expired admin_at must never block logout, see identifyAdminForLogout's
// own comment (middleware/adminAuth.js) for why.
router.post('/logout',      identifyAdminForLogout,             asyncHandler(logout));

export default router;
