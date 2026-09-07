// Mirrors backend/routes/messageRoutes.js exactly. Mounted at /api/messages
// by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { getContacts, getConversation, sendMessage, getUnreadCount } from '../messageController.js';

const router = Router();

router.use(protect);

router.get('/contacts', getContacts);
router.get('/unread/count', getUnreadCount);
router.post('/', sendMessage);
router.get('/:userId', getConversation);

export default router;
