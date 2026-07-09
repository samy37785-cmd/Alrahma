import { Router } from 'express';
import {
  register, login, logout, getMe, updateMe, forgotPassword, resetPassword, getLinkCode, googleAuth,
  registerValidation, loginValidation,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Google One-Tap / Sign In with Google
router.post('/google', googleAuth);

// Student: code a parent uses to link to them.
router.get('/link-code', protect, getLinkCode);

export default router;
