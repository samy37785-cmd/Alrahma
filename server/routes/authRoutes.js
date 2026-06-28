import { Router } from 'express';
import { register, login, getMe, updateMe, listUsers, forgotPassword, resetPassword, updateUserSubscription } from '../controllers/authController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/users', protect, adminOnly, listUsers);
router.patch('/users/:id/subscription', protect, adminOnly, updateUserSubscription);

export default router;
