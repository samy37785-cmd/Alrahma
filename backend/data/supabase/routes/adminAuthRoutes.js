// Mirrors backend/routes/v1/admin/authRoutes.js exactly (same paths,
// methods, rate limiters, validation) — only the controller implementation
// differs. Mounted at /api/v1/admin/auth by routes/v1/admin/index.js only
// when DATA_BACKEND=supabase. verifyAccessToken (middleware/adminAuth.js) is
// shared across both backends — it already branches internally.
import { Router } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { loginLimiter, mfaLimiter, refreshLimiter } from '../../../config/adminRateLimits.js';
import { verifyAccessToken } from '../../../middleware/adminAuth.js';
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
router.post('/logout',      verifyAccessToken,                  asyncHandler(logout));

export default router;
