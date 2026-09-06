// Mirrors backend/routes/notificationRoutes.js exactly (same paths, methods,
// `protect` middleware applied to the whole router) — only the controller
// implementation differs. Mounted at /api/notifications by app.js only when
// DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import {
  getMyNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  getUnreadCount,
} from '../notificationController.js';

const router = Router();

router.use(protect);

router.get('/',           getMyNotifications);
router.get('/unread',     getUnreadCount);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);
router.delete('/:id',     deleteNotification);

export default router;
