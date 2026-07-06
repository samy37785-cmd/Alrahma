import { Router } from 'express';
import {
  register, login, logout, getMe, updateMe, forgotPassword, resetPassword, getLinkCode, googleAuth,
  registerValidation, loginValidation,
} from '../controllers/authController.js';
import {
  listUsers, listTeachers, adminCreateUser, updateUserRole,
  assignTeacher, setFamilyName, updateUserSubscription,
} from '../controllers/userAdminController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { ipWhitelist } from '../middleware/ipWhitelist.js';

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

// Admin user management — restricted to admin-role users from whitelisted IPs.
// NOTE: these use the regular User JWT, not the full AdminUser+MFA system.
// TODO: migrate to /api/v1/admin router once the admin frontend is updated.
router.get('/users', protect, adminOnly, ipWhitelist, listUsers);
router.post('/users', protect, adminOnly, ipWhitelist, adminCreateUser);
router.get('/teachers', protect, adminOnly, ipWhitelist, listTeachers);
router.patch('/users/:id/subscription', protect, adminOnly, ipWhitelist, updateUserSubscription);
router.patch('/users/:id/role', protect, adminOnly, ipWhitelist, updateUserRole);
router.patch('/users/:id/teacher', protect, adminOnly, ipWhitelist, assignTeacher);
router.patch('/users/:id/family', protect, adminOnly, ipWhitelist, setFamilyName);

export default router;
