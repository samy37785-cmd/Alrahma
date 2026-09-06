// Mirrors backend/routes/authRoutes.js exactly (same paths, methods,
// validation, `protect` middleware) — only the controller implementation
// differs. Mounted at /api/auth by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import {
  register, login, logout, getMe, updateMe, forgotPassword, resetPassword, getLinkCode, googleAuth,
  registerValidation, loginValidation,
} from '../authController.js';
import { protect } from '../../../middleware/auth.js';

const router = Router();

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/google', googleAuth);
router.get('/link-code', protect, getLinkCode);

export default router;
