// Mirrors backend/routes/v1/admin/authRoutes.js exactly (same paths,
// methods, rate limiters, validation) — only the controller implementation
// differs. Mounted at /api/v1/admin/auth by routes/v1/admin/index.js only
// when DATA_BACKEND=supabase. verifyAccessToken and identifyAdminForLogout
// (middleware/adminAuth.js) are both shared across backends — each already
// branches internally.
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
} from '../adminAuthController.js';

const router = Router();

router.post('/login',       loginLimiter,   loginValidation,    asyncHandler(login));
router.post('/mfa/setup',   mfaLimiter,                         asyncHandler(setupMfa));
router.post('/mfa/confirm', mfaLimiter,     mfaTokenValidation, asyncHandler(confirmMfaSetup));
router.post('/mfa/verify',  mfaLimiter,     mfaTokenValidation, asyncHandler(verifyMfaLogin));
router.post('/refresh',     refreshLimiter,                     asyncHandler(refreshTokens));
// Deliberately NOT verifyAccessToken — an expired admin_at must never block
// logout, see identifyAdminForLogout's own comment (middleware/adminAuth.js).
router.post('/logout',      identifyAdminForLogout,             asyncHandler(logout));

export default router;
