import { Router } from 'express';
import {
  register, login, logout, getMe, updateMe, forgotPassword, resetPassword, getLinkCode, googleAuth,
} from '../controllers/authController.js';
import {
  listUsers, listTeachers, adminCreateUser, updateUserRole,
  assignTeacher, setFamilyName, updateUserSubscription,
} from '../controllers/userAdminController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Google One-Tap / Sign In with Google
router.post('/google', googleAuth);

// Student: code a parent uses to link to them.
router.get('/link-code', protect, getLinkCode);

// Admin user management
router.get('/users', protect, adminOnly, listUsers);
router.post('/users', protect, adminOnly, adminCreateUser);
router.get('/teachers', protect, adminOnly, listTeachers);
router.patch('/users/:id/subscription', protect, adminOnly, updateUserSubscription);
router.patch('/users/:id/role', protect, adminOnly, updateUserRole);
router.patch('/users/:id/teacher', protect, adminOnly, assignTeacher);
router.patch('/users/:id/family', protect, adminOnly, setFamilyName);

export default router;
