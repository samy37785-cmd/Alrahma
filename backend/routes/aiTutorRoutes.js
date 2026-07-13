import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { aiTutorLimiter } from '../config/rateLimit.js';
import {
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  sendMessage,
  sendMessageValidation,
} from '../controllers/aiTutorController.js';

const router = Router();
router.use(protect);

router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);
router.post('/conversations/:id/messages', aiTutorLimiter, sendMessageValidation, sendMessage);

export default router;
