import { Router } from 'express';
import {
  register, login, logout, getMe, updateMe, forgotPassword, resetPassword, getLinkCode, googleAuth,
  registerValidation, loginValidation,
} from '../controllers/authController.js';
import {
  listUsers, listTeachers, adminCreateUser, updateUserRole,
  assignTeacher, setFamilyName, updateUserSubscription,
} from '../controllers/userAdminController.js';
import { protect, adminOnly, requireStepUp } from '../middleware/auth.js';
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
// Interim hardening until that migration: every mutating route below also
// requires requireStepUp (re-submitted current password) as a stand-in for
// the MFA this path otherwise lacks. Read-only routes are unaffected.
router.get('/users', protect, adminOnly, ipWhitelist, listUsers);
router.post('/users', protect, adminOnly, ipWhitelist, requireStepUp, adminCreateUser);
router.get('/teachers', protect, adminOnly, ipWhitelist, listTeachers);
router.patch('/users/:id/subscription', protect, adminOnly, ipWhitelist, requireStepUp, updateUserSubscription);
router.patch('/users/:id/role', protect, adminOnly, ipWhitelist, requireStepUp, updateUserRole);
router.patch('/users/:id/teacher', protect, adminOnly, ipWhitelist, requireStepUp, assignTeacher);
router.patch('/users/:id/family', protect, adminOnly, ipWhitelist, requireStepUp, setFamilyName);

export default router;
