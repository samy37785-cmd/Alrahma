import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getContacts,
  getConversation,
  sendMessage,
  getUnreadCount,
} from '../controllers/messageController.js';

const router = Router();

router.use(protect);

router.get('/contacts', getContacts);
router.get('/unread/count', getUnreadCount);
router.post('/', sendMessage);
router.get('/:userId', getConversation); // keep after the static routes above

export default router;
